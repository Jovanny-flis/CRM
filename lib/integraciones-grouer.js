'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verificarTokenGrouer } = require('../middlewares/verificarTokenGrouer');
const { verificarToken, validarRecursoEmpresa } = require('../middlewares/authMiddleware');
const { normalizarTipoPersona } = require('./leads');
const {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    asegurarCatalogoEstatus,
    obtenerEstatusPorCodigo,
    esCancelado,
} = require('./estatus-leads');
const { registrarEtapaInicial } = require('./lead-etapas-historial');
const {
    NOMBRE_EMPRESA,
    NOMBRE_PIPELINE,
    NOMBRE_ROBOT,
    NOMBRE_CANAL,
    ETAPA_NUEVOS,
} = require('../scripts/seed-grouer-comun');

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIVO_CANCELACION_PORTAL = 'canceló en portal';

const CLAVES_CONTACTO = ['nombre_portal', 'email', 'telefono'];
const CLAVES_DOMICILIO = ['calle', 'colonia', 'municipio', 'estado', 'cp'];
const CLAVES_IDENTIDAD = [
    'razon_social',
    'tipo_persona',
    'regimen_fiscal',
    'estatus_contribuyente',
    'domicilio',
];
const CLAVES_SEMAFOROS = [
    'estatus_sat',
    'opinion_sat',
    'lista_69b',
    'insolvencia_contable',
    'inactividad_cfdi',
];
const CLAVES_ACTIVO = [
    'tipo_activo',
    'nombre_activo',
    'marca',
    'modelo',
    'version',
    'anio',
    'color',
    'condicion',
];
const CLAVES_DEAL = [
    'valor_activo',
    'pago_inicial',
    'enganche_pct',
    'monto_financiado',
    'plazo',
    'renta_min',
    'renta_max',
    'tasa_promedio',
];
const CLAVES_VIABILIDAD = [
    'version_features',
    'facturacion_neta_12m',
    'meses_flujo_menor_renta_12m',
    'renta_sobre_flujo_min_12m',
    'ratio_renta_sobre_outflow_12m',
    'meses_flujo_negativo_12m',
    'ltv',
    'current_ratio',
    'apalancamiento',
    'cobertura_fiscal',
    'concentracion_top_cliente_pct',
    'margen_cfdi',
    'antiguedad_empresa_meses',
];

function esUuid(valor) {
    return typeof valor === 'string' && RE_UUID.test(valor.trim());
}

function uuidOpcional(valor) {
    if (valor == null || String(valor).trim() === '') return null;
    const v = String(valor).trim();
    return esUuid(v) ? v : null;
}

function recortar(obj, claves) {
    const src = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    const out = {};
    for (const k of claves) {
        out[k] = Object.prototype.hasOwnProperty.call(src, k) ? src[k] : null;
    }
    return out;
}

function truncar(valor, max) {
    if (valor == null) return null;
    const s = String(valor).trim();
    if (!s) return null;
    return s.slice(0, max);
}

