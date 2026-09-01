const crypto = require('crypto');
const { esEmpresaGrouer } = require('./empresas-env');

const CODIGO_ACTIVO = 'activo';
const CODIGO_CANCELADO = 'cancelado';
const CODIGO_PENDIENTE_AUTORIZACION = 'pendiente_autorizacion';
const CODIGO_ENVIADO_A_FLISING = 'enviado_a_flising';
const ORDEN_CANCELADO = 9999;
const ORDEN_PENDIENTE_AUTORIZACION = 500;
const ORDEN_ENVIADO_A_FLISING = 400;

const ESTATUS_SISTEMA = [
    {
        codigo: CODIGO_ACTIVO,
        nombre: 'Activo',
        color_hex: null,
        incluir_en_suma: 1,
        permite_mover: 1,
        bloquea_cotizacion: 0,
        es_sistema: 1,
        orden: 0,
    },
    {
        codigo: CODIGO_PENDIENTE_AUTORIZACION,
        nombre: 'Pendiente autorización',
        color_hex: '#f59e0b',
        incluir_en_suma: 1,
        permite_mover: 0,
        bloquea_cotizacion: 1,
        es_sistema: 1,
        orden: ORDEN_PENDIENTE_AUTORIZACION,
    },
    {
        codigo: CODIGO_CANCELADO,
        nombre: 'Cancelado',
        color_hex: '#94a3b8',
        incluir_en_suma: 0,
        permite_mover: 0,
        bloquea_cotizacion: 1,
        es_sistema: 1,
        orden: ORDEN_CANCELADO,
    },
];

/** Solo empresa GROUER. No entra en ESTATUS_SISTEMA (no se siembra en FLISING). */
const PLANTILLA_ENVIADO_A_FLISING = {
    codigo: CODIGO_ENVIADO_A_FLISING,
    nombre: 'Enviado a Flising',
    color_hex: '#0284c7',
    incluir_en_suma: 1,
    permite_mover: 1,
    bloquea_cotizacion: 1,
    es_sistema: 1,
    orden: ORDEN_ENVIADO_A_FLISING,
};

const asegurarEstatusEmpresa = async (pool, empresaId) => {
    const db = pool.promise();
    const [existentes] = await db.query(
        'SELECT codigo, id FROM lead_estatus WHERE empresa_id = ?',
        [empresaId],
    );
    const porCodigo = new Map(existentes.map((f) => [f.codigo, f.id]));

    for (const plantilla of ESTATUS_SISTEMA) {
        if (porCodigo.has(plantilla.codigo)) continue;
        const id = crypto.randomUUID();
        await db.query(
            `INSERT INTO lead_estatus
             (id, empresa_id, codigo, nombre, color_hex, incluir_en_suma, permite_mover, bloquea_cotizacion, es_sistema, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                empresaId,
                plantilla.codigo,
                plantilla.nombre,
                plantilla.color_hex,
                plantilla.incluir_en_suma,
                plantilla.permite_mover,
                plantilla.bloquea_cotizacion,
                plantilla.es_sistema,
                plantilla.orden,
            ],
        );
        porCodigo.set(plantilla.codigo, id);
    }

    return porCodigo;
};

const asegurarEstatusEnviadoAFlising = async (pool, empresaId) => {
    if (!esEmpresaGrouer(empresaId)) return null;
    const db = pool.promise();
    const [existentes] = await db.query(
        'SELECT id FROM lead_estatus WHERE empresa_id = ? AND codigo = ? LIMIT 1',
        [empresaId, CODIGO_ENVIADO_A_FLISING],
    );
    if (existentes.length) return existentes[0];

    const id = crypto.randomUUID();
    const p = PLANTILLA_ENVIADO_A_FLISING;
    try {
        await db.query(
            `INSERT INTO lead_estatus
             (id, empresa_id, codigo, nombre, color_hex, incluir_en_suma, permite_mover, bloquea_cotizacion, es_sistema, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                empresaId,
                p.codigo,
                p.nombre,
                p.color_hex,
                p.incluir_en_suma,
                p.permite_mover,
                p.bloquea_cotizacion,
                p.es_sistema,
                p.orden,
            ],
        );
        return { id };
    } catch (err) {
        if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
            const [otra] = await db.query(
                'SELECT id FROM lead_estatus WHERE empresa_id = ? AND codigo = ? LIMIT 1',
                [empresaId, CODIGO_ENVIADO_A_FLISING],
            );
            return otra[0] || null;
        }
        throw err;
    }
};

