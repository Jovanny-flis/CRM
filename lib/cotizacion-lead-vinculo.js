/**
 * Vinculación de cotizaciones a prospectos (múltiples folios por lead).
 */

const { assertPuedeVincularCotizacionEnLead, leadBloqueaCotizacion, obtenerEstatusLead } = require('./cotizacion-vinculo');
const {
    ESTADO_AUTORIZACION,
    obtenerCotizacionPorId,
    aplicarEstatusLeadTrasGuardadoEspecial,
} = require('./cotizacion-especial');

const crearErrorVinculo = (mensaje, status = 400) => {
    const err = new Error(mensaje);
    err.status = status;
    return err;
};

/** Suma valor_activo de todas las cotizaciones vinculadas al lead. */
const obtenerSumaValorCotizacionesLead = async (db, leadId) => {
    const [filas] = await db.query(
        `SELECT COALESCE(SUM(valor_activo), 0) AS total, COUNT(*) AS cantidad
         FROM cotizaciones WHERE lead_id = ?`,
        [leadId],
    );
    if (!filas.length || Number(filas[0].cantidad) === 0) return null;
    return Number(filas[0].total);
};

const sincronizarValorLeadSuma = async (db, leadId) => {
    const total = await obtenerSumaValorCotizacionesLead(db, leadId);
    if (total == null) return null;
    await db.query('UPDATE leads SET valor = ? WHERE id = ?', [total, leadId]);
    return total;
};

const fijarOrigenEspecialSiAplica = async (db, cotizacionId, leadId) => {
    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    if (!cot?.es_especial || cot.lead_id_origen_especial) return;

    await db.query(
        'UPDATE cotizaciones SET lead_id_origen_especial = ? WHERE id = ?',
        [leadId, cotizacionId],
    );

    if (cot.lote_id) {
        await db.query(
            `UPDATE cotizaciones SET lead_id_origen_especial = ?
             WHERE lote_id = ? AND (lead_id_origen_especial IS NULL OR lead_id_origen_especial = '')`,
            [leadId, cot.lote_id],
        );
    }
};

/**
 * Vincula una cotización al prospecto sin desvincular las demás del mismo lead.
 * @param {import('mysql2').Pool} pool
 */
const vincularCotizacionEnLead = async (pool, leadId, cotizacionId) => {
    const db = pool.promise();

    await assertPuedeVincularCotizacionEnLead(db, leadId, cotizacionId);

    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    if (!cot) throw crearErrorVinculo('Cotización no encontrada.', 404);

    await db.query('UPDATE cotizaciones SET lead_id = ? WHERE id = ?', [leadId, cotizacionId]);
    await fijarOrigenEspecialSiAplica(db, cotizacionId, leadId);

    if (cot.autorizacion_estado === ESTADO_AUTORIZACION.PENDIENTE) {
        await aplicarEstatusLeadTrasGuardadoEspecial(pool, leadId, ESTADO_AUTORIZACION.PENDIENTE);
    }

    await sincronizarValorLeadSuma(db, leadId);
};

/** Desvincula una cotización del prospecto (lead_id = NULL; no borra el registro). */
const desvincularCotizacionDeLead = async (pool, cotizacionId) => {
    const db = pool.promise();

    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    if (!cot) throw crearErrorVinculo('Cotización no encontrada.', 404);

    const leadId = cot.lead_id;
    if (!leadId) {
        return { leadId: null, mensaje: 'La cotización ya estaba sin vincular.' };
    }

    const estatus = await obtenerEstatusLead(db, leadId);
    if (estatus && leadBloqueaCotizacion(estatus)) {
        throw crearErrorVinculo(
            'Este prospecto tiene el folio congelado: no se puede desvincular cotización.',
        );
    }

    await db.query('UPDATE cotizaciones SET lead_id = NULL WHERE id = ?', [cotizacionId]);
    await sincronizarValorLeadSuma(db, leadId);

    return { leadId, mensaje: 'Cotización desvinculada del prospecto.' };
};

const obtenerIdsCotizacionesMismoLote = async (db, cotizacionId) => {
    const cot = await obtenerCotizacionPorId(db, cotizacionId);
    if (!cot) return [];
    if (!cot.lote_id) return [cotizacionId];
    const [filas] = await db.query('SELECT id FROM cotizaciones WHERE lote_id = ?', [cot.lote_id]);
    return filas.map((f) => f.id);
};

module.exports = {
    obtenerSumaValorCotizacionesLead,
    sincronizarValorLeadSuma,
    vincularCotizacionEnLead,
    desvincularCotizacionDeLead,
    obtenerIdsCotizacionesMismoLote,
};