function parsearSnapshotJson(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
    const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function tipoPersonaDesdeRfc(rfc) {
    const limpio = String(rfc || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if (limpio.length === 12) return 'PM';
    if (limpio.length === 13) return 'PF';
    return null;
}

function resolverTipoPersona(identidad, rfc) {
    const crudo = identidad && typeof identidad === 'object' ? identidad.tipo_persona : null;
    const normalizado = normalizarTipoPersona(crudo);
    if (typeof normalizado === 'string') return normalizado;
    const desdeRfc = normalizarTipoPersona(tipoPersonaDesdeRfc(rfc));
    return typeof desdeRfc === 'string' ? desdeRfc : null;
}

function armarSnapshot(body) {
    const contacto = recortar(body.contacto, CLAVES_CONTACTO);
    const identidadIn = body.identidad && typeof body.identidad === 'object' ? body.identidad : {};
    const identidad = recortar(identidadIn, CLAVES_IDENTIDAD);
    identidad.domicilio = recortar(identidadIn.domicilio, CLAVES_DOMICILIO);

    const viabilidadIn = body.viabilidad;
    const viabilidad = (viabilidadIn && typeof viabilidadIn === 'object' && !Array.isArray(viabilidadIn))
        ? recortar(viabilidadIn, CLAVES_VIABILIDAD)
        : {};

    return {
        solicitud_id: body.solicitud_id,
        analisis_id: uuidOpcional(body.analisis_id),
        cotizacion_portal_id: uuidOpcional(body.cotizacion_portal_id),
        rfc: truncar(body.rfc, 13),
        pdf_disponible: Boolean(body.pdf_disponible),
        cancelado: Boolean(body.cancelado),
        motivo_cancelacion: body.motivo_cancelacion == null ? null : body.motivo_cancelacion,
        contacto,
        identidad,
        semaforos: recortar(body.semaforos, CLAVES_SEMAFOROS),
        activo: recortar(body.activo, CLAVES_ACTIVO),
        deal: recortar(body.deal, CLAVES_DEAL),
        viabilidad,
    };
}

class ErrorHttp extends Error {
    constructor(status, mensaje, code) {
        super(mensaje);
        this.status = status;
        this.code = code || null;
    }
}

const INFORME_TIMEOUT_MS = 120_000;

function grouerApiBase() {
    return String(process.env.GROUER_API_URL || '').trim().replace(/\/$/, '');
}

function grouerSharedToken() {
    return String(process.env.GROUER_CRM_SHARED_TOKEN || '').trim();
}

function empresaGrouerId() {
    const n = Number(process.env.GROUER_EMPRESA_ID);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function origenTienePdf(origen) {
    if (!origen) return false;
    const analisisId = origen.analisis_id && String(origen.analisis_id).trim();
    if (!analisisId) return false;
    const flag = origen.pdf_disponible;
    return flag === true || flag === 1 || flag === '1';
}

function cuerpoError(err) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return body;
}

function mapearStatusGrouer(status) {
    if (status === 404 || status === 409) {
        return new ErrorHttp(
            409,
            'El informe PDF no está disponible para este prospecto.',
            'pdf_no_disponible',
        );
    }
    if (status === 503) {
        return new ErrorHttp(
            503,
            'El servicio de informes GROUER no está disponible.',
            'grouer_no_disponible',
        );
    }
    if (status === 504) {
        return new ErrorHttp(
            504,
            'Timeout al obtener el informe GROUER.',
            'grouer_timeout',
        );
    }
    return new ErrorHttp(
        502,
        'No se pudo obtener el informe GROUER.',
        'grouer_error',
    );
}

/**
 * GET informe PDF en la API GROUER. Sin disco, BD ni OneDrive.
 * @param {string} analisisId
 * @returns {Promise<{ buffer: Buffer, contentType: string, contentDisposition: string }>}
 */
async function obtenerPdfInformeGrouer(analisisId) {
    const base = grouerApiBase();
    const token = grouerSharedToken();
    if (!base || !token) {
        throw new ErrorHttp(
            503,
            'Integración GROUER no configurada.',
            'grouer_no_configurado',
        );
    }

    const url = `${base}/api/analisis-riesgo/${encodeURIComponent(analisisId)}/informe.pdf`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), INFORME_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/pdf',
                'X-Crm-Token': token,
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            try {
                await res.arrayBuffer();
            } catch {
                /* cuerpo de error descartado; no se reenvía al operador */
            }
            throw mapearStatusGrouer(res.status);
        }

        const ab = await res.arrayBuffer();
        const disposition = res.headers.get('content-disposition');
        return {
            buffer: Buffer.from(ab),
            contentType: res.headers.get('content-type') || 'application/pdf',
            contentDisposition: disposition || 'attachment; filename="informe-grouer.pdf"',
        };
    } catch (err) {
        if (err instanceof ErrorHttp) throw err;
        if (err && err.name === 'AbortError') {
            throw new ErrorHttp(
                504,
                'Timeout al obtener el informe GROUER.',
                'grouer_timeout',
            );
        }
        throw new ErrorHttp(
            502,
            'No se pudo contactar la API GROUER.',
            'grouer_unreachable',
        );
    } finally {
        clearTimeout(timer);
    }
}

