/**
 * Cotización especial: autorización, vínculo permanente y notificaciones.
 */

const {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    obtenerEstatusPorCodigo,
} = require('./estatus-leads');

const CODIGO_PENDIENTE_AUTORIZACION = 'pendiente_autorizacion';

const ESTADO_AUTORIZACION = {
    PENDIENTE: 'pendiente',
    APROBADA: 'aprobada',
    RECHAZADA: 'rechazada',
};

const ROLES_AGENTE = ['agente', 'agente_cotizador'];
const ROLES_AUTORIZAN = ['supervisor', 'admin_empresa'];

const puedeAutorizarCotizacionEspecial = (usuario, empresaId) => {
    if (!usuario) return false;
    if (!ROLES_AUTORIZAN.includes(usuario.rol)) return false;
    return Number(usuario.empresa_id) === Number(empresaId);
};

const requiereAutorizacionPorRol = (rol) => ROLES_AGENTE.includes(rol);

const esCotizacionEspecialPendiente = (cot) =>
    cot?.es_especial === 1 || cot?.es_especial === true
        ? cot.autorizacion_estado === ESTADO_AUTORIZACION.PENDIENTE
        : false;

const esCotizacionEspecial = (cot) =>
    cot?.es_especial === 1 || cot?.es_especial === true;

const cotizacionEspecialBloqueaPdf = (cot) => esCotizacionEspecialPendiente(cot);

const obtenerCotizacionPorId = async (db, cotizacionId) => {
    const [filas] = await db.query('SELECT * FROM cotizaciones WHERE id = ? LIMIT 1', [cotizacionId]);
    return filas[0] || null;
};

const obtenerUsuarioCreador = async (db, usuarioId) => {
    if (!usuarioId) return null;
    const [filas] = await db.query(
        'SELECT id, nombre, email, rol, supervisor_id, empresa_id FROM usuarios WHERE id = ? LIMIT 1',
        [usuarioId],
    );
    return filas[0] || null;
};

/** Resuelve flags al guardar según rol del creador y modo especial. */
const resolverFlagsAlGuardar = async (db, { es_especial, usuario_id }) => {
    if (!es_especial) {
        return { es_especial: 0, autorizacion_estado: null };
    }

    const creador = await obtenerUsuarioCreador(db, usuario_id);
    if (!creador) {
        const err = new Error('Usuario creador no encontrado.');
        err.status = 400;
        throw err;
    }

    if (ROLES_AUTORIZAN.includes(creador.rol)) {
        return { es_especial: 1, autorizacion_estado: ESTADO_AUTORIZACION.APROBADA };
    }

    if (requiereAutorizacionPorRol(creador.rol)) {
        return { es_especial: 1, autorizacion_estado: ESTADO_AUTORIZACION.PENDIENTE };
    }

    const err = new Error('Tu rol no puede crear cotizaciones especiales.');
    err.status = 403;
    throw err;
};

const aplicarEstatusLeadTrasGuardadoEspecial = async (pool, leadId, autorizacionEstado) => {
    if (!leadId || autorizacionEstado !== ESTADO_AUTORIZACION.PENDIENTE) return;

    const db = pool.promise();
    const [leads] = await db.query('SELECT empresa_id FROM leads WHERE id = ? LIMIT 1', [leadId]);
    if (!leads.length) return;

    const pendiente = await obtenerEstatusPorCodigo(pool, leads[0].empresa_id, CODIGO_PENDIENTE_AUTORIZACION);
    if (!pendiente) return;

    await db.query('UPDATE leads SET estatus_id = ? WHERE id = ?', [pendiente.id, leadId]);
};

const aplicarEstatusLeadTrasAutorizar = async (pool, leadId, empresaId) => {
    if (!leadId) return;
    const activo = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_ACTIVO);
    if (!activo) return;
    const db = pool.promise();
    await db.query('UPDATE leads SET estatus_id = ? WHERE id = ?', [activo.id, leadId]);
};

