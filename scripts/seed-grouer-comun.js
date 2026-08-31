'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const NOMBRE_EMPRESA = 'GROUER';
const NOMBRE_PIPELINE = 'GROUER';
const CLAVE_PIPELINE = 'grouer';
const NOMBRE_ROBOT = 'Sistema GROUER';
const EMAIL_ROBOT = 'sistema.grouer@local.invalid';
const ROL_ROBOT = 'agente';
const NOMBRE_CANAL = 'Portal GROUER';
/** Placeholder documentado: no es un UID de Firebase Auth. El humano debe pegar el real. */
const PLACEHOLDER_UID = 'PENDIENTE_PEGAR_UID_FIREBASE';
const ETAPA_NUEVOS = { nombre: 'Nuevos', orden: 1 };
const ETAPA_CORRETAJE = { nombre: 'corretaje', orden: 2 };

function uidDesdeEnv() {
    const v = (process.env.GROUER_ROBOT_FIREBASE_UID || '').trim();
    return v || null;
}

function avisarUid(uid) {
    if (!uid || uid === PLACEHOLDER_UID) {
        console.warn(
            'AVISO: firebase_uid del robot es un placeholder. Crea el usuario técnico en Firebase Auth, ' +
            'pega GROUER_ROBOT_FIREBASE_UID en CRM/.env y vuelve a correr este script. ' +
            'Sin el UID real, verificarToken / el alta autenticada fallará (leads.usuario_id apunta a usuarios.id; ' +
            'el UID debe coincidir con Auth).',
        );
    }
}

/**
 * Resuelve la empresa GROUER. Si GROUER_EMPRESA_ID está en env, exige que esa fila
 * tenga nombre_comercial = GROUER. Si no hay env, busca por nombre.
 */
async function buscarEmpresaGrouer(db) {
    const envId = (process.env.GROUER_EMPRESA_ID || '').trim();
    if (envId) {
        const [filas] = await db.query(
            'SELECT id, nombre_comercial FROM empresas WHERE id = ? LIMIT 1',
            [envId],
        );
        const fila = filas[0];
        if (!fila) {
            throw new Error(`No hay empresa con id GROUER_EMPRESA_ID=${envId}.`);
        }
        if (fila.nombre_comercial !== NOMBRE_EMPRESA) {
            throw new Error(
                `GROUER_EMPRESA_ID=${envId} no es la empresa ${NOMBRE_EMPRESA} ` +
                `(encontrada: ${fila.nombre_comercial}).`,
            );
        }
        return fila;
    }
    const [filas] = await db.query(
        'SELECT id, nombre_comercial FROM empresas WHERE nombre_comercial = ? LIMIT 1',
        [NOMBRE_EMPRESA],
    );
    return filas[0] || null;
}

async function asegurarEmpresaLocal(db) {
    const existente = await buscarEmpresaGrouer(db);
    if (existente) {
        console.log(`Empresa ${NOMBRE_EMPRESA} ya existe (id=${existente.id}).`);
        return existente;
    }
    const [result] = await db.query(
        'INSERT INTO empresas (nombre_comercial) VALUES (?)',
        [NOMBRE_EMPRESA],
    );
    const id = result.insertId;
    console.log(`Empresa ${NOMBRE_EMPRESA} creada (id=${id}).`);
    return { id, nombre_comercial: NOMBRE_EMPRESA };
}

async function asegurarPipelineLocal(db, empresaId) {
    const [filas] = await db.query(
        'SELECT id, nombre, clave FROM pipelines WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_PIPELINE],
    );
    if (filas[0]) {
        console.log(`Pipeline ${NOMBRE_PIPELINE} ya existe (id=${filas[0].id}).`);
        return filas[0];
    }
    const id = crypto.randomUUID();
    await db.query(
        'INSERT INTO pipelines (id, empresa_id, nombre, clave) VALUES (?, ?, ?, ?)',
        [id, empresaId, NOMBRE_PIPELINE, CLAVE_PIPELINE],
    );
    console.log(`Pipeline ${NOMBRE_PIPELINE} creado (id=${id}, clave=${CLAVE_PIPELINE}).`);
    return { id, nombre: NOMBRE_PIPELINE, clave: CLAVE_PIPELINE };
}

async function asegurarEtapa(db, pipelineId, nombreEtapa, orden) {
    const [porNombre] = await db.query(
        'SELECT id, nombre_etapa, orden FROM pipeline_stages WHERE pipeline_id = ? AND nombre_etapa = ? LIMIT 1',
        [pipelineId, nombreEtapa],
    );
    if (porNombre[0]) {
        console.log(`Etapa "${nombreEtapa}" ya existe (orden=${porNombre[0].orden}).`);
        return porNombre[0];
    }
    const [porOrden] = await db.query(
        'SELECT id, nombre_etapa, orden FROM pipeline_stages WHERE pipeline_id = ? AND orden = ? LIMIT 1',
        [pipelineId, orden],
    );
    if (porOrden[0]) {
        console.warn(
            `Aviso: ya hay etapa orden=${orden} con nombre "${porOrden[0].nombre_etapa}"; ` +
            `no se crea "${nombreEtapa}".`,
        );
        return porOrden[0];
    }
    const id = crypto.randomUUID();
    await db.query(
        'INSERT INTO pipeline_stages (id, pipeline_id, nombre_etapa, orden, color_hex) VALUES (?, ?, ?, ?, ?)',
        [id, pipelineId, nombreEtapa, orden, '#CCCCCC'],
    );
    console.log(`Etapa "${nombreEtapa}" creada (orden=${orden}).`);
    return { id, nombre_etapa: nombreEtapa, orden };
}