async function resolverSemillaGrouer() {
    const empresaIdEnv = (process.env.GROUER_EMPRESA_ID || '').trim();
    if (!empresaIdEnv) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.');
    }

    const db = pool.promise();
    const [empresas] = await db.query(
        'SELECT id FROM empresas WHERE id = ? AND nombre_comercial = ? LIMIT 1',
        [empresaIdEnv, NOMBRE_EMPRESA],
    );
    if (!empresas.length) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.');
    }
    const empresaId = empresas[0].id;

    const [pipelines] = await db.query(
        'SELECT id FROM pipelines WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_PIPELINE],
    );
    if (!pipelines.length) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.');
    }

    const [etapas] = await db.query(
        'SELECT id FROM pipeline_stages WHERE pipeline_id = ? AND orden = ? LIMIT 1',
        [pipelines[0].id, ETAPA_NUEVOS.orden],
    );
    if (!etapas.length) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.');
    }

    const [usuarios] = await db.query(
        'SELECT id FROM usuarios WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_ROBOT],
    );
    if (!usuarios.length) {
        throw new ErrorHttp(503, 'Semilla GROUER incompleta.');
    }

    return {
        empresaId,
        stageId: etapas[0].id,
        usuarioId: usuarios[0].id,
    };
}

async function buscarPorSolicitud(dbOrConn, solicitudId) {
    const [filas] = await dbOrConn.query(
        'SELECT lead_id FROM leads_origen_grouer WHERE solicitud_id = ? LIMIT 1',
        [solicitudId],
    );
    return filas[0] || null;
}

function esDuplicadoUnico(err) {
    return err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062);
}

router.post(
    '/api/integraciones/grouer/prospectos',
    verificarTokenGrouer,
    async (req, res) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};

        if (!esUuid(body.solicitud_id)) {
            return res.status(400).json({ error: 'solicitud_id debe ser un UUID válido.' });
        }
        const solicitudId = String(body.solicitud_id).trim();

        const valorActivo = body.deal && typeof body.deal === 'object'
            ? Number(body.deal.valor_activo)
            : NaN;
        if (!Number.isFinite(valorActivo) || valorActivo <= 0) {
            return res.status(400).json({ error: 'deal.valor_activo es obligatorio y debe ser mayor a cero.' });
        }

        try {
            const db = pool.promise();
            const existente = await buscarPorSolicitud(db, solicitudId);
            if (existente) {
                console.log(`GROUER inbound duplicado solicitud_id=${solicitudId} lead_id=${existente.lead_id}`);
                return res.status(200).json({ lead_id: existente.lead_id, duplicado: true });
            }

            const semilla = await resolverSemillaGrouer();
            await asegurarCatalogoEstatus(pool, semilla.empresaId);

            const cancelado = Boolean(body.cancelado);
            const codigoEstatus = cancelado ? CODIGO_CANCELADO : CODIGO_ACTIVO;
            const estatus = await obtenerEstatusPorCodigo(pool, semilla.empresaId, codigoEstatus);
            if (!estatus) {
                return res.status(503).json({ error: 'Semilla GROUER incompleta.' });
            }

            const snapshot = armarSnapshot(body);
            const rfc = snapshot.rfc;
            const nombre = truncar(
                (snapshot.identidad && snapshot.identidad.razon_social)
                    || (snapshot.contacto && snapshot.contacto.nombre_portal),
                150,
            ) || 'Prospecto GROUER';
            const correo = truncar(snapshot.contacto && snapshot.contacto.email, 150);
            const telefono = truncar(snapshot.contacto && snapshot.contacto.telefono, 50);
            const tipoPersona = resolverTipoPersona(body.identidad, rfc);
            const leadId = crypto.randomUUID();

            const conn = await pool.promise().getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(
                    `INSERT INTO leads (
                        id, empresa_id, usuario_id, stage_id, nombre, correo, telefono,
                        valor, medio, tipo_persona, estatus_id, activo,
                        motivo_desactivacion, desactivado_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${cancelado ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
                    [
                        leadId,
                        semilla.empresaId,
                        semilla.usuarioId,
                        semilla.stageId,
                        nombre,
                        correo,
                        telefono,
                        valorActivo,
                        NOMBRE_CANAL,
                        tipoPersona,
                        estatus.id,
                        cancelado ? 0 : 1,
                        cancelado ? MOTIVO_CANCELACION_PORTAL : null,
                    ],
                );
                await conn.query(
                    `INSERT INTO leads_origen_grouer (
                        lead_id, solicitud_id, analisis_id, cotizacion_portal_id,
                        rfc, pdf_disponible, snapshot_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        leadId,
                        solicitudId,
                        snapshot.analisis_id,
                        snapshot.cotizacion_portal_id,
                        rfc,
                        snapshot.pdf_disponible ? 1 : 0,
                        JSON.stringify(snapshot),
                    ],
                );
                await conn.commit();
            } catch (errTx) {
                await conn.rollback();
                if (esDuplicadoUnico(errTx)) {
                    const otra = await buscarPorSolicitud(db, solicitudId);
                    if (otra) {
                        console.log(`GROUER inbound duplicado solicitud_id=${solicitudId} lead_id=${otra.lead_id}`);
                        return res.status(200).json({ lead_id: otra.lead_id, duplicado: true });
                    }
                }
                throw errTx;
            } finally {
                conn.release();
            }

            await registrarEtapaInicial(pool, leadId, semilla.stageId);
            console.log(`GROUER inbound alta solicitud_id=${solicitudId} lead_id=${leadId}`);
            return res.status(201).json({ lead_id: leadId, duplicado: false });
        } catch (err) {
            if (err instanceof ErrorHttp) {
                return res.status(err.status).json({ error: err.message });
            }
            console.error('GROUER inbound error solicitud_id=', solicitudId, err.message);
            return res.status(500).json({ error: 'Error al registrar el prospecto GROUER.' });
        }
    },
);

