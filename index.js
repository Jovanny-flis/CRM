// 1. Importamos las herramientas
require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const app = express();
const nodemailer = require('nodemailer');
const {
    verificarToken,
    revisarRol,
    validarEmpresaParam,
    validarRecursoEmpresa,
} = require('./middlewares/authMiddleware');
const pool = require('./db');
require('./firebase');
const admin = require('firebase-admin');
const { sembrarCanalesDefaultEmpresa } = require('./lib/canales');
const {
    CODIGO_ACTIVO,
    CODIGO_CANCELADO,
    ORDEN_CANCELADO,
    asegurarCatalogoEstatus,
    obtenerEstatusInicial,
    listarEstatusEmpresa,
    esCancelado,
} = require('./lib/estatus-leads');
const { registrarEtapaInicial, moverLeadEtapa } = require('./lib/lead-etapas-historial');

// 2. Activamos el pase VIP (CORS) y el lector de datos (JSON)
app.use(cors());
app.use(express.json());

// Helper: ¿el usuario autenticado puede operar sobre recursos de esta empresa?
// super_admin pasa siempre. El resto debe coincidir con su empresa_id.
const puedeOperarEnEmpresa = (usuarioCRM, empresaIdObjetivo) => {
    if (!usuarioCRM) return false;
    if (usuarioCRM.rol === 'super_admin') return true;
    if (usuarioCRM.empresa_id === null || usuarioCRM.empresa_id === undefined) return false;
    if (empresaIdObjetivo === null || empresaIdObjetivo === undefined || empresaIdObjetivo === '') return false;
    return Number(usuarioCRM.empresa_id) === Number(empresaIdObjetivo);
};

const valorEstimadoValido = (valor) => {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0;
};

// --- CONFIGURACIÓN DE MIDDLEWARES ---
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
app.use(cors({
    origin: corsOrigins.length === 0 ? false : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); 

app.use((req, res, next) => {
    console.log(`📢 Petición entrante: ${req.method} ${req.url}`);
    next();
});

// 2. CONFIGURACIÓN DEL POOL (Única y robusta)


// Verificación de salud del Pool al iniciar
pool.getConnection((err, connection) => {
    if (err) {
        console.error("🚨 ¡ERROR DE BASE DE DATOS! ->", err);
        console.error('❌ ERROR CRÍTICO DE CONEXIÓN:', err.message);
    } else {
        console.log('✅ Base de datos conectada y lista mediante Pool');
        connection.release();
    }
});

// Manejo de errores globales del Pool
pool.on('error', (err) => {
    console.error('❌ ERROR INESPERADO EN EL POOL:', err.message);
});

// ==========================================
// RUTAS DE GESTIÓN DE USUARIOS / AGENTES (FASE 2)
// ==========================================

// 1. Obtener TODOS los usuarios (Solo Super Admin)
app.get('/api/usuarios', verificarToken, revisarRol(['super_admin']), (req, res) => {
    const query = 'SELECT id, nombre, email, rol, supervisor_id, empresa_id FROM usuarios';
    pool.query(query, (err, resultados) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(200).json(resultados);
    });
});

// 2. Obtener usuarios por empresa (Para los Admin de Empresa)
app.get('/api/usuarios/empresa/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), (req, res) => {
    const { empresa_id } = req.params;
    const query = 'SELECT id, nombre, email, rol, supervisor_id, empresa_id FROM usuarios WHERE empresa_id = ?';
    pool.query(query, [empresa_id], (err, resultados) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(200).json(resultados);
    });
});

// 3. Crear nuevo usuario (Agente, Supervisor o Admin)
app.post('/api/usuarios', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa']), async (req, res) => {
    const { nombre, email, password_hash, rol, supervisor_id, empresa_id } = req.body;

    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes crear usuarios en otra empresa.' });
    }
    if (req.usuarioCRM.rol !== 'super_admin' && rol === 'super_admin') {
        return res.status(403).json({ error: 'No puedes crear usuarios con rol super_admin.' });
    }

    try {
        // Si no envían contraseña desde el front, ponemos una temporal segura por defecto
        const passwordDefinitiva = password_hash || '123456';
        
        // 1. Creamos al usuario en Firebase (La nube de Google)
        const firebaseUser = await admin.auth().createUser({
            email: email,
            password: passwordDefinitiva,
            displayName: nombre,
        });

        // 2. Encriptamos la contraseña para mantener tu estándar de seguridad en MySQL
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(passwordDefinitiva, salt);
        const supId = supervisor_id ? supervisor_id : null;

        // 3. Guardamos en tu base de datos MySQL, ¡incluyendo el nuevo UID de Firebase!
        const query = `
            INSERT INTO usuarios (id, nombre, email, password_hash, rol, supervisor_id, empresa_id, firebase_uid) 
            VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)
        `;
        
        pool.query(query, [nombre, email, hashedPassword, rol, supId, empresa_id, firebaseUser.uid], async (err, result) => {
            if (err) {
                console.error("❌ Error en MySQL al crear usuario:", err.sqlMessage);
                return res.status(500).json({ error: err.sqlMessage });
            }

            // --- INICIO: ENVÍO DE CORREO DE BIENVENIDA ---
            try {
                const emailHtml = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #0056b3; padding: 20px; text-align: center;">
                            <h2 style="color: white; margin: 0;">¡Bienvenido a Flising CRM!</h2>
                        </div>
                        <div style="padding: 20px; color: #333;">
                            <p>Hola <strong>${nombre}</strong>,</p>
                            <p>Tu cuenta ha sido creada exitosamente. A continuación, te compartimos tus credenciales de acceso:</p>
                            
                            <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Usuario / Correo:</strong> ${email}</p>
                                <p style="margin: 5px 0;"><strong>Contraseña temporal:</strong> ${passwordDefinitiva}</p>
                            </div>

                            <p style="text-align: center; margin: 30px 0;">
                                <a href="https://flow.flising.cloud/" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                                    Iniciar Sesión en el CRM
                                </a>
                            </p>

                            <p style="font-size: 13px; color: #777;">
                                <em>Nota: Por seguridad, te recomendamos cambiar esta contraseña en tu perfil una vez que ingreses.</em>
                            </p>
                        </div>
                    </div>
                `;

                await transporter.sendMail({
                    from: `"Flising CRM" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🎉 Tus accesos para Flising CRM',
                    html: emailHtml
                });
                console.log(`✅ Correo de bienvenida enviado a: ${email}`);
            } catch (mailError) {
                console.error("❌ Error enviando correo de bienvenida:", mailError);
            }
            // --- FIN: ENVÍO DE CORREO DE BIENVENIDA ---

            res.status(201).json({ mensaje: "Usuario creado con éxito en Firebase y MySQL" });
        });

    } catch (e) {
        console.error("❌ Error al crear cuenta en Firebase:", e.message);
        if (e.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: "Este correo ya está registrado en el sistema." });
        }
        res.status(500).json({ error: "Error en el proceso de seguridad en la nube." });
    }
});

