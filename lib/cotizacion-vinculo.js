const { CODIGO_CANCELADO } = require('./estatus-leads');
const { assertPuedeVincularCotizacionEspecial } = require('./cotizacion-especial');

const leadBloqueaCotizacion = (filaEstatus) => {
    if (!filaEstatus) return false;
    const codigo = filaEstatus.codigo ?? filaEstatus.estatus_codigo;
    if (codigo === CODIGO_CANCELADO) return true;
    const flag = filaEstatus.bloquea_cotizacion ?? filaEstatus.estatus_bloquea_cotizacion;
    return flag === 1 || flag === true;
};

const obtenerEstatusLead = async (db, leadId) => {
    const [filas] = await db.query(
        `SELECT l.id, e.codigo, e.bloquea_cotizacion
         FROM leads l
         INNER JOIN lead_estatus e ON l.estatus_id = e.id
         WHERE l.id = ?
         LIMIT 1`,
        [leadId],
    );
    return filas[0] || null;
};

const crearErrorVinculo = (mensaje, status = 400) => {
    const err = new Error(mensaje);
    err.status = status;
    return err;
};

/** Impide vincular o reasignar cotización cuando el destino u origen congela el folio. */
const assertPuedeVincularCotizacionEnLead = async (db, leadId, cotizacionId) => {
    await assertPuedeVincularCotizacionEspecial(db, cotizacionId, leadId);

    const destino = await obtenerEstatusLead(db, leadId);
    if (!destino) {
        throw crearErrorVinculo('Lead no encontrado.', 404);
    }
    if (leadBloqueaCotizacion(destino)) {
        throw crearErrorVinculo(
            'Este prospecto tiene el folio congelado: no se puede vincular ni cambiar cotización.',
        );
    }

    const [cotFilas] = await db.query(
        'SELECT lead_id FROM cotizaciones WHERE id = ? LIMIT 1',
        [cotizacionId],
    );
    if (!cotFilas.length) {
        throw crearErrorVinculo('Cotización no encontrada.', 404);
    }

    const origenLeadId = cotFilas[0].lead_id;
    if (!origenLeadId || origenLeadId === leadId) return;

    const origen = await obtenerEstatusLead(db, origenLeadId);
    if (origen && leadBloqueaCotizacion(origen)) {
        throw crearErrorVinculo(
            'La cotización pertenece a un prospecto con folio congelado y no puede reasignarse.',
        );
    }
};

module.exports = {
    leadBloqueaCotizacion,
    assertPuedeVincularCotizacionEnLead,
};