router.post(
    '/api/integraciones/grouer/prospectos/:solicitud_id/cancelar',
    verificarTokenGrouer,
    async (req, res) => {
        const solicitudRaw = req.params.solicitud_id;
        if (!esUuid(solicitudRaw)) {
            return res.status(400).json({ error: 'solicitud_id debe ser un UUID válido.' });
        }
        const solicitudId = String(solicitudRaw).trim();

        try {
            const empresaId = empresaGrouerId();
            if (empresaId == null) {
                return res.status(503).json({ error: 'Semilla GROUER incompleta.' });
            }

            const db = pool.promise();
            const [filas] = await db.query(
                `SELECT o.lead_id, e.codigo AS estatus_codigo
                 FROM leads_origen_grouer o
                 INNER JOIN leads l ON l.id = o.lead_id
                 LEFT JOIN lead_estatus e ON e.id = l.estatus_id
                 WHERE o.solicitud_id = ? AND l.empresa_id = ?
                 LIMIT 1`,
                [solicitudId, empresaId],
            );

            if (!filas.length) {
                console.log(`GROUER inbound cancelar no-op solicitud_id=${solicitudId}`);
                return res.status(200).json({ ok: true, existia: false });
            }

            const origen = filas[0];
            if (esCancelado(origen)) {
                console.log(
                    `GROUER inbound cancelar idempotente solicitud_id=${solicitudId} lead_id=${origen.lead_id}`,
                );
                return res.status(200).json({ ok: true, existia: true, lead_id: origen.lead_id });
            }

            await asegurarCatalogoEstatus(pool, empresaId);
            const estatus = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_CANCELADO);
            if (!estatus) {
                return res.status(503).json({ error: 'Semilla GROUER incompleta.' });
            }

            await db.query(
                `UPDATE leads
                 SET estatus_id = ?, motivo_desactivacion = ?, desactivado_at = CURRENT_TIMESTAMP, activo = 0
                 WHERE id = ? AND empresa_id = ?`,
                [estatus.id, MOTIVO_CANCELACION_PORTAL, origen.lead_id, empresaId],
            );

            console.log(`GROUER inbound cancelar solicitud_id=${solicitudId} lead_id=${origen.lead_id}`);
            return res.status(200).json({ ok: true, existia: true, lead_id: origen.lead_id });
        } catch (err) {
            console.error('GROUER inbound cancelar error solicitud_id=', solicitudId, err.message);
            return res.status(500).json({ error: 'Error al cancelar el prospecto GROUER.' });
        }
    },
);