// 4. Editar usuario existente
app.put('/api/usuarios/:id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa']), (req, res) => {
    const { id } = req.params;
    const { nombre, email, rol, supervisor_id, empresa_id } = req.body;
    const supId = supervisor_id ? supervisor_id : null;

    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes asignar el usuario a otra empresa.' });
    }
    if (req.usuarioCRM.rol !== 'super_admin' && rol === 'super_admin') {
        return res.status(403).json({ error: 'No puedes elevar un usuario a super_admin.' });
    }

    pool.query('SELECT firebase_uid, empresa_id FROM usuarios WHERE id = ?', [id], async (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error al buscar usuario" });
        if (resultados.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const firebase_uid = resultados[0].firebase_uid;
        const empresaActual = resultados[0].empresa_id;

        if (!puedeOperarEnEmpresa(req.usuarioCRM, empresaActual)) {
            return res.status(403).json({ error: 'No tienes acceso a este usuario.' });
        }

        try {
            // 2. Si el usuario existe en Firebase, le actualizamos el correo en la nube
            if (firebase_uid && email) {
                await admin.auth().updateUser(firebase_uid, {
                    email: email,
                    displayName: nombre
                });
            }

            // 3. Ahora actualizamos el resto de los datos en tu MySQL
            const query = `
                UPDATE usuarios SET nombre = ?, email = ?, rol = ?, supervisor_id = ?, empresa_id = ? 
                WHERE id = ?
            `;
            
            pool.query(query, [nombre, email, rol, supId, empresa_id, id], (errUpdate) => {
                if (errUpdate) return res.status(500).json({ error: errUpdate.sqlMessage });
                res.json({ mensaje: "Usuario actualizado en Firebase y BD local" });
            });

        } catch (error) {
            console.error("❌ Error al actualizar en Firebase:", error);
            if (error.code === 'auth/email-already-exists') {
                return res.status(400).json({ error: "Ese correo ya está siendo usado por otro usuario." });
            }
            res.status(500).json({ error: "Error al sincronizar con la nube." });
        }
    });
});

