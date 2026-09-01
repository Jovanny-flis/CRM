'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verificarToken, revisarRol, validarRecursoEmpresa } = require('../middlewares/authMiddleware');
const { empresaGrouerId, empresaFlisingId } = require('./empresas-env');
const {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    CODIGO_ENVIADO_A_FLISING,
    asegurarCatalogoEstatus,
    obtenerEstatusPorCodigo,
    esCancelado,
} = require('./estatus-leads');
const { registrarEtapaInicial } = require('./lead-etapas-historial');
const {
    NOMBRE_CANAL_CORRETAJE,
    ROLES_AGENTE_FLISING,
    truncar,
    resolverMotivoCancelacion,
    agenteFlisingElegible,
} = require('./envio-flising-reglas');

const ROLES_OPERADOR_ENVIO = ['super_admin', 'admin_empresa', 'supervisor', 'agente'];

class ErrorHttp extends Error {
    constructor(status, mensaje, code) {
        super(mensaje);
        this.status = status;
        this.code = code || null;
    }
}

function esDuplicadoUnico(err) {
    return err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

async function asegurarCanalCorretaje(dbOrConn, empresaId) {
    const [filas] = await dbOrConn.query(
        'SELECT id, nombre FROM lead_sources WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_CANAL_CORRETAJE],
    );
    if (filas[0]) return filas[0];
    const id = crypto.randomUUID();
    await dbOrConn.query(
        'INSERT INTO lead_sources (id, empresa_id, nombre, parent_id) VALUES (?, ?, ?, NULL)',
        [id, empresaId, NOMBRE_CANAL_CORRETAJE],
    );
    return { id, nombre: NOMBRE_CANAL_CORRETAJE };
}

async function resolverSemillaFlising() {
    const grouerId = empresaGrouerId();
    const flisingId = empresaFlisingId();
    if (flisingId == null) {
        throw new ErrorHttp(503, 'Semilla FLISING incompleta.', 'flising_no_configurado');
    }
    if (grouerId != null && Number(flisingId) === Number(grouerId)) {
        throw new ErrorHttp(503, 'FLISING_EMPRESA_ID no puede ser la empresa GROUER.', 'flising_id_invalido');
    }

    const db = pool.promise();
    const [empresas] = await db.query(
        'SELECT id FROM empresas WHERE id = ? LIMIT 1',
        [flisingId],
    );
    if (!empresas.length) {
        throw new ErrorHttp(503, 'Semilla FLISING incompleta.', 'flising_empresa_ausente');
    }

    const [pipelines] = await db.query(
        'SELECT id, nombre FROM pipelines WHERE empresa_id = ? ORDER BY id ASC',
        [flisingId],
    );
    if (!pipelines.length) {
        throw new ErrorHttp(503, 'Semilla FLISING incompleta: no hay pipeline.', 'flising_pipeline_ausente');
    }
    if (pipelines.length > 1) {
        throw new ErrorHttp(
            503,
            'Hay más de un pipeline en FLISING; este corte asume uno solo.',
            'flising_pipeline_ambiguo',
        );
    }

    const [etapas] = await db.query(
        'SELECT id FROM pipeline_stages WHERE pipeline_id = ? AND orden = 1 LIMIT 1',
        [pipelines[0].id],
    );
    if (!etapas.length) {
        throw new ErrorHttp(503, 'Semilla FLISING incompleta: no hay primer bin.', 'flising_etapa_ausente');
    }

    await asegurarCanalCorretaje(db, flisingId);
    await asegurarCatalogoEstatus(pool, flisingId);

    const estatus = await obtenerEstatusPorCodigo(pool, flisingId, CODIGO_ACTIVO);
    if (!estatus) {
        throw new ErrorHttp(503, 'Semilla FLISING incompleta.', 'flising_estatus_ausente');
    }

    return {
        empresaId: flisingId,
        pipelineId: pipelines[0].id,
        stageId: etapas[0].id,
        estatusActivoId: estatus.id,
        medio: NOMBRE_CANAL_CORRETAJE,
    };
}

async function listarAgentesFlising() {
    const semilla = await resolverSemillaFlising();
    const db = pool.promise();
    const placeholders = ROLES_AGENTE_FLISING.map(() => '?').join(', ');
    const [filas] = await db.query(
        `SELECT id, nombre, email, rol
         FROM usuarios
         WHERE empresa_id = ? AND rol IN (${placeholders})
         ORDER BY nombre ASC`,
        [semilla.empresaId, ...ROLES_AGENTE_FLISING],
    );
    return filas;
}

async function marcarLeadCancelado(poolOrDb, leadId, motivo) {
    const db = poolOrDb.promise ? poolOrDb.promise() : poolOrDb;
    const [leads] = await db.query(
        `SELECT l.id, l.empresa_id, e.codigo AS estatus_codigo
         FROM leads l
         LEFT JOIN lead_estatus e ON e.id = l.estatus_id
         WHERE l.id = ?
         LIMIT 1`,
        [leadId],
    );
    if (!leads.length) return { cancelado: false, razon: 'no_existe' };
    if (esCancelado(leads[0])) return { cancelado: false, razon: 'ya_cancelado' };

    const empresaId = leads[0].empresa_id;
    await asegurarCatalogoEstatus(pool, empresaId);
    const estatus = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_CANCELADO);
    if (!estatus) {
        throw new ErrorHttp(503, 'Semilla de estatus incompleta.', 'estatus_cancelado_ausente');
    }

    await db.query(
        `UPDATE leads
         SET estatus_id = ?, motivo_desactivacion = ?, desactivado_at = CURRENT_TIMESTAMP, activo = 0
         WHERE id = ?`,
        [estatus.id, resolverMotivoCancelacion(motivo), leadId],
    );
    return { cancelado: true, lead_id: leadId };
}