router.get(
    '/api/leads/:id/detalle',
    verificarToken,
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        try {
            const db = pool.promise();
            const [leads] = await db.query(
                `SELECT l.*, ps.nombre_etapa,
                        e.codigo AS estatus_codigo,
                        e.nombre AS estatus_nombre,
                        e.color_hex AS estatus_color
                 FROM leads l
                 LEFT JOIN pipeline_stages ps ON l.stage_id = ps.id
                 LEFT JOIN lead_estatus e ON l.estatus_id = e.id
                 WHERE l.id = ?
                 LIMIT 1`,
                [id],
            );
            if (!leads.length) {
                return res.status(404).json({ error: 'Lead no encontrado' });
            }

            const lead = leads[0];
            const [origenes] = await db.query(
                `SELECT solicitud_id, analisis_id, pdf_disponible, snapshot_json
                 FROM leads_origen_grouer
                 WHERE lead_id = ?
                 LIMIT 1`,
                [id],
            );

            if (!origenes.length) {
                return res.json({
                    ...lead,
                    origen: null,
                });
            }

            const origen = origenes[0];
            return res.json({
                ...lead,
                origen: 'grouer',
                solicitud_id: origen.solicitud_id,
                analisis_id: origen.analisis_id,
                pdf_disponible: Boolean(origen.pdf_disponible),
                snapshot: parsearSnapshotJson(origen.snapshot_json),
            });
        } catch (err) {
            console.error('Error en detalle de lead', id, err.message);
            return res.status(500).json({ error: 'Error al consultar el detalle del lead.' });
        }
    },
);

router.get(
    '/api/leads/:id/informe-grouer.pdf',
    verificarToken,
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        try {
            const db = pool.promise();
            const [filas] = await db.query(
                `SELECT l.empresa_id, o.analisis_id, o.pdf_disponible
                 FROM leads l
                 LEFT JOIN leads_origen_grouer o ON o.lead_id = l.id
                 WHERE l.id = ?
                 LIMIT 1`,
                [id],
            );
            if (!filas.length) {
                return res.status(404).json({ error: 'Lead no encontrado' });
            }

            const row = filas[0];
            const empresaObjetivo = empresaGrouerId();
            if (
                empresaObjetivo == null
                || Number(row.empresa_id) !== empresaObjetivo
                || !origenTienePdf(row)
            ) {
                return res.status(409).json({
                    error: 'El informe PDF no está disponible para este prospecto.',
                    code: 'pdf_no_disponible',
                });
            }

            const analisisId = String(row.analisis_id).trim();
            console.log(`GROUER pdf proxy lead_id=${id} analisis_id=${analisisId}`);
            const pdf = await obtenerPdfInformeGrouer(analisisId);
            res.setHeader('Content-Type', pdf.contentType);
            res.setHeader('Content-Disposition', pdf.contentDisposition);
            return res.status(200).send(pdf.buffer);
        } catch (err) {
            if (err instanceof ErrorHttp) {
                console.error(
                    'GROUER pdf proxy error lead_id=',
                    id,
                    'code=',
                    err.code || '-',
                    err.message,
                );
                return res.status(err.status).json(cuerpoError(err));
            }
            console.error('GROUER pdf proxy error lead_id=', id, err.message);
            return res.status(500).json({ error: 'Error al obtener el informe GROUER.' });
        }
    },
);

module.exports = router;