const obtenerEstatusPorCodigo = async (pool, empresaId, codigo) => {
    await asegurarEstatusEmpresa(pool, empresaId);
    const db = pool.promise();
    const [filas] = await db.query(
        'SELECT * FROM lead_estatus WHERE empresa_id = ? AND codigo = ? LIMIT 1',
        [empresaId, codigo],
    );
    return filas[0] || null;
};

const obtenerEstatusInicial = async (pool, empresaId) =>
    obtenerEstatusPorCodigo(pool, empresaId, CODIGO_ACTIVO);

const migrarLeadsSinEstatus = async (pool, empresaId) => {
    const db = pool.promise();
    const activo = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_ACTIVO);
    const cancelado = await obtenerEstatusPorCodigo(pool, empresaId, CODIGO_CANCELADO);
    if (!activo || !cancelado) return;

    await db.query(
        `UPDATE leads SET estatus_id = ?
         WHERE empresa_id = ? AND estatus_id IS NULL AND activo = 0`,
        [cancelado.id, empresaId],
    );
    await db.query(
        `UPDATE leads SET estatus_id = ?
         WHERE empresa_id = ? AND estatus_id IS NULL`,
        [activo.id, empresaId],
    );
};

const asegurarCatalogoEstatus = async (pool, empresaId) => {
    await asegurarEstatusEmpresa(pool, empresaId);
    await asegurarEstatusEnviadoAFlising(pool, empresaId);
    await migrarLeadsSinEstatus(pool, empresaId);
};

const listarEstatusEmpresa = async (pool, empresaId) => {
    await asegurarCatalogoEstatus(pool, empresaId);
    const db = pool.promise();
    const [filas] = await db.query(
        `SELECT * FROM lead_estatus
         WHERE empresa_id = ?
         ORDER BY
           CASE codigo
             WHEN ? THEN 0
             WHEN ? THEN 1
             WHEN ? THEN 3
             WHEN ? THEN 4
             ELSE 2
           END,
           orden ASC,
           nombre ASC`,
        [
            empresaId,
            CODIGO_ACTIVO,
            CODIGO_ENVIADO_A_FLISING,
            CODIGO_PENDIENTE_AUTORIZACION,
            CODIGO_CANCELADO,
        ],
    );
    return filas;
};

const esCancelado = (estatus) =>
    estatus?.codigo === CODIGO_CANCELADO || estatus?.estatus_codigo === CODIGO_CANCELADO;

const esPendienteAutorizacion = (estatus) =>
    estatus?.codigo === CODIGO_PENDIENTE_AUTORIZACION
    || estatus?.estatus_codigo === CODIGO_PENDIENTE_AUTORIZACION;

const esEnviadoAFlising = (estatus) =>
    estatus?.codigo === CODIGO_ENVIADO_A_FLISING
    || estatus?.estatus_codigo === CODIGO_ENVIADO_A_FLISING;

const CODIGOS_ESTATUS_SISTEMA = new Set([
    CODIGO_ACTIVO,
    CODIGO_PENDIENTE_AUTORIZACION,
    CODIGO_ENVIADO_A_FLISING,
    CODIGO_CANCELADO,
]);

const esEstatusSistema = (estatus) =>
    estatus?.es_sistema === 1
    || estatus?.es_sistema === true
    || estatus?.estatus_es_sistema === 1
    || estatus?.estatus_es_sistema === true
    || CODIGOS_ESTATUS_SISTEMA.has(estatus?.codigo)
    || CODIGOS_ESTATUS_SISTEMA.has(estatus?.estatus_codigo);

module.exports = {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    CODIGO_PENDIENTE_AUTORIZACION,
    CODIGO_ENVIADO_A_FLISING,
    ORDEN_CANCELADO,
    ORDEN_ENVIADO_A_FLISING,
    ESTATUS_SISTEMA,
    PLANTILLA_ENVIADO_A_FLISING,
    asegurarEstatusEmpresa,
    asegurarEstatusEnviadoAFlising,
    asegurarCatalogoEstatus,
    obtenerEstatusPorCodigo,
    obtenerEstatusInicial,
    listarEstatusEmpresa,
    migrarLeadsSinEstatus,
    esCancelado,
    esPendienteAutorizacion,
    esEnviadoAFlising,
    esEstatusSistema,
    CODIGOS_ESTATUS_SISTEMA,
};