async function cancelarClonSiExiste(poolOrDb, grouerLeadId, motivo) {
    const db = poolOrDb.promise ? poolOrDb.promise() : poolOrDb;
    const [filas] = await db.query(
        'SELECT flising_lead_id FROM leads_origen_grouer WHERE lead_id = ? LIMIT 1',
        [grouerLeadId],
    );
    const flisingLeadId = filas[0] && filas[0].flising_lead_id;
    if (!flisingLeadId) return { cancelado: false, razon: 'sin_clon' };
    return marcarLeadCancelado(pool, flisingLeadId, motivo);
}

function exigirOperadorGrouer(req, leadEmpresaId) {
    const grouerId = empresaGrouerId();
    if (grouerId == null) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.', 'grouer_no_configurado');
    }
    if (Number(leadEmpresaId) !== Number(grouerId)) {
        throw new ErrorHttp(403, 'Solo se pueden enviar prospectos de la empresa GROUER.', 'no_es_grouer');
    }
    const usuario = req.usuarioCRM;
    if (!usuario) {
        throw new ErrorHttp(403, 'No tienes permisos suficientes para ver esto.', 'sin_perfil');
    }
    if (usuario.rol !== 'super_admin' && Number(usuario.empresa_id) !== Number(grouerId)) {
        throw new ErrorHttp(403, 'No tienes acceso a este recurso.', 'empresa_distinta');
    }
}

async function cargarOrigenGrouer(dbOrConn, leadId) {
    const [filas] = await dbOrConn.query(
        `SELECT l.id, l.empresa_id, l.nombre, l.correo, l.telefono, l.valor, l.tipo_persona,
                l.estatus_id, e.codigo AS estatus_codigo,
                o.lead_id AS origen_lead_id, o.flising_lead_id, o.asignado_flising_usuario_id
         FROM leads l
         LEFT JOIN lead_estatus e ON e.id = l.estatus_id
         LEFT JOIN leads_origen_grouer o ON o.lead_id = l.id
         WHERE l.id = ?
         LIMIT 1`,
        [leadId],
    );
    return filas[0] || null;
}

