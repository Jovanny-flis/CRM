const express = require('express');
const router = express.Router();
const db = require('../db'); // Tu conexión a la base de datos de MySQL

// Ruta para obtener la lista tipo Excel con cruce de Leads y Cotizaciones
router.get('/api/reportes/maestro-leads', async (req, res) => {
    try {
        // 1. Simulamos u obtenemos los datos del usuario que inició sesión desde su token/sesión
        // (Ajusta esto según cómo obtengas el usuario autenticado en tu proyecto, ej: req.user)
        const { usuario_id, empresa_id, role } = req.query; 

        // 2. Base de la consulta SQL (El JOIN tipo Excel)
let sql = `
            SELECT 
                l.id AS lead_id,
                l.nombre AS lead_nombre,
                l.tipo_persona AS lead_tipo_persona,
                l.medio AS lead_medio,
                l.created_at AS lead_fecha_creacion,
                le.nombre AS lead_estatus,
                c.folio AS cotizacion_folio,
                c.nombre_activo AS cotizacion_activo,
                c.valor_activo AS cotizacion_valor,
                c.plazo AS cotizacion_plazo,
                c.renta_mensual_con_iva AS cotizacion_renta_total,
                u.nombre AS agente_asignado
            FROM leads l
            LEFT JOIN cotizaciones c ON l.id = c.lead_id
            LEFT JOIN lead_estatus le ON l.estatus_id = le.id
            LEFT JOIN usuarios u ON l.usuario_id = u.id
        `;
// 3. Matriz de condiciones según tu ROL REAL 🛡️
        const whereClauses = [];
        const params = [];

        if (role === 'super_admin') {
            // El super admin ve ABSOLUTAMENTE TODO.
        } 
        else if (role === 'admin_empresa') {
            whereClauses.push('l.empresa_id = ?');
            params.push(empresa_id);
        } 
        else if (role === 'supervisor') {
            whereClauses.push('l.empresa_id = ? AND (l.usuario_id = ? OR l.usuario_id IN (SELECT id FROM usuarios WHERE supervisor_id = ?))');
            params.push(empresa_id, usuario_id, usuario_id);
        } 
        else if (role === 'agente' || role === 'agente_cotizador') {
            whereClauses.push('l.empresa_id = ? AND l.usuario_id = ?');
            params.push(empresa_id, usuario_id);
        } 
        else {
            // 🛡️ CANDADO DE SEGURIDAD: Si el rol no existe o llega mal, bloqueamos todo
            whereClauses.push('1 = 0'); 
        }

        // 4. Armamos el rompecabezas del SQL final si hay condiciones
        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        // Ordenamos por los leads más recientes primero
        sql += ' ORDER BY l.created_at DESC';

// 5. Ejecutamos la consulta envolviéndola en una Promesa nativa (Plan B infalible)
     const rows = await new Promise((resolve, reject) => {
         db.query(sql, params, (err, resultados) => {
             if (err) {
                 reject(err);
             } else {
                 resolve(resultados);
             }
         });
     });

        // Enviamos la respuesta limpia al Frontend
        return res.json({ success: true, data: rows });

    } catch (error) {
        console.error('Error en reporte maestro:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
});

module.exports = router;