// 5. Eliminar usuario
app.delete('/api/usuarios/:id', verificarToken, revisarRol(['super_admin','admin_empresa']), (req, res) => {
    const { id } = req.params;

    pool.query('SELECT firebase_uid, empresa_id FROM usuarios WHERE id = ?', [id], async (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error al buscar usuario" });
        if (resultados.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const firebase_uid = resultados[0].firebase_uid;
        const empresaActual = resultados[0].empresa_id;

        if (!puedeOperarEnEmpresa(req.usuarioCRM, empresaActual)) {
            return res.status(403).json({ error: 'No tienes acceso a este usuario.' });
        }
        if (req.usuarioCRM.id === id) {
            return res.status(403).json({ error: 'No puedes eliminar tu propio usuario.' });
        }

        try {
            // 2. Si tiene cuenta en la nube, la fulminamos
            if (firebase_uid) {
                await admin.auth().deleteUser(firebase_uid);
            }

            // 3. Finalmente, lo borramos de tu base de datos MySQL
            pool.query('DELETE FROM usuarios WHERE id = ?', [id], (errDelete) => {
                // Si da error aquí, es porque el usuario ya tiene cotizaciones o leads a su nombre
                if (errDelete) return res.status(500).json({ error: "No se puede eliminar porque tiene datos vinculados." });
                res.json({ mensaje: "Usuario eliminado del sistema completo" });
            });

        } catch (error) {
            console.error("❌ Error al eliminar de Firebase:", error);
            res.status(500).json({ error: "Error al eliminar la credencial en la nube." });
        }
    });
});

// ==========================================
// RUTAS DE GESTIÓN DE EMPRESAS (Super Admin)
// ==========================================

app.post('/api/empresas', verificarToken, revisarRol(['super_admin']), async (req, res) => {
    const { nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario } = req.body;
    if (!nombre_comercial) return res.status(400).json({ error: 'Nombre comercial es requerido' });

    const query = `INSERT INTO empresas 
    (nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

    try {
        const [result] = await pool.promise().query(query, [
            nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario,
        ]);
        const empresaId = result.insertId;
        await sembrarCanalesDefaultEmpresa(pool, empresaId);
        res.status(201).json({ mensaje: 'Empresa guardada', id: empresaId });
    } catch (err) {
        console.error('❌ Error al crear empresa:', err.message);
        res.status(500).json({ error: err.sqlMessage || err.message });
    }
});

app.get('/api/empresas', verificarToken, revisarRol(['super_admin']),(req, res) => {
    pool.query('SELECT * FROM empresas ORDER BY nombre_comercial ASC', (err, resultados) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(200).json(resultados);
    });
});

app.put('/api/empresas/:id', verificarToken,revisarRol(['super_admin']),(req, res) => {
    const { id } = req.params;
    const { nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario } = req.body;
    const query = `
        UPDATE empresas SET 
        nombre_comercial = ?, rfc = ?, direccion = ?, telefono = ?, 
        correo = ?, color_principal = ?, color_secundario = ? 
        WHERE id = ?`;
    
    pool.query(query, [nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario, id], (err) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.json({ mensaje: "Empresa actualizada" });
    });
});

app.delete('/api/empresas/:id',verificarToken, revisarRol(['super_admin']),(req, res) => {
    const { id } = req.params;
    pool.query('DELETE FROM empresas WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: "No se puede eliminar la empresa" });
        res.json({ mensaje: "Empresa eliminada" });
    });
});


// Obtener TODOS los Pipelines de una empresa (quitamos el LIMIT 1)
app.get('/api/pipelines/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), (req, res) => {
    const { empresa_id } = req.params;
    pool.query('SELECT * FROM pipelines WHERE empresa_id = ? ORDER BY nombre ASC', [empresa_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// Crear un nuevo Pipeline con Nombre y Clave
app.post('/api/pipelines', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), (req, res) => {
    const { empresa_id, nombre, clave } = req.body;

    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes crear pipelines en otra empresa.' });
    }

    const nuevoPipelineId = crypto.randomUUID();
    const query = `INSERT INTO pipelines (id, empresa_id, nombre, clave) VALUES (?, ?, ?, ?)`;
    
    pool.query(query, [nuevoPipelineId, empresa_id, nombre, clave], (error) => {
        if (error) {
            console.error("❌ Error SQL al crear pipeline:", error.sqlMessage);
            return res.status(500).json({ error: error.sqlMessage });
        }
        res.status(201).json({ mensaje: '📊 Pipeline creado con éxito', id: nuevoPipelineId });
    });
});

// NUEVO: Editar nombre y clave de un Pipeline
app.put('/api/pipelines/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM pipelines WHERE id = ?'),
    (req, res) => {
    const { id } = req.params;
    const { nombre, clave } = req.body;
    const query = `UPDATE pipelines SET nombre = ?, clave = ? WHERE id = ?`;
    
    pool.query(query, [nombre, clave, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: '✅ Pipeline actualizado con éxito' });
    });
});


// Agregar una nueva Etapa
app.post('/api/etapas', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), (req, res) => {
    const { pipeline_id, nombre_etapa, orden, color_hex } = req.body;

    if (!pipeline_id) {
        return res.status(400).json({ error: 'pipeline_id es requerido.' });
    }

    pool.query('SELECT empresa_id FROM pipelines WHERE id = ?', [pipeline_id], (errPipe, filasPipe) => {
        if (errPipe) return res.status(500).json({ error: 'Error verificando el pipeline.' });
        if (filasPipe.length === 0) return res.status(404).json({ error: 'Pipeline no encontrado.' });
        if (!puedeOperarEnEmpresa(req.usuarioCRM, filasPipe[0].empresa_id)) {
            return res.status(403).json({ error: 'No tienes acceso a este pipeline.' });
        }

        const nuevaEtapaId = crypto.randomUUID();
        const query = `INSERT INTO pipeline_stages (id, pipeline_id, nombre_etapa, orden, color_hex) VALUES (?, ?, ?, ?, ?)`;

        pool.query(query, [nuevaEtapaId, pipeline_id, nombre_etapa, orden, color_hex || '#CCCCCC'], (error) => {
            if (error) return res.status(500).json({ error: error.message });
            res.status(201).json({ mensaje: '✅ Etapa agregada al pipeline', id: nuevaEtapaId });
        });
    });
});

// Obtener las etapas de un pipeline
app.get('/api/etapas/:pipeline_id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM pipelines WHERE id = ?', 'pipeline_id'),
    (req, res) => {
    const { pipeline_id } = req.params;
    pool.query('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY orden ASC', [pipeline_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// NUEVO: Editar el nombre y color de una Etapa existente
app.put('/api/etapas/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa(
        'SELECT p.empresa_id FROM pipeline_stages s JOIN pipelines p ON s.pipeline_id = p.id WHERE s.id = ?'
    ),
    (req, res) => {
    const { id } = req.params;
    const { nombre_etapa, color_hex } = req.body;
    const query = `UPDATE pipeline_stages SET nombre_etapa = ?, color_hex = ? WHERE id = ?`;
    
    pool.query(query, [nombre_etapa, color_hex, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: '✅ Etapa actualizada' });
    });
});

// =========================================================================
// ESTATUS DE PROSPECTOS (por empresa)
// =========================================================================

app.get('/api/estatus-leads/:empresa_id',
    verificarToken,
    revisarRol(['super_admin', 'admin_empresa', 'supervisor', 'agente']),
    validarEmpresaParam('empresa_id'),
    async (req, res) => {
        const { empresa_id } = req.params;
        try {
            const lista = await listarEstatusEmpresa(pool, empresa_id);
            res.status(200).json(lista);
        } catch (error) {
            console.error('❌ Error listando estatus:', error.message);
            res.status(500).json({ error: error.message || 'Error al listar estatus' });
        }
    },
);

app.post('/api/estatus-leads',
    verificarToken,
    revisarRol(['super_admin', 'admin_empresa']),
    async (req, res) => {
        const {
            empresa_id,
            nombre,
            color_hex,
            incluir_en_suma,
            permite_mover,
        } = req.body;
        const nombreLimpio = (nombre || '').trim();

        if (!empresa_id) return res.status(400).json({ error: 'empresa_id es requerido.' });
        if (!nombreLimpio) return res.status(400).json({ error: 'El nombre del estatus es obligatorio.' });
        if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
            return res.status(403).json({ error: 'No puedes crear estatus en otra empresa.' });
        }

        const db = pool.promise();
        try {
            await asegurarCatalogoEstatus(pool, empresa_id);
            const codigo = `custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
            const [rango] = await db.query(
                `SELECT COALESCE(MAX(orden), 0) AS max_orden FROM lead_estatus
                 WHERE empresa_id = ? AND codigo NOT IN (?, ?)`,
                [empresa_id, CODIGO_ACTIVO, CODIGO_CANCELADO],
            );
            const orden = Math.min((rango[0]?.max_orden || 0) + 1, ORDEN_CANCELADO - 1);
            const id = crypto.randomUUID();
            const color = color_hex === '' || color_hex === 'sin_color' ? null : (color_hex || null);

            await db.query(
                `INSERT INTO lead_estatus
                 (id, empresa_id, codigo, nombre, color_hex, incluir_en_suma, permite_mover, es_sistema, orden)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
                [
                    id,
                    empresa_id,
                    codigo,
                    nombreLimpio,
                    color,
                    incluir_en_suma ? 1 : 0,
                    permite_mover ? 1 : 0,
                    orden,
                ],
            );

            res.status(201).json({ mensaje: 'Estatus creado', id });
        } catch (error) {
            console.error('❌ Error al crear estatus:', error.message);
            res.status(500).json({ error: error.message || 'Error al crear estatus' });
        }
    },
);

app.put('/api/estatus-leads/:id',
    verificarToken,
    revisarRol(['super_admin', 'admin_empresa']),
    validarRecursoEmpresa('SELECT empresa_id FROM lead_estatus WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        const { nombre, color_hex, incluir_en_suma, permite_mover } = req.body;
        const nombreLimpio = (nombre || '').trim();

        if (!nombreLimpio) return res.status(400).json({ error: 'El nombre del estatus es obligatorio.' });

        const db = pool.promise();
        try {
            const [actual] = await db.query('SELECT * FROM lead_estatus WHERE id = ? LIMIT 1', [id]);
            if (!actual.length) return res.status(404).json({ error: 'Estatus no encontrado.' });

            const fila = actual[0];
            const color = color_hex === '' || color_hex === 'sin_color' ? null : (color_hex ?? fila.color_hex);

            if (fila.codigo === CODIGO_CANCELADO) {
                await db.query('UPDATE lead_estatus SET nombre = ? WHERE id = ?', [nombreLimpio, id]);
                return res.status(200).json({ mensaje: 'Estatus actualizado' });
            }

            if (fila.codigo === CODIGO_ACTIVO) {
                await db.query(
                    'UPDATE lead_estatus SET nombre = ?, color_hex = ? WHERE id = ?',
                    [nombreLimpio, color, id],
                );
                return res.status(200).json({ mensaje: 'Estatus actualizado' });
            }

            await db.query(
                `UPDATE lead_estatus
                 SET nombre = ?, color_hex = ?, incluir_en_suma = ?, permite_mover = ?
                 WHERE id = ?`,
                [
                    nombreLimpio,
                    color,
                    incluir_en_suma ? 1 : 0,
                    permite_mover ? 1 : 0,
                    id,
                ],
            );
            res.status(200).json({ mensaje: 'Estatus actualizado' });
        } catch (error) {
            console.error('❌ Error al actualizar estatus:', error.message);
            res.status(500).json({ error: error.message || 'Error al actualizar estatus' });
        }
    },
);

app.put('/api/estatus-leads/reordenar',
    verificarToken,
    revisarRol(['super_admin', 'admin_empresa']),
    async (req, res) => {
        const { empresa_id, ids_ordenados } = req.body;

        if (!empresa_id || !Array.isArray(ids_ordenados)) {
            return res.status(400).json({ error: 'empresa_id e ids_ordenados son requeridos.' });
        }
        if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
            return res.status(403).json({ error: 'No puedes reordenar estatus de otra empresa.' });
        }

        const db = pool.promise();
        try {
            const [sistema] = await db.query(
                'SELECT id, codigo FROM lead_estatus WHERE empresa_id = ? AND es_sistema = 1',
                [empresa_id],
            );
            const idsSistema = new Set(sistema.map((s) => s.id));
            let orden = 1;

            for (const estatusId of ids_ordenados) {
                if (idsSistema.has(estatusId)) continue;
                await db.query(
                    'UPDATE lead_estatus SET orden = ? WHERE id = ? AND empresa_id = ? AND es_sistema = 0',
                    [orden, estatusId, empresa_id],
                );
                orden += 1;
            }

            res.status(200).json({ mensaje: 'Orden actualizado' });
        } catch (error) {
            console.error('❌ Error al reordenar estatus:', error.message);
            res.status(500).json({ error: error.message || 'Error al reordenar' });
        }
    },
);

app.delete('/api/estatus-leads/:id',
    verificarToken,
    revisarRol(['super_admin', 'admin_empresa']),
    validarRecursoEmpresa('SELECT empresa_id FROM lead_estatus WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        const db = pool.promise();

        try {
            const [actual] = await db.query('SELECT * FROM lead_estatus WHERE id = ? LIMIT 1', [id]);
            if (!actual.length) return res.status(404).json({ error: 'Estatus no encontrado.' });
            if (actual[0].es_sistema) {
                return res.status(400).json({ error: 'No se pueden eliminar los estatus del sistema.' });
            }

            const activo = await obtenerEstatusInicial(pool, actual[0].empresa_id);
            await db.query('UPDATE leads SET estatus_id = ? WHERE estatus_id = ?', [activo.id, id]);
            await db.query('DELETE FROM lead_estatus WHERE id = ?', [id]);

            res.status(200).json({ mensaje: 'Estatus eliminado. Los leads afectados pasaron a Activo.' });
        } catch (error) {
            console.error('❌ Error al eliminar estatus:', error.message);
            res.status(500).json({ error: error.message || 'Error al eliminar estatus' });
        }
    },
);

const SQL_LEADS_CON_ESTATUS = `
    SELECT l.*, ps.nombre_etapa,
           e.codigo AS estatus_codigo,
           e.nombre AS estatus_nombre,
           e.color_hex AS estatus_color,
           e.incluir_en_suma AS estatus_incluir_en_suma,
           e.permite_mover AS estatus_permite_mover,
           e.es_sistema AS estatus_es_sistema,
           (SELECT GROUP_CONCAT(h.stage_id)
            FROM lead_etapas_historial h
            WHERE h.lead_id = l.id) AS etapas_alcanzadas
    FROM leads l
    LEFT JOIN pipeline_stages ps ON l.stage_id = ps.id
    LEFT JOIN lead_estatus e ON l.estatus_id = e.id
`;

// Obtener Leads por empresa
app.get('/api/leads/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), async (req, res) => {
    const { empresa_id } = req.params;

    try {
        await asegurarCatalogoEstatus(pool, empresa_id);
    } catch (errSeed) {
        console.error('🚨 Error al sembrar estatus:', errSeed.message);
        return res.status(500).json({ error: 'No se pudo inicializar el catálogo de estatus.' });
    }

    pool.query(`${SQL_LEADS_CON_ESTATUS} WHERE l.empresa_id = ?`, [empresa_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// Crear un nuevo prospecto (Lead)
app.post('/api/leads', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), async (req, res) => {
    const { empresa_id, nombre, correo, telefono, valor, medio, stage_id, usuario_id } = req.body;

    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes crear leads en otra empresa.' });
    }

    if (!valorEstimadoValido(valor)) {
        return res.status(400).json({ error: 'El valor estimado es obligatorio y debe ser mayor a cero.' });
    }

    try {
        const estatusInicial = await obtenerEstatusInicial(pool, empresa_id);
        if (!estatusInicial) {
            return res.status(500).json({ error: 'No se encontró el estatus inicial de la empresa.' });
        }

        const leadId = crypto.randomUUID();
        const db = pool.promise();

        await db.query(
            `INSERT INTO leads (id, empresa_id, nombre, correo, telefono, valor, medio, estatus_id, stage_id, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                leadId,
                empresa_id,
                nombre,
                correo,
                telefono,
                valor,
                medio,
                estatusInicial.id,
                stage_id || null,
                usuario_id || null,
            ],
        );

        if (stage_id) {
            await registrarEtapaInicial(pool, leadId, stage_id);
        }

        res.status(201).json({ mensaje: 'Lead creado exitosamente', id: leadId });
    } catch (err) {
        console.error('❌ Error al crear lead:', err.message);
        res.status(500).json({ error: err.message || 'Error al crear lead' });
    }
});

