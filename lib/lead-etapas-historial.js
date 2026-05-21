const crypto = require('crypto');

/**
 * Registra la etapa inicial al crear un prospecto (sin backfill en leads existentes).
 */
const registrarEtapaInicial = async (pool, leadId, stageId) => {
    if (!leadId || !stageId) return;
    const db = pool.promise();
    await db.query(
        `INSERT IGNORE INTO lead_etapas_historial (id, lead_id, stage_id, alcanzado_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [crypto.randomUUID(), leadId, stageId],
    );
};

/**
 * Mueve un lead de etapa aplicando timestamps solo en avance hacia etapas no registradas.
 * Retroceso: actualiza stage_id sin crear registros.
 * Salto de etapas: mismo alcanzado_at para todas las etapas nuevas cubiertas.
 */
const moverLeadEtapa = async (pool, leadId, stageIdDestino) => {
    const db = pool.promise();

    const [leads] = await db.query(
        'SELECT id, stage_id FROM leads WHERE id = ? LIMIT 1',
        [leadId],
    );
    if (!leads.length) {
        const err = new Error('Lead no encontrado');
        err.codigo = 404;
        throw err;
    }

    const lead = leads[0];
    if (lead.stage_id === stageIdDestino) {
        return { tipo: 'sin_cambio', timestamps_creados: 0 };
    }

    const [stages] = await db.query(
        `SELECT id, orden, pipeline_id
         FROM pipeline_stages
         WHERE id IN (?, ?)`,
        [lead.stage_id || '', stageIdDestino],
    );

    const origen = stages.find((s) => s.id === lead.stage_id) || null;
    const destino = stages.find((s) => s.id === stageIdDestino);

    if (!destino) {
        const err = new Error('Etapa destino no encontrada');
        err.codigo = 400;
        throw err;
    }

    if (origen && origen.pipeline_id !== destino.pipeline_id) {
        const err = new Error('Las etapas deben pertenecer al mismo pipeline');
        err.codigo = 400;
        throw err;
    }

    const ordenOrigen = origen ? origen.orden : -1;
    const esAvance = destino.orden > ordenOrigen;

    await db.query('UPDATE leads SET stage_id = ? WHERE id = ?', [stageIdDestino, leadId]);

    if (!esAvance) {
        return { tipo: 'retroceso', timestamps_creados: 0 };
    }

    const [etapasPorCubrir] = await db.query(
        `SELECT id, orden
         FROM pipeline_stages
         WHERE pipeline_id = ? AND orden > ? AND orden <= ?
         ORDER BY orden ASC`,
        [destino.pipeline_id, ordenOrigen, destino.orden],
    );

    if (!etapasPorCubrir.length) {
        return { tipo: 'avance', timestamps_creados: 0 };
    }

    const stageIds = etapasPorCubrir.map((e) => e.id);
    const placeholders = stageIds.map(() => '?').join(', ');
    const [existentes] = await db.query(
        `SELECT stage_id FROM lead_etapas_historial
         WHERE lead_id = ? AND stage_id IN (${placeholders})`,
        [leadId, ...stageIds],
    );
    const yaRegistradas = new Set(existentes.map((r) => r.stage_id));
    const pendientes = etapasPorCubrir.filter((e) => !yaRegistradas.has(e.id));

    if (pendientes.length) {
        const ahora = new Date();
        for (const etapa of pendientes) {
            await db.query(
                `INSERT INTO lead_etapas_historial (id, lead_id, stage_id, alcanzado_at)
                 VALUES (?, ?, ?, ?)`,
                [crypto.randomUUID(), leadId, etapa.id, ahora],
            );
        }
    }

    return { tipo: 'avance', timestamps_creados: pendientes.length };
};

module.exports = {
    registrarEtapaInicial,
    moverLeadEtapa,
};
