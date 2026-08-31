'use strict';

/**
 * Semilla LOCAL idempotente: empresa GROUER, pipeline GROUER, etapas Nuevos + corretaje,
 * usuario técnico «Sistema GROUER» y canal «Portal GROUER».
 *
 * No escribe IDs ni tokens en archivos. Al terminar imprime GROUER_EMPRESA_ID=<id>.
 *
 * Uso (desde la raíz del CRM):
 *   node scripts/seed-grouer-local.js
 *   npm run seed:grouer-local
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.error('Faltan DB_HOST, DB_USER o DB_NAME en CRM/.env.');
    process.exit(1);
}

const pool = require('../db');
const {
    ETAPA_NUEVOS,
    ETAPA_CORRETAJE,
    asegurarEmpresaLocal,
    asegurarPipelineLocal,
    asegurarEtapa,
    asegurarRobot,
    asegurarCanalPortalGrouer,
    imprimirEmpresaId,
} = require('./seed-grouer-comun');

async function main() {
    const db = pool.promise();
    try {
        const empresa = await asegurarEmpresaLocal(db);
        const pipeline = await asegurarPipelineLocal(db, empresa.id);
        await asegurarEtapa(db, pipeline.id, ETAPA_NUEVOS.nombre, ETAPA_NUEVOS.orden);
        await asegurarEtapa(db, pipeline.id, ETAPA_CORRETAJE.nombre, ETAPA_CORRETAJE.orden);
        await asegurarRobot(db, empresa.id);
        await asegurarCanalPortalGrouer(db, empresa.id);
        imprimirEmpresaId(empresa.id);
        console.log('Semilla local GROUER lista (re-ejecutar no duplica).');
    } catch (err) {
        console.error('Error en semilla local GROUER:', err.message || err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
