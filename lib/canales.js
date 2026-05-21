const crypto = require('crypto');

/** Canales raíz del catálogo estándar (mismo set para todas las empresas) */
const CANALES_RAIZ = [
    'Referidos de clientes',
    'Marketing digital',
    'Socios',
    'Agentes',
    'Eventos empresariales',
    'Concesionarios',
    'Webinars',
    'Contacto directo',
    'Cotizador',
];

const MEDIO_DEFAULT = 'Contacto directo';

const insertarCanal = (db, empresaId, nombre, parentId) =>
    db.query(
        'INSERT INTO lead_sources (id, empresa_id, nombre, parent_id) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), empresaId, nombre, parentId || null],
    );

/** Inserta canales raíz faltantes en cualquier empresa (sin subcanales) */
const asegurarCanalesRaiz = async (pool, empresaId) => {
    const db = pool.promise();
    const [existentes] = await db.query(
        'SELECT nombre FROM lead_sources WHERE empresa_id = ? AND parent_id IS NULL',
        [empresaId],
    );
    const nombresExistentes = new Set(existentes.map((f) => f.nombre));
    let insertados = 0;

    for (const nombre of CANALES_RAIZ) {
        if (nombresExistentes.has(nombre)) continue;
        await insertarCanal(db, empresaId, nombre, null);
        insertados += 1;
    }

    return insertados > 0;
};

const asegurarCatalogoCanales = async (pool, empresaId) => {
    await asegurarCanalesRaiz(pool, empresaId);
    return true;
};

module.exports = {
    CANALES_RAIZ,
    MEDIO_DEFAULT,
    asegurarCanalesRaiz,
    asegurarCatalogoCanales,
};
