// 1. Importamos las herramientas
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const cors = require('cors');
const express = require('express');
const mysql = require('mysql2');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const app = express();
const nodemailer = require('nodemailer');
const { verificarToken, revisarRol } = require('./middlewares/authMiddleware');
const pool = require('./db');
// --- INICIALIZAR FIREBASE ADMIN ---
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
    // (O lo que sea que tengas adentro de los paréntesis, déjalo igual)
  });
}



// --- CONFIGURACIÓN DE MIDDLEWARES ---
app.use(cors({
    origin: '*',
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
app.get('/api/usuarios', verificarToken,(req, res) => {
    const query = 'SELECT id, nombre, email, rol, supervisor_id, empresa_id FROM usuarios';
    pool.query(query, (err, resultados) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(200).json(resultados);
    });
});

// 2. Obtener usuarios por empresa (Para los Admin de Empresa)
app.get('/api/usuarios/empresa/:empresa_id', verificarToken, revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { empresa_id } = req.params;
    const query = 'SELECT id, nombre, email, rol, supervisor_id, empresa_id FROM usuarios WHERE empresa_id = ?';
    pool.query(query, [empresa_id], (err, resultados) => {
        if (err) return res.status(500).json({ error: err.sqlMessage });
        res.status(200).json(resultados);
    });
});

// 3. Crear nuevo usuario (Agente, Supervisor o Admin)
// 3. Crear nuevo usuario (Agente, Supervisor o Admin)
app.post('/api/usuarios', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa']), async (req, res) => {
    const { nombre, email, password_hash, rol, supervisor_id, empresa_id } = req.body;
    
    try {
        // Si no envían contraseña desde el front, ponemos una temporal segura por defecto (Firebase exige min 6 caracteres)
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
        
        pool.query(query, [nombre, email, hashedPassword, rol, supId, empresa_id, firebaseUser.uid], (err, result) => {
            if (err) {
                console.error("❌ Error en MySQL al crear usuario:", err.sqlMessage);
                // Si falla MySQL, deberíamos borrarlo de Firebase para no dejar "basura", pero por ahora mandamos el error
                return res.status(500).json({ error: err.sqlMessage });
            }
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
// 4. Editar usuario existente
app.put('/api/usuarios/:id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa']),(req, res) => {
    const { id } = req.params;
    // Si tu formulario también envía una nueva contraseña, asegúrate de recibirla aquí (ej. password)
    const { nombre, email, rol, supervisor_id, empresa_id } = req.body;
    const supId = supervisor_id ? supervisor_id : null;

    // 1. Primero buscamos el firebase_uid del usuario en tu BD
    pool.query('SELECT firebase_uid FROM usuarios WHERE id = ?', [id], async (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error al buscar usuario" });
        if (resultados.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const firebase_uid = resultados[0].firebase_uid;

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
app.delete('/api/usuarios/:id', verificarToken,revisarRol(['super_admin','admin_empresa']),(req, res) => {
    const { id } = req.params;

    // 1. Necesitamos su firebase_uid para borrarlo de Google primero
    pool.query('SELECT firebase_uid FROM usuarios WHERE id = ?', [id], async (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error al buscar usuario" });
        if (resultados.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });

        const firebase_uid = resultados[0].firebase_uid;

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
app.get('/api/pipelines/:empresa_id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { empresa_id } = req.params;
    pool.query('SELECT * FROM pipelines WHERE empresa_id = ? ORDER BY nombre ASC', [empresa_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// Crear un nuevo Pipeline con Nombre y Clave
app.post('/api/pipelines', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { empresa_id, nombre, clave } = req.body;
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
app.put('/api/pipelines/:id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { id } = req.params;
    const { nombre, clave } = req.body;
    const query = `UPDATE pipelines SET nombre = ?, clave = ? WHERE id = ?`;
    
    pool.query(query, [nombre, clave, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: '✅ Pipeline actualizado con éxito' });
    });
});


// Agregar una nueva Etapa
app.post('/api/etapas', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { pipeline_id, nombre_etapa, orden, color_hex } = req.body;
    const nuevaEtapaId = crypto.randomUUID();
    const query = `INSERT INTO pipeline_stages (id, pipeline_id, nombre_etapa, orden, color_hex) VALUES (?, ?, ?, ?, ?)`;
    
    pool.query(query, [nuevaEtapaId, pipeline_id, nombre_etapa, orden, color_hex || '#CCCCCC'], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(201).json({ mensaje: '✅ Etapa agregada al pipeline', id: nuevaEtapaId });
    });
});

// Obtener las etapas de un pipeline
app.get('/api/etapas/:pipeline_id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { pipeline_id } = req.params;
    pool.query('SELECT * FROM pipeline_stages WHERE pipeline_id = ? ORDER BY orden ASC', [pipeline_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// NUEVO: Editar el nombre y color de una Etapa existente
app.put('/api/etapas/:id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { id } = req.params;
    const { nombre_etapa, color_hex } = req.body;
    const query = `UPDATE pipeline_stages SET nombre_etapa = ?, color_hex = ? WHERE id = ?`;
    
    pool.query(query, [nombre_etapa, color_hex, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: '✅ Etapa actualizada' });
    });
});

// Obtener Leads por empresa
app.get('/api/leads/:empresa_id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
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
// Crear un nuevo prospecto (Lead)
app.post('/api/leads', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { empresa_id, nombre, correo, telefono, valor, medio, stage_id, usuario_id } = req.body;
    
    console.log("📥 INTENTANDO GUARDAR NUEVO LEAD:", req.body);

    const query = `
        INSERT INTO leads (id, empresa_id, nombre, correo, telefono, valor, medio, stage_id, usuario_id) 
        VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    pool.query(query, [
        empresa_id, 
        nombre, 
        correo, 
        telefono, 
        valor || 0, // <--- Aquí guardamos el valor (si viene vacío, pone 0)
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
app.put('/api/leads/:id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { id } = req.params;
    const { nombre, correo, telefono, valor, medio, usuario_id } = req.body;
    
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



app.get('/api/medios/:tenant_id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { tenant_id } = req.params;
    pool.query('SELECT * FROM lead_sources WHERE tenant_id = ? ORDER BY nombre ASC', [tenant_id], (error, resultados) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json(resultados);
    });
});

// 1. RUTA PARA MOVER DE ETAPA (Drag & Drop)
app.put('/api/leads/:id/etapa', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { id } = req.params;
    const { stage_id } = req.body;
    const query = 'UPDATE leads SET stage_id = ? WHERE id = ?';
    
    pool.query(query, [stage_id, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: '🚀 Lead movido con éxito' });
    });
});

// 2. RUTA PARA EDITAR INFORMACIÓN (El formulario que acabamos de hacer)
app.put('/api/leads/:id', verificarToken,revisarRol(['super_admin','supervisor','admin_empresa','agente']),(req, res) => {
    const { id } = req.params;
    const { nombre, correo, telefono, valor, medio, usuario_id } = req.body;
    const query = `
        UPDATE leads 
        SET nombre = ?, correo = ?, telefono = ?, valor = ?, medio = ?, usuario_id = ? 
        WHERE id = ?
    `;
    pool.query(query, [nombre, correo, telefono, valor, medio, usuario_id, id], (error) => {
        if (error) return res.status(500).json({ error: error.message });
        res.status(200).json({ mensaje: "✅ Lead actualizado" });
    });
});

// ==========================================
// RUTAS DE AUTENTICACIÓN Y RECUPERACIÓN
// ==========================================

// ==========================================
// RUTAS DE AUTENTICACIÓN Y PUENTE FIREBASE
// ==========================================

app.post('/api/login/firebase', (req, res) => {
    const { uid, email } = req.body;

    // Buscamos al usuario por su UID de Firebase, o por su correo (para usuarios viejos)
    const queryBuscar = 'SELECT * FROM usuarios WHERE firebase_uid = ? OR email = ? LIMIT 1';
    
    pool.query(queryBuscar, [uid, email], (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error en la base de datos al verificar usuario" });
        
        // Si no existe ni el correo ni el UID, lo rechazamos
        if (resultados.length === 0) {
            return res.status(403).json({ error: "Tu cuenta no está registrada en el CRM. Habla con tu administrador." });
        }

        const usuario = resultados[0];

        // EL AUTOVINCULADOR: Si el usuario es viejo y no tenía su UID, se lo guardamos para siempre
        if (!usuario.firebase_uid) {
            pool.query('UPDATE usuarios SET firebase_uid = ? WHERE id = ?', [uid, usuario.id], (errAct) => {
                if (errAct) console.error("❌ Error vinculando UID en BD:", errAct);
            });
        }

        // Por seguridad, le borramos la contraseña encriptada vieja antes de mandarlo a React
        delete usuario.password_hash;
        delete usuario.reset_token;

        // Le enviamos a React el perfil oficial sacado de MySQL
        res.status(200).json({ mensaje: "Login exitoso", usuario: usuario });
    });
});

// --- CONFIGURACIÓN DEL CARTERO (Nodemailer) ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    tls: { rejectUnauthorized: false }
});

transporter.verify().then(() => {
    console.log('✅ Cartero SMTP listo para enviar correos seguros');
}).catch(err => {
    console.log('❌ Error conectando el correo SMTP:', err.message);
});

app.post('/api/olvide-password', (req, res) => {
    const { email } = req.body;
    pool.query('SELECT * FROM usuarios WHERE email = ?', [email], (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error en la base de datos" });
        if (resultados.length === 0) return res.status(200).json({ mensaje: "Si el correo existe, se ha enviado un enlace." });

        const token = crypto.randomBytes(32).toString('hex');
        const expira = new Date(Date.now() + 3600000); // 1 hora

        pool.query('UPDATE usuarios SET reset_token = ?, reset_token_expira = ? WHERE email = ?', 
        [token, expira, email], (err) => {
            if (err) return res.status(500).json({ error: "Error al generar token" });
            const enlaceRestablecer = `http://localhost:5173/reset-password?token=${token}`;
            const mailOptions = {
                from: `"Soporte CRM" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Soporte CRM - Recuperación de Contraseña',
                html: `
                    <h2>Recuperación de contraseña</h2>
                    <p>Has solicitado restablecer tu contraseña en el CRM.</p>
                    <p>Haz clic en el siguiente enlace para crear una nueva:</p>
                    <a href="${enlaceRestablecer}" style="padding: 10px 20px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">Restablecer mi contraseña</a>
                `
            };
            transporter.sendMail(mailOptions, (error) => {
                if (error) return res.status(500).json({ error: "Error enviando el correo." });
                res.status(200).json({ mensaje: "Si el correo existe, se ha enviado un enlace." });
            });
        });
    });
});

app.post('/api/reset-password', async (req, res) => {
    const { token, nuevaPassword } = req.body;
    pool.query('SELECT * FROM usuarios WHERE reset_token = ?', [token], async (err, resultados) => {
        if (err) return res.status(500).json({ error: "Error verificando token" });
        if (resultados.length === 0) return res.status(400).json({ error: "El enlace es inválido o ha caducado" });

        const usuario = resultados[0];
        try {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(nuevaPassword, salt);
            pool.query('UPDATE usuarios SET password_hash = ?, reset_token = NULL, reset_token_expira = NULL WHERE id = ?', 
            [passwordHash, usuario.id], (err) => {
                if (err) return res.status(500).json({ error: "Error guardando la contraseña" });
                res.status(200).json({ mensaje: "Contraseña actualizada con éxito" });
            });
        } catch (error) {
            res.status(500).json({ error: "Error al procesar la contraseña" });
        }
    });
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

// 3. Obtener el historial completo de cotizaciones de la empresa
app.get('/api/cotizaciones/empresa/:empresa_id', (req, res) => {
    const { empresa_id } = req.params;
    const { usuario_id, rol } = req.query; // Recibimos quién hace la petición
    
    // Hacemos un JOIN con leads para el nombre del cliente y con usuarios para el nombre del agente
    let query = `
        SELECT c.*, l.nombre as lead_nombre, u.nombre as agente_nombre 
        FROM cotizaciones c
        LEFT JOIN leads l ON c.lead_id = l.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.empresa_id = ?
    `;
    
    const params = [empresa_id];

    // Si es un agente normal, agregamos un filtro para que SOLO vea las suyas
    if (rol === 'agente') {
        query += ` AND c.usuario_id = ?`;
        params.push(usuario_id);
    }

    query += ` ORDER BY c.fecha_creacion DESC`;
    
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
app.get('/api/dashboard/:empresa_id', verificarToken, revisarRol(['super_admin', 'admin_empresa', 'supervisor', 'agente']), (req, res) => {
    const { empresa_id } = req.params;
    const { usuario_id, rol } = req.query;
console.log("🔍 Buscando Dashboard -> Empresa:", empresa_id, "| Usuario ID:", usuario_id, "| Rol:", rol);
    let leadsQuery = 'SELECT COUNT(*) as totalLeads, SUM(valor) as totalValor FROM leads WHERE empresa_id = ?';
    let cotizacionesQuery = 'SELECT COUNT(*) as totalCotizaciones FROM cotizaciones WHERE empresa_id = ?';
    
    const params = [empresa_id];

    // Si la consulta la hace un agente, filtramos para que solo sume sus propios datos
    if (rol === 'agente') {
        leadsQuery += ' AND usuario_id = ?';
        cotizacionesQuery += ' AND usuario_id = ?';
        params.push(usuario_id);
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