const aplicarRechazoLeadYCotizacion = async (pool, cotizacionId, leadId, empresaId) => {
    const db = pool.promise();
    const cancelado = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_CANCELADO);
    if (!cancelado) {
        const err = new Error('No se encontró el estatus cancelado.');
        err.status = 500;
        throw err;
    }

    const motivo = 'Cotización especial rechazada';

    if (leadId) {
        await db.query(
            `UPDATE leads
             SET estatus_id = ?, motivo_desactivacion = ?, desactivado_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [cancelado.id, motivo, leadId],
        );
    }

    await db.query(
        'UPDATE cotizaciones SET autorizacion_estado = ? WHERE id = ?',
        [ESTADO_AUTORIZACION.RECHAZADA, cotizacionId],
    );
};

const assertPuedeVincularCotizacionEspecial = async (db, cotizacionId, leadIdDestino) => {
    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    if (!cot || !esCotizacionEspecial(cot)) return;

    if (cot.autorizacion_estado === ESTADO_AUTORIZACION.RECHAZADA) {
        const err = new Error('Esta cotización especial fue rechazada y no puede vincularse.');
        err.status = 400;
        throw err;
    }

    if (cot.lead_id && cot.lead_id !== leadIdDestino) {
        const err = new Error(
            'Las cotizaciones especiales quedan asignadas de forma permanente a un prospecto y no pueden reasignarse.',
        );
        err.status = 400;
        throw err;
    }
};

const listarCorreosAutorizadoresEmpresa = async (db, empresaId) => {
    const [filas] = await db.query(
        `SELECT email FROM usuarios
         WHERE empresa_id = ? AND rol IN ('supervisor', 'admin_empresa') AND email IS NOT NULL AND email != ''`,
        [empresaId],
    );
    return [...new Set(filas.map((f) => f.email.trim()).filter(Boolean))];
};

const formatearFolio = (folio) => (folio ? `FL-${String(folio).padStart(3, '0')}` : 'sin folio');

const actualizarFlagsCotizacion = async (db, cotizacionId, flags) => {
    await db.query(
        'UPDATE cotizaciones SET es_especial = ?, autorizacion_estado = ? WHERE id = ?',
        [flags.es_especial, flags.autorizacion_estado, cotizacionId],
    );
};

/** Tras INSERT: aplicar estatus al lead vinculado y enviar correo si aplica. */
const postGuardadoCotizacionEspecial = async (pool, transporter, {
    cotizacionId,
    empresaId,
    leadId,
    flags,
    usuarioId,
}) => {
    const db = pool.promise();

    if (leadId && flags.autorizacion_estado === ESTADO_AUTORIZACION.PENDIENTE) {
        await aplicarEstatusLeadTrasGuardadoEspecial(pool, leadId, flags.autorizacion_estado);
    }

    if (flags.autorizacion_estado !== ESTADO_AUTORIZACION.PENDIENTE) return;

    const creador = await obtenerUsuarioCreador(db, usuarioId);
    if (!creador || !requiereAutorizacionPorRol(creador.rol)) return;

    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    const destinatarios = await listarCorreosAutorizadoresEmpresa(db, empresaId);

    if (transporter && destinatarios.length) {
        const { enviarCorreoSolicitudEspecial } = require('./cotizacion-especial-email');
        await enviarCorreoSolicitudEspecial(transporter, {
            destinatarios,
            nombreAgente: creador.nombre,
            folio: cot?.folio,
            empresaId,
        });
    }
};

module.exports = {
    CODIGO_PENDIENTE_AUTORIZACION,
    ESTADO_AUTORIZACION,
    ROLES_AUTORIZAN,
    puedeAutorizarCotizacionEspecial,
    requiereAutorizacionPorRol,
    esCotizacionEspecial,
    esCotizacionEspecialPendiente,
    cotizacionEspecialBloqueaPdf,
    resolverFlagsAlGuardar,
    aplicarEstatusLeadTrasGuardadoEspecial,
    aplicarEstatusLeadTrasAutorizar,
    aplicarRechazoLeadYCotizacion,
    assertPuedeVincularCotizacionEspecial,
    obtenerCotizacionPorId,
    obtenerUsuarioCreador,
    listarCorreosAutorizadoresEmpresa,
    formatearFolio,
    actualizarFlagsCotizacion,
    postGuardadoCotizacionEspecial,
};