async function enviarProspectoAFlising(leadId, usuarioDestinoId) {
    const agenteId = truncar(usuarioDestinoId, 36);
    if (!agenteId) {
        throw new ErrorHttp(400, 'Indica a qué agente de FLISING se asigna este prospecto.', 'usuario_id_requerido');
    }

    const db = pool.promise();
    const lead = await cargarOrigenGrouer(db, leadId);
    if (!lead) {
        throw new ErrorHttp(404, 'Lead no encontrado.', 'lead_ausente');
    }
    if (!lead.origen_lead_id) {
        throw new ErrorHttp(400, 'Este prospecto no proviene de GROUER.', 'no_origen_grouer');
    }
    if (esCancelado(lead)) {
        throw new ErrorHttp(400, 'No se puede enviar un prospecto cancelado.', 'lead_cancelado');
    }
    if (lead.flising_lead_id) {
        return {
            lead_id: lead.id,
            flising_lead_id: lead.flising_lead_id,
            duplicado: true,
        };
    }

    const semilla = await resolverSemillaFlising();
    const [agentes] = await db.query(
        'SELECT id, nombre, rol, empresa_id FROM usuarios WHERE id = ? LIMIT 1',
        [agenteId],
    );
    if (!agentes.length || !agenteFlisingElegible(agentes[0], semilla.empresaId)) {
        throw new ErrorHttp(400, 'El agente elegido no pertenece a FLISING.', 'agente_invalido');
    }

    await asegurarCatalogoEstatus(pool, lead.empresa_id);
    const estatusEnviado = await obtenerEstatusPorCodigo(pool, lead.empresa_id, CODIGO_ENVIADO_A_FLISING);
    if (!estatusEnviado) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.', 'estatus_enviado_ausente');
    }

    const clonId = crypto.randomUUID();
    const conn = await pool.promise().getConnection();
    try {
        await conn.beginTransaction();
        const [lock] = await conn.query(
            'SELECT flising_lead_id FROM leads_origen_grouer WHERE lead_id = ? FOR UPDATE',
            [leadId],
        );
        if (!lock.length) {
            throw new ErrorHttp(400, 'Este prospecto no proviene de GROUER.', 'no_origen_grouer');
        }
        if (lock[0].flising_lead_id) {
            await conn.rollback();
            return {
                lead_id: leadId,
                flising_lead_id: lock[0].flising_lead_id,
                duplicado: true,
            };
        }

        const valor = Number(lead.valor);
        if (!Number.isFinite(valor) || valor <= 0) {
            throw new ErrorHttp(400, 'El valor estimado es obligatorio y debe ser mayor a cero.', 'valor_invalido');
        }

        await conn.query(
            `INSERT INTO leads (
                id, empresa_id, usuario_id, stage_id, nombre, correo, telefono,
                valor, medio, tipo_persona, estatus_id, activo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                clonId,
                semilla.empresaId,
                agenteId,
                semilla.stageId,
                truncar(lead.nombre, 150) || 'Prospecto GROUER',
                truncar(lead.correo, 150),
                truncar(lead.telefono, 50),
                valor,
                semilla.medio,
                lead.tipo_persona || null,
                semilla.estatusActivoId,
            ],
        );

        await conn.query(
            `UPDATE leads_origen_grouer
             SET flising_lead_id = ?, enviado_a_flising_at = CURRENT_TIMESTAMP,
                 asignado_flising_usuario_id = ?
             WHERE lead_id = ?`,
            [clonId, agenteId, leadId],
        );

        await conn.query(
            'UPDATE leads SET estatus_id = ? WHERE id = ?',
            [estatusEnviado.id, leadId],
        );

        await conn.commit();
    } catch (errTx) {
        await conn.rollback();
        if (esDuplicadoUnico(errTx)) {
            const otra = await cargarOrigenGrouer(db, leadId);
            if (otra && otra.flising_lead_id) {
                return {
                    lead_id: leadId,
                    flising_lead_id: otra.flising_lead_id,
                    duplicado: true,
                };
            }
        }
        throw errTx;
    } finally {
        conn.release();
    }

    await registrarEtapaInicial(pool, clonId, semilla.stageId);
    console.log(`GROUER envio flising lead_id=${leadId} flising_lead_id=${clonId} agente=${agenteId}`);
    return {
        lead_id: leadId,
        flising_lead_id: clonId,
        duplicado: false,
    };
}

router.get(
    '/api/leads/:id/agentes-flising',
    verificarToken,
    revisarRol(ROLES_OPERADOR_ENVIO),
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        try {
            const db = pool.promise();
            const lead = await cargarOrigenGrouer(db, id);
            if (!lead) {
                return res.status(404).json({ error: 'Lead no encontrado.' });
            }
            exigirOperadorGrouer(req, lead.empresa_id);
            if (!lead.origen_lead_id) {
                return res.status(400).json({ error: 'Este prospecto no proviene de GROUER.' });
            }
            const agentes = await listarAgentesFlising();
            return res.status(200).json({ agentes });
        } catch (err) {
            if (err instanceof ErrorHttp) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            console.error('Error listando agentes FLISING lead_id=', id, err.message);
            return res.status(500).json({ error: 'Error al listar agentes de FLISING.' });
        }
    },
);

router.post(
    '/api/leads/:id/enviar-flising',
    verificarToken,
    revisarRol(ROLES_OPERADOR_ENVIO),
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        try {
            const db = pool.promise();
            const lead = await cargarOrigenGrouer(db, id);
            if (!lead) {
                return res.status(404).json({ error: 'Lead no encontrado.' });
            }
            exigirOperadorGrouer(req, lead.empresa_id);
            const resultado = await enviarProspectoAFlising(id, body.usuario_id);
            const status = resultado.duplicado ? 200 : 201;
            return res.status(status).json(resultado);
        } catch (err) {
            if (err instanceof ErrorHttp) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            console.error('Error enviando a FLISING lead_id=', id, err.message);
            return res.status(500).json({ error: 'Error al enviar el prospecto a FLISING.' });
        }
    },
);

module.exports = router;
module.exports.NOMBRE_CANAL_CORRETAJE = NOMBRE_CANAL_CORRETAJE;
module.exports.ErrorHttp = ErrorHttp;
module.exports.cancelarClonSiExiste = cancelarClonSiExiste;
module.exports.marcarLeadCancelado = marcarLeadCancelado;
module.exports.enviarProspectoAFlising = enviarProspectoAFlising;
