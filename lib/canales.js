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

/**
 * Inserta el catálogo raíz estándar al dar de alta una empresa.
 * Solo para bootstrap inicial (POST /empresas o migración SQL); no re-sembrar en GET /medios.
 */
const sembrarCanalesDefaultEmpresa = async (pool, empresaId) => {
    const db = pool.promise();
    const [existentes] = await db.query(
        'SELECT nombre FROM lead_sources WHERE empresa_id = ? AND parent_id IS NULL',
        [empresaId],
    );
    const nombresExistentes = new Set(existentes.map((f) => f.nombre));

    for (const nombre of CANALES_RAIZ) {
        if (nombresExistentes.has(nombre)) continue;
        await insertarCanal(db, empresaId, nombre, null);
    }
};

module.exports = {
    CANALES_RAIZ,
    MEDIO_DEFAULT,
    sembrarCanalesDefaultEmpresa,
};
