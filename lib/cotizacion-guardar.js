/**
 * Persistencia de cotizaciones: normalización y INSERT (completo o legado sin migración §10).
 */

const cadenaVacia = (v) => v === '' || v === undefined || v === null;

const normalizarAnio = (anio, tipoArrendamiento) => {
    if (tipoArrendamiento && tipoArrendamiento !== 'Automotriz') return null;
    if (cadenaVacia(anio)) return null;
    const n = parseInt(String(anio).trim(), 10);
    return Number.isFinite(n) ? n : null;
};

const textoONull = (v) => (cadenaVacia(v) ? null : String(v));

const esErrorColumnaDesconocida = (error) => {
    const msg = error?.sqlMessage || error?.message || '';
    return error?.code === 'ER_BAD_FIELD_ERROR' || /Unknown column/i.test(msg);
};

/** Ajusta tipos antes de INSERT (evita '' en INT y NaN en DECIMAL). */
const normalizarDatosCotizacion = (body) => {
    const tipoArrendamiento = body.tipo_arrendamiento || null;
    const esAutomotriz = tipoArrendamiento === 'Automotriz';
    const plazo = parseInt(body.plazo, 10);

    return {
        empresa_id: body.empresa_id,
        lead_id: body.lead_id,
        usuario_id: body.usuario_id,
        tipo_arrendamiento: tipoArrendamiento,
        tipo_activo: body.tipo_activo,
        marca: esAutomotriz ? textoONull(body.marca) : null,
        modelo: esAutomotriz ? textoONull(body.modelo) : null,
        version: esAutomotriz ? textoONull(body.version) : null,
        anio: normalizarAnio(body.anio, tipoArrendamiento),
        nombre_activo: textoONull(body.nombre_activo) || '',
        valor_activo: Number(body.valor_activo) || 0,
        plazo: Number.isFinite(plazo) ? plazo : null,
        tipo_renta: body.tipo_renta || 'Vencida',
        tasa_anual: body.tasa_anual != null && body.tasa_anual !== '' ? Number(body.tasa_anual) : null,
        pago_inicial_valor: body.pago_inicial_valor != null && body.pago_inicial_valor !== ''
            ? Number(body.pago_inicial_valor) : null,
        is_pago_inicial_pct: body.is_pago_inicial_pct ?? null,
        residual_valor: body.residual_valor != null && body.residual_valor !== ''
            ? Number(body.residual_valor) : null,
        is_residual_pct: body.is_residual_pct ?? null,
        comision_valor: body.comision_valor != null && body.comision_valor !== ''
            ? Number(body.comision_valor) : null,
        is_comision_pct: body.is_comision_pct ?? null,
        seguro_valor: body.seguro_valor != null && body.seguro_valor !== ''
            ? Number(body.seguro_valor) : null,
        is_seguro_contado: body.is_seguro_contado ?? null,
        is_seguro_anual: body.is_seguro_anual ?? null,
        gps_valor: esAutomotriz && body.gps_valor != null && body.gps_valor !== ''
            ? Number(body.gps_valor) : 0,
        is_gps_contado: esAutomotriz ? (body.is_gps_contado ?? null) : 0,
        servicios_valor: esAutomotriz && body.servicios_valor != null && body.servicios_valor !== ''
            ? Number(body.servicios_valor) : 0,
        porcentaje_vr: Number(body.porcentaje_vr) || 0,
        vr_calculado: Number(body.vr_calculado) || 0,
        pago_inicial: Number(body.pago_inicial) || 0,
        renta_mensual_sin_iva: Number(body.renta_mensual_sin_iva) || 0,
        renta_mensual_con_iva: Number(body.renta_mensual_con_iva) || 0,
    };
};

const SQL_INSERT_COMPLETO = `
    INSERT INTO cotizaciones 
    (id, empresa_id, lead_id, usuario_id, tipo_arrendamiento, tipo_activo, marca, modelo, version, anio, nombre_activo,
     valor_activo, plazo, tipo_renta, tasa_anual,
     pago_inicial_valor, is_pago_inicial_pct, residual_valor, is_residual_pct,
     comision_valor, is_comision_pct, seguro_valor, is_seguro_contado, is_seguro_anual,
     gps_valor, is_gps_contado, servicios_valor,
     porcentaje_vr, vr_calculado, pago_inicial, renta_mensual_sin_iva, renta_mensual_con_iva) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SQL_INSERT_LEGADO = `
    INSERT INTO cotizaciones 
    (id, empresa_id, lead_id, usuario_id, tipo_activo, marca, modelo, version, anio, nombre_activo,
     valor_activo, plazo, tipo_renta, porcentaje_vr, vr_calculado, pago_inicial,
     renta_mensual_sin_iva, renta_mensual_con_iva) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const paramsInsertCompleto = (id, d) => [
    id, d.empresa_id, d.lead_id || null, d.usuario_id || null,
    d.tipo_arrendamiento || null, d.tipo_activo, d.marca, d.modelo, d.version, d.anio, d.nombre_activo,
    d.valor_activo, d.plazo, d.tipo_renta, d.tasa_anual,
    d.pago_inicial_valor, d.is_pago_inicial_pct, d.residual_valor, d.is_residual_pct,
    d.comision_valor, d.is_comision_pct, d.seguro_valor, d.is_seguro_contado, d.is_seguro_anual,
    d.gps_valor, d.is_gps_contado, d.servicios_valor,
    d.porcentaje_vr, d.vr_calculado, d.pago_inicial,
    d.renta_mensual_sin_iva, d.renta_mensual_con_iva,
];

const paramsInsertLegado = (id, d) => [
    id, d.empresa_id, d.lead_id || null, d.usuario_id || null,
    d.tipo_activo, d.marca, d.modelo, d.version, d.anio, d.nombre_activo,
    d.valor_activo, d.plazo, d.tipo_renta,
    d.porcentaje_vr, d.vr_calculado, d.pago_inicial,
    d.renta_mensual_sin_iva, d.renta_mensual_con_iva,
];

/**
 * @param {import('mysql2').Pool} pool
 * @param {string} nuevaCotizacionId
 * @param {object} datos — cuerpo ya normalizado
 */
const guardarCotizacion = async (pool, nuevaCotizacionId, datos) => {
    const db = pool.promise();
    try {
        await db.query(SQL_INSERT_COMPLETO, paramsInsertCompleto(nuevaCotizacionId, datos));
        return { modo: 'completo' };
    } catch (error) {
        if (!esErrorColumnaDesconocida(error)) throw error;
        await db.query(SQL_INSERT_LEGADO, paramsInsertLegado(nuevaCotizacionId, datos));
        return { modo: 'legado' };
    }
};

module.exports = {
    normalizarDatosCotizacion,
    guardarCotizacion,
    esErrorColumnaDesconocida,
};