/**
 * Idempotente por nombre exacto «Sistema GROUER» en la empresa. No toca MAIN.
 * Si GROUER_ROBOT_FIREBASE_UID está en env y el usuario ya existe, actualiza el UID.
 */
async function asegurarRobot(db, empresaId) {
    const uidEnv = uidDesdeEnv();
    const [porNombre] = await db.query(
        'SELECT id, nombre, email, firebase_uid, rol FROM usuarios WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_ROBOT],
    );
    if (porNombre[0]) {
        if (porNombre[0].nombre === 'MAIN') {
            throw new Error('Abortado: no se debe usar ni modificar el usuario MAIN.');
        }
        if (uidEnv && porNombre[0].firebase_uid !== uidEnv) {
            await db.query(
                'UPDATE usuarios SET firebase_uid = ? WHERE id = ? AND empresa_id = ? AND nombre = ?',
                [uidEnv, porNombre[0].id, empresaId, NOMBRE_ROBOT],
            );
            console.log(
                `Usuario "${NOMBRE_ROBOT}" ya existía; se actualizó firebase_uid desde GROUER_ROBOT_FIREBASE_UID.`,
            );
            porNombre[0].firebase_uid = uidEnv;
        } else {
            console.log(`Usuario "${NOMBRE_ROBOT}" ya existe (id=${porNombre[0].id}).`);
        }
        avisarUid(uidEnv || porNombre[0].firebase_uid);
        return porNombre[0];
    }

    const [porEmail] = await db.query(
        'SELECT id, nombre FROM usuarios WHERE email = ? LIMIT 1',
        [EMAIL_ROBOT],
    );
    if (porEmail[0]) {
        throw new Error(
            `El email ${EMAIL_ROBOT} ya pertenece a otro usuario (${porEmail[0].nombre}). No se duplica.`,
        );
    }

    const firebaseUid = uidEnv || PLACEHOLDER_UID;
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
    const id = crypto.randomUUID();
    await db.query(
        `INSERT INTO usuarios (id, nombre, email, password_hash, rol, supervisor_id, empresa_id, firebase_uid)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        [id, NOMBRE_ROBOT, EMAIL_ROBOT, passwordHash, ROL_ROBOT, empresaId, firebaseUid],
    );
    console.log(`Usuario "${NOMBRE_ROBOT}" creado (id=${id}, rol=${ROL_ROBOT}, email=${EMAIL_ROBOT}).`);
    avisarUid(firebaseUid);
    return { id, nombre: NOMBRE_ROBOT, email: EMAIL_ROBOT, firebase_uid: firebaseUid, rol: ROL_ROBOT };
}

async function asegurarCanalPortalGrouer(db, empresaId) {
    const [filas] = await db.query(
        'SELECT id, nombre FROM lead_sources WHERE empresa_id = ? AND nombre = ? LIMIT 1',
        [empresaId, NOMBRE_CANAL],
    );
    if (filas[0]) {
        console.log(`Canal "${NOMBRE_CANAL}" ya existe (id=${filas[0].id}).`);
        return filas[0];
    }
    const id = crypto.randomUUID();
    await db.query(
        'INSERT INTO lead_sources (id, empresa_id, nombre, parent_id) VALUES (?, ?, ?, NULL)',
        [id, empresaId, NOMBRE_CANAL],
    );
    console.log(`Canal "${NOMBRE_CANAL}" creado solo en empresa ${NOMBRE_EMPRESA} (id=${id}).`);
    return { id, nombre: NOMBRE_CANAL };
}

function imprimirEmpresaId(empresaId) {
    console.log('');
    console.log(`GROUER_EMPRESA_ID=${empresaId}`);
    console.log('Pega esa línea en CRM/.env (no la subas a git).');
}

module.exports = {
    NOMBRE_EMPRESA,
    NOMBRE_PIPELINE,
    NOMBRE_ROBOT,
    NOMBRE_CANAL,
    PLACEHOLDER_UID,
    ETAPA_NUEVOS,
    ETAPA_CORRETAJE,
    buscarEmpresaGrouer,
    asegurarEmpresaLocal,
    asegurarPipelineLocal,
    asegurarEtapa,
    asegurarRobot,
    asegurarCanalPortalGrouer,
    imprimirEmpresaId,
};