// Editar la información de un Lead (Prospecto)
app.put('/api/leads/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
    const { id } = req.params;
    const { nombre, correo, telefono, valor, medio, usuario_id, estatus_id, motivo_desactivacion } = req.body;
    const db = pool.promise();

    try {
        const [filasLead] = await db.query(
            `${SQL_LEADS_CON_ESTATUS} WHERE l.id = ? LIMIT 1`,
            [id],
        );
        if (!filasLead.length) return res.status(404).json({ error: 'Lead no encontrado' });

        const leadActual = filasLead[0];
        if (esCancelado(leadActual)) {
            return res.status(400).json({ error: 'No se puede editar un lead cancelado.' });
        }

        if (!valorEstimadoValido(valor)) {
            return res.status(400).json({ error: 'El valor estimado es obligatorio y debe ser mayor a cero.' });
        }

        const estatusObjetivoId = estatus_id || leadActual.estatus_id;
        const [filasEstatus] = await db.query(
            'SELECT * FROM lead_estatus WHERE id = ? AND empresa_id = ? LIMIT 1',
            [estatusObjetivoId, leadActual.empresa_id],
        );
        if (!filasEstatus.length) {
            return res.status(400).json({ error: 'Estatus no válido para esta empresa.' });
        }

        const estatusObjetivo = filasEstatus[0];
        const pasaACancelado = estatusObjetivo.codigo === CODIGO_CANCELADO;

        if (pasaACancelado) {
            const motivo = (motivo_desactivacion || '').trim();
            if (!motivo) {
                return res.status(400).json({ error: 'El motivo de cancelación es obligatorio.' });
            }
            await db.query(
                `UPDATE leads
                 SET nombre = ?, correo = ?, telefono = ?, valor = ?, medio = ?, usuario_id = ?,
                     estatus_id = ?, motivo_desactivacion = ?, desactivado_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [nombre, correo, telefono, valor, medio, usuario_id, estatusObjetivo.id, motivo, id],
            );
            return res.status(200).json({ mensaje: 'Lead cancelado con éxito' });
        }

        await db.query(
            `UPDATE leads
             SET nombre = ?, correo = ?, telefono = ?, valor = ?, medio = ?, usuario_id = ?, estatus_id = ?
             WHERE id = ?`,
            [nombre, correo, telefono, valor, medio, usuario_id, estatusObjetivo.id, id],
        );
        res.status(200).json({ mensaje: 'Lead actualizado con éxito' });
    } catch (error) {
        console.error('❌ ERROR AL ACTUALIZAR LEAD:', error.message);
        res.status(500).json({ error: error.message || 'Error al actualizar en BD' });
    }
});


app.get('/api/medios/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), async (req, res) => {
    const { empresa_id } = req.params;

    try {
        const [resultados] = await pool.promise().query(
            `SELECT * FROM lead_sources
             WHERE empresa_id = ?
             ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, nombre ASC`,
            [empresa_id],
        );
        res.status(200).json(resultados);
    } catch (error) {
        console.error('🚨 ¡ERROR EN MEDIOS! ->', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/medios', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), async (req, res) => {
    const { empresa_id, nombre, parent_id } = req.body;
    const nombreLimpio = (nombre || '').trim();

    if (!empresa_id) return res.status(400).json({ error: 'empresa_id es requerido.' });
    if (!nombreLimpio) return res.status(400).json({ error: 'El nombre del canal es obligatorio.' });
    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes crear canales en otra empresa.' });
    }

    const db = pool.promise();

    try {
        if (parent_id) {
            const [padre] = await db.query(
                'SELECT id FROM lead_sources WHERE id = ? AND empresa_id = ? LIMIT 1',
                [parent_id, empresa_id],
            );
            if (!padre.length) {
                return res.status(400).json({ error: 'El canal padre no existe en esta empresa.' });
            }
        }

        const [duplicado] = await db.query(
            `SELECT id FROM lead_sources
             WHERE empresa_id = ? AND nombre = ?
             AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
             LIMIT 1`,
            [empresa_id, nombreLimpio, parent_id || null, parent_id || null],
        );
        if (duplicado.length) {
            return res.status(409).json({ error: 'Ya existe un canal con ese nombre en el mismo nivel.' });
        }

        const id = crypto.randomUUID();
        await db.query(
            'INSERT INTO lead_sources (id, empresa_id, nombre, parent_id) VALUES (?, ?, ?, ?)',
            [id, empresa_id, nombreLimpio, parent_id || null],
        );

        res.status(201).json({ mensaje: 'Canal creado', id, nombre: nombreLimpio, parent_id: parent_id || null });
    } catch (error) {
        console.error('❌ ERROR AL CREAR CANAL:', error.message);
        res.status(500).json({ error: error.message || 'Error al crear canal' });
    }
});

app.put('/api/medios/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM lead_sources WHERE id = ?'),
    async (req, res) => {
        const { id } = req.params;
        const { nombre, parent_id } = req.body;
        const nombreLimpio = (nombre || '').trim();

        if (!nombreLimpio) return res.status(400).json({ error: 'El nombre del canal es obligatorio.' });

        const db = pool.promise();

        try {
            const [actual] = await db.query(
                'SELECT id, empresa_id, parent_id FROM lead_sources WHERE id = ? LIMIT 1',
                [id],
            );
            if (!actual.length) return res.status(404).json({ error: 'Canal no encontrado.' });

            const empresaId = actual[0].empresa_id;
            const parentObjetivo = parent_id || null;

            if (parentObjetivo === id) {
                return res.status(400).json({ error: 'Un canal no puede ser padre de sí mismo.' });
            }

            if (parentObjetivo) {
                const [padre] = await db.query(
                    'SELECT id FROM lead_sources WHERE id = ? AND empresa_id = ? LIMIT 1',
                    [parentObjetivo, empresaId],
                );
                if (!padre.length) {
                    return res.status(400).json({ error: 'El canal padre no existe en esta empresa.' });
                }
            }

            const [duplicado] = await db.query(
                `SELECT id FROM lead_sources
                 WHERE empresa_id = ? AND nombre = ? AND id <> ?
                 AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
                 LIMIT 1`,
                [empresaId, nombreLimpio, id, parentObjetivo, parentObjetivo],
            );
            if (duplicado.length) {
                return res.status(409).json({ error: 'Ya existe un canal con ese nombre en el mismo nivel.' });
            }

            await db.query(
                'UPDATE lead_sources SET nombre = ?, parent_id = ? WHERE id = ?',
                [nombreLimpio, parentObjetivo, id],
            );

            res.status(200).json({ mensaje: 'Canal actualizado', id, nombre: nombreLimpio, parent_id: parentObjetivo });
        } catch (error) {
            console.error('❌ ERROR AL ACTUALIZAR CANAL:', error.message);
            res.status(500).json({ error: error.message || 'Error al actualizar canal' });
        }
    },
);

app.delete('/api/medios/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM lead_sources WHERE id = ?'),
    (req, res) => {
        const { id } = req.params;

        pool.query('DELETE FROM lead_sources WHERE id = ?', [id], (error) => {
            if (error) {
                console.error('❌ ERROR AL ELIMINAR CANAL:', error.message);
                return res.status(500).json({ error: error.message || 'Error al eliminar canal' });
            }
            res.status(200).json({ mensaje: 'Canal eliminado del catálogo. Los leads existentes conservan su texto histórico.' });
        });
    },
);
// 1. RUTA PARA MOVER DE ETAPA (Drag & Drop)
app.put('/api/leads/:id/etapa',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    async (req, res) => {
    const { id } = req.params;
    const { stage_id } = req.body;
    const db = pool.promise();

    try {
        const [filas] = await db.query(
            `${SQL_LEADS_CON_ESTATUS} WHERE l.id = ? LIMIT 1`,
            [id],
        );
        if (!filas.length) return res.status(404).json({ error: 'Lead no encontrado' });

        const lead = filas[0];
        if (esCancelado(lead)) {
            return res.status(400).json({ error: 'No se puede mover un lead cancelado.' });
        }
        if (!lead.estatus_permite_mover) {
            return res.status(400).json({ error: 'Este estatus no permite mover el lead en el embudo.' });
        }

        const resultado = await moverLeadEtapa(pool, id, stage_id);

        if (resultado.tipo === 'sin_cambio') {
            return res.status(200).json({ mensaje: 'Sin cambio de etapa' });
        }

        res.status(200).json({
            mensaje: '🚀 Lead movido con éxito',
            movimiento: resultado.tipo,
            timestamps_creados: resultado.timestamps_creados,
        });
    } catch (err) {
        const codigo = err.codigo || 500;
        if (codigo >= 500) console.error('❌ Error al mover lead de etapa:', err.message);
        res.status(codigo).json({ error: err.message || 'Error al mover lead de etapa' });
    }
});

// ==========================================
// RUTAS DE AUTENTICACIÓN Y PUENTE FIREBASE
// ==========================================

app.post('/api/login/firebase', (req, res) => {
    try {
        const { uid, email } = req.body;
        console.log("🔍 Datos recibidos del frontend:", { uid, email });

        const queryBuscar = 'SELECT * FROM usuarios WHERE firebase_uid = ? OR email = ? LIMIT 1';
        
        pool.query(queryBuscar, [uid, email], (err, resultados) => {
            if (err) {
                console.error("🚨 ¡ERROR DE MYSQL! ->", err);
                return res.status(500).json({ error: "Error en la base de datos al verificar usuario" });
            }
            
            if (resultados.length === 0) {
                return res.status(403).json({ error: "Tu cuenta no está registrada en el CRM. Habla con tu administrador." });
            }

            const usuario = resultados[0];

            if (!usuario.firebase_uid) {
                pool.query('UPDATE usuarios SET firebase_uid = ? WHERE id = ?', [uid, usuario.id], (errAct) => {
                    if (errAct) console.error("❌ Error vinculando UID en BD:", errAct);
                });
            }

            delete usuario.password_hash;
            return res.status(200).json({ mensaje: "Login exitoso", usuario: usuario });
        });
    } catch (errorFatal) {
        console.error("🚨 ¡ERROR FATAL EN EL CÓDIGO! ->", errorFatal);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
});
// --- CONFIGURACIÓN DEL CARTERO (Nodemailer) ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

transporter.verify().then(() => {
    console.log('✅ Cartero SMTP listo para enviar correos seguros');
}).catch(err => {
    console.log('❌ Error conectando el correo SMTP:', err.message);
});

// ==========================================
// RUTAS DEL COTIZADOR
// ==========================================

// 1. Guardar una nueva cotización
app.post('/api/cotizaciones', (req, res) => {
    const {
        empresa_id, lead_id, usuario_id, 
        tipo_activo, valor_activo, plazo, tipo_renta, 
        porcentaje_vr, vr_calculado, pago_inicial, 
        renta_mensual_sin_iva, renta_mensual_con_iva
    } = req.body;

    const nuevaCotizacionId = crypto.randomUUID();

    const query = `
        INSERT INTO cotizaciones 
        (id, empresa_id, lead_id, usuario_id, tipo_activo, valor_activo, plazo, tipo_renta, porcentaje_vr, vr_calculado, pago_inicial, renta_mensual_sin_iva, renta_mensual_con_iva) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    pool.query(query, [
        nuevaCotizacionId, empresa_id, lead_id || null, usuario_id || null, 
        tipo_activo, valor_activo, plazo, tipo_renta, 
        porcentaje_vr, vr_calculado, pago_inicial, 
        renta_mensual_sin_iva, renta_mensual_con_iva
    ], (error) => {
        if (error) {
            console.error("❌ ERROR AL GUARDAR COTIZACIÓN:", error.sqlMessage || error);
            return res.status(500).json({ error: error.sqlMessage || "Error al guardar en BD" });
        }
        res.status(201).json({ mensaje: "✅ Cotización guardada con éxito", id: nuevaCotizacionId });
    });
});

// 2. Obtener todas las cotizaciones de un Prospecto (Lead) en específico
app.get('/api/cotizaciones/lead/:lead_id', (req, res) => {
    const { lead_id } = req.params;
    pool.query('SELECT * FROM cotizaciones WHERE lead_id = ? ORDER BY fecha_creacion DESC', [lead_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});


app.get('/api/cotizaciones/empresa/:empresa_id', (req, res) => {
    const { empresa_id } = req.params;
    const { usuario_id, rol } = req.query; 
    
    // Usamos GROUP BY c.id para colapsar cualquier duplicado fantasma
    let query = `
        SELECT c.*, l.nombre as lead_nombre, u.nombre as agente_nombre 
        FROM cotizaciones c
        LEFT JOIN leads l ON c.lead_id = l.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.empresa_id = ?
    `;
    
    const params = [empresa_id];

    if (rol === 'agente') {
        query += ` AND c.usuario_id = ?`;
        params.push(usuario_id);
    }

    // El GROUP BY va ANTES del ORDER BY
    query += ` GROUP BY c.id ORDER BY c.fecha_creacion DESC`;
    
    pool.query(query, params, (error, resultados) => {
        if (error) {
            console.error("❌ ERROR AL OBTENER HISTORIAL:", error.sqlMessage || error);
            return res.status(500).json({ error: error.sqlMessage || "Error al leer BD" });
        }
        res.status(200).json(resultados);
    });
});

// 4. Vincular una cotización existente a un prospecto
app.put('/api/cotizaciones/:id/vincular-lead', (req, res) => {
    const { id } = req.params;
    const { lead_id } = req.body;
    
    pool.query('UPDATE cotizaciones SET lead_id = ? WHERE id = ?', [lead_id, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: "✅ Cotización vinculada al prospecto" });
    });
});


// =========================================================================
// RUTAS DEL DASHBOARD (ESTADÍSTICAS)
// =========================================================================
app.get('/api/dashboard/:empresa_id', verificarToken, revisarRol(['super_admin', 'admin_empresa', 'supervisor', 'agente']), validarEmpresaParam('empresa_id'), async (req, res) => {
    const { empresa_id } = req.params;

    try {
        await asegurarCatalogoEstatus(pool, empresa_id);
    } catch (errSeed) {
        console.error('🚨 Error al sembrar estatus (dashboard):', errSeed.message);
        return res.status(500).json({ error: 'No se pudo inicializar estatus para estadísticas.' });
    }

    let leadsQuery = `
        SELECT COUNT(*) as totalLeads, SUM(l.valor) as totalValor
        FROM leads l
        INNER JOIN lead_estatus e ON l.estatus_id = e.id
        WHERE l.empresa_id = ? AND e.incluir_en_suma = 1
    `;
    let cotizacionesQuery = 'SELECT COUNT(*) as totalCotizaciones FROM cotizaciones WHERE empresa_id = ?';

    const params = [empresa_id];

    // Si el usuario autenticado es agente, forzamos el filtro a su propio id (ignoramos query string).
    if (req.usuarioCRM.rol === 'agente') {
        leadsQuery += ' AND usuario_id = ?';
        cotizacionesQuery += ' AND usuario_id = ?';
        params.push(req.usuarioCRM.id);
    }

    // Ejecutamos la consulta de Leads y Valor
    pool.query(leadsQuery, params, (err1, results1) => {
        if (err1) {
            console.error("❌ Error en la base de datos (Leads):", err1.message);
            return res.status(500).json({ error: err1.message });
        }

        // Ejecutamos la consulta de Cotizaciones
        pool.query(cotizacionesQuery, params, (err2, results2) => {
            if (err2) {
                console.error("❌ Error en la base de datos (Cotizaciones):", err2.message);
                return res.status(500).json({ error: err2.message });
            }

            // Nuestro chismoso nos dirá qué encontró exactamente
            console.log("📊 Datos calculados para el Dashboard:", results1[0], results2[0]);

            res.status(200).json({
                totalLeads: results1[0].totalLeads || 0,
                totalValor: results1[0].totalValor || 0,
                totalCotizaciones: results2[0].totalCotizaciones || 0
            });
        });
    });
});

// 10. Encendemos el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor CRM corriendo en: http://localhost:${PORT}`);
});