const crypto = require('crypto');

const CODIGO_ACTIVO = 'activo';
const CODIGO_CANCELADO = 'cancelado';
const ORDEN_CANCELADO = 9999;

const ESTATUS_SISTEMA = [
    {
        codigo: CODIGO_ACTIVO,
        nombre: 'Activo',
        color_hex: null,
        incluir_en_suma: 1,
        permite_mover: 1,
        es_sistema: 1,
        orden: 0,
    },
    {
        codigo: CODIGO_CANCELADO,
        nombre: 'Cancelado',
        color_hex: '#94a3b8',
        incluir_en_suma: 0,
        permite_mover: 0,
        es_sistema: 1,
        orden: ORDEN_CANCELADO,
    },
];

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
             (id, empresa_id, codigo, nombre, color_hex, incluir_en_suma, permite_mover, es_sistema, orden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                empresaId,
                plantilla.codigo,
                plantilla.nombre,
                plantilla.color_hex,
                plantilla.incluir_en_suma,
                plantilla.permite_mover,
                plantilla.es_sistema,
                plantilla.orden,
            ],
        );
        porCodigo.set(plantilla.codigo, id);
    }

    return porCodigo;
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
    await migrarLeadsSinEstatus(pool, empresaId);
};

const listarEstatusEmpresa = async (pool, empresaId) => {
    await asegurarCatalogoEstatus(pool, empresaId);
    const db = pool.promise();
    const [filas] = await db.query(
        `SELECT * FROM lead_estatus
         WHERE empresa_id = ?
         ORDER BY
           CASE codigo WHEN ? THEN 0 WHEN ? THEN 2 ELSE 1 END,
           orden ASC,
           nombre ASC`,
        [empresaId, CODIGO_ACTIVO, CODIGO_CANCELADO],
    );
    return filas;
};

const esCancelado = (estatus) =>
    estatus?.codigo === CODIGO_CANCELADO || estatus?.estatus_codigo === CODIGO_CANCELADO;

module.exports = {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    ORDEN_CANCELADO,
    ESTATUS_SISTEMA,
    asegurarEstatusEmpresa,
    asegurarCatalogoEstatus,
    obtenerEstatusPorCodigo,
    obtenerEstatusInicial,
    listarEstatusEmpresa,
    migrarLeadsSinEstatus,
    esCancelado,
};
