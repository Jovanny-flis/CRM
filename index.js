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
const { asegurarCatalogoCanales } = require('./lib/canales');

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

app.post('/api/empresas', verificarToken,revisarRol(['super_admin']),(req, res) => {
    const { nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario } = req.body;
    if (!nombre_comercial) return res.status(400).json({ error: "Nombre comercial es requerido" });

    const query = `INSERT INTO empresas 
    (nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

    pool.query(query, [nombre_comercial, rfc, direccion, telefono, correo, color_principal, color_secundario], (err, result) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(201).json({ mensaje: 'Empresa guardada', id: result.insertId });
    });
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

// Obtener Leads por empresa
app.get('/api/leads/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), (req, res) => {
    const { empresa_id } = req.params;
    const query = `
        SELECT l.*, ps.nombre_etapa 
        FROM leads l
        LEFT JOIN pipeline_stages ps ON l.stage_id = ps.id
        WHERE l.empresa_id = ?
    `;
    pool.query(query, [empresa_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// Crear un nuevo prospecto (Lead)
app.post('/api/leads', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), (req, res) => {
    const { empresa_id, nombre, correo, telefono, valor, medio, stage_id, usuario_id } = req.body;

    if (!puedeOperarEnEmpresa(req.usuarioCRM, empresa_id)) {
        return res.status(403).json({ error: 'No puedes crear leads en otra empresa.' });
    }

    if (!valorEstimadoValido(valor)) {
        return res.status(400).json({ error: 'El valor estimado es obligatorio y debe ser mayor a cero.' });
    }

    const query = `
        INSERT INTO leads (id, empresa_id, nombre, correo, telefono, valor, medio, activo, stage_id, usuario_id) 
        VALUES (UUID(), ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `;
    
    pool.query(query, [
        empresa_id, 
        nombre, 
        correo, 
        telefono, 
        valor,
        medio, 
        stage_id || null, 
        usuario_id || null
    ], (error) => {
        if (error) {
            console.error("❌ ERROR EN MYSQL AL GUARDAR:", error.sqlMessage || error);
            return res.status(500).json({ error: error.sqlMessage || "Error al guardar en BD" });
        }
        res.status(201).json({ mensaje: "Lead creado exitosamente" });
    });
});

// NUEVO: Editar la información de un Lead (Prospecto)
app.put('/api/leads/:id',
    verificarToken,
    revisarRol(['super_admin','supervisor','admin_empresa','agente']),
    validarRecursoEmpresa('SELECT empresa_id FROM leads WHERE id = ?'),
    (req, res) => {
    const { id } = req.params;
    const { nombre, correo, telefono, valor, medio, usuario_id, activo, motivo_desactivacion } = req.body;

    pool.query('SELECT activo FROM leads WHERE id = ?', [id], (errSel, filas) => {
        if (errSel) return res.status(500).json({ error: errSel.message });
        if (!filas.length) return res.status(404).json({ error: 'Lead no encontrado' });

        const leadActual = filas[0];
        if (leadActual.activo === 0) {
            return res.status(400).json({ error: 'No se puede editar un lead inactivo.' });
        }

        if (!valorEstimadoValido(valor)) {
            return res.status(400).json({ error: 'El valor estimado es obligatorio y debe ser mayor a cero.' });
        }

        const desactivar = activo === 0 || activo === false;
        if (desactivar) {
            const motivo = (motivo_desactivacion || '').trim();
            if (!motivo) {
                return res.status(400).json({ error: 'El motivo de desactivación es obligatorio.' });
            }
            const queryDesactivar = `
                UPDATE leads
                SET nombre = ?, correo = ?, telefono = ?, valor = ?, medio = ?, usuario_id = ?,
                    activo = 0, motivo_desactivacion = ?, desactivado_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            return pool.query(
                queryDesactivar,
                [nombre, correo, telefono, valor, medio, usuario_id, motivo, id],
                (error) => {
                    if (error) {
                        console.error("❌ ERROR AL DESACTIVAR LEAD:", error.sqlMessage || error);
                        return res.status(500).json({ error: error.sqlMessage || "Error al actualizar en BD" });
                    }
                    res.status(200).json({ mensaje: "Lead desactivado con éxito" });
                }
            );
        }

        const query = `
            UPDATE leads
            SET nombre = ?, correo = ?, telefono = ?, valor = ?, medio = ?, usuario_id = ?
            WHERE id = ?
        `;
        pool.query(query, [nombre, correo, telefono, valor, medio, usuario_id, id], (error) => {
            if (error) {
                console.error("❌ ERROR AL ACTUALIZAR LEAD:", error.sqlMessage || error);
                return res.status(500).json({ error: error.sqlMessage || "Error al actualizar en BD" });
            }
            res.status(200).json({ mensaje: "Lead actualizado con éxito" });
        });
    });
});


app.get('/api/medios/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']), validarEmpresaParam('empresa_id'), async (req, res) => {
    const { empresa_id } = req.params;

    try {
        await asegurarCatalogoCanales(pool, empresa_id);
    } catch (errSeed) {
        console.error('🚨 Error al sembrar canales:', errSeed.message);
        return res.status(500).json({ error: 'No se pudo inicializar el catálogo de canales.' });
    }

    pool.query(
        `SELECT * FROM lead_sources
         WHERE empresa_id = ?
         ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, nombre ASC`,
        [empresa_id],
        (error, resultados) => {
            if (error) {
                console.error('🚨 ¡ERROR EN MEDIOS! ->', error.message);
                return res.status(500).json({ error: error.message });
            }
            res.status(200).json(resultados);
        },
    );
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
    (req, res) => {
    const { id } = req.params;
    const { stage_id } = req.body;

    pool.query('SELECT activo FROM leads WHERE id = ?', [id], (errSel, filas) => {
        if (errSel) return res.status(500).json({ error: errSel.message });
        if (!filas.length) return res.status(404).json({ error: 'Lead no encontrado' });
        if (filas[0].activo === 0) {
            return res.status(400).json({ error: 'No se puede mover un lead inactivo.' });
        }

        const query = 'UPDATE leads SET stage_id = ? WHERE id = ?';
        pool.query(query, [stage_id, id], (error) => {
            if (error) return res.status(500).json({ error: error.message });
            res.status(200).json({ mensaje: '🚀 Lead movido con éxito' });
        });
    });
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
app.get('/api/dashboard/:empresa_id', verificarToken, revisarRol(['super_admin', 'admin_empresa', 'supervisor', 'agente']), validarEmpresaParam('empresa_id'), (req, res) => {
    const { empresa_id } = req.params;

    let leadsQuery = 'SELECT COUNT(*) as totalLeads, SUM(valor) as totalValor FROM leads WHERE empresa_id = ? AND activo = 1';
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