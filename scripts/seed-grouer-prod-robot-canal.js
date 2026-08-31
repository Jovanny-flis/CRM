'use strict';

/**
 * Semilla PROD acotada: solo usuario técnico «Sistema GROUER» y canal «Portal GROUER».
 * NO crea empresa, pipeline ni etapas (ya existen en producción).
 *
 * Busca empresa nombre_comercial = 'GROUER', o usa GROUER_EMPRESA_ID si está en env
 * (debe corresponder a esa empresa).
 *
 * Uso (desde la raíz del CRM, con .env de prod / VPS):
 *   node scripts/seed-grouer-prod-robot-canal.js
 *   npm run seed:grouer-prod-robot
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.error('Faltan DB_HOST, DB_USER o DB_NAME en CRM/.env.');
    process.exit(1);
}

const pool = require('../db');
const {
    NOMBRE_EMPRESA,
    buscarEmpresaGrouer,
    asegurarRobot,
    asegurarCanalPortalGrouer,
    imprimirEmpresaId,
} = require('./seed-grouer-comun');

async function main() {
    const db = pool.promise();
    try {
        const empresa = await buscarEmpresaGrouer(db);
        if (!empresa) {
            console.error(
                `No existe la empresa ${NOMBRE_EMPRESA}. En prod no se crea: ` +
                'pega GROUER_EMPRESA_ID en CRM/.env o verifica nombre_comercial.',
            );
            process.exitCode = 1;
            return;
        }
        console.log(`Empresa ${NOMBRE_EMPRESA} encontrada (id=${empresa.id}). No se crea pipeline ni etapas.`);
        await asegurarRobot(db, empresa.id);
        await asegurarCanalPortalGrouer(db, empresa.id);
        imprimirEmpresaId(empresa.id);
        console.log('Semilla prod GROUER (robot + canal) lista (re-ejecutar no duplica).');
    } catch (err) {
        console.error('Error en semilla prod GROUER:', err.message || err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
