const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verificarToken, revisarRol, validarEmpresaParam } = require('../middlewares/authMiddleware');

// Este endpoint es SOLO para super_admin, admin_empresa y supervisor.
// Los vendedores (agente) NO ven KPIs generales, solo su propia comisión (ver lib/comisiones.js).

// Nombre exacto de la etapa que representa un cierre/colocación ganada.
const STAGE_COLOCADO = 'COLOCADO';
const META_PROSPECTOS_MES = 15;

/**
 * Resuelve qué usuarios (vendedores) puede ver el solicitante, según su rol.
 * - agente: solo él mismo.
 * - supervisor: él mismo + sus agentes a cargo (usuarios.supervisor_id).
 * - admin_empresa / super_admin: null => sin filtro, ve toda la empresa.
 */
async function resolverUsuariosVisibles(db, usuarioCRM) {
  if (usuarioCRM.rol === 'agente') {
    return [usuarioCRM.id];
  }
  if (usuarioCRM.rol === 'supervisor') {
    const [subs] = await db.query('SELECT id FROM usuarios WHERE supervisor_id = ?', [usuarioCRM.id]);
    return [usuarioCRM.id, ...subs.map((s) => s.id)];
  }
  return null;
}

function construirFiltroUsuarios(usuarioIds, alias = 'l') {
  if (!usuarioIds || usuarioIds.length === 0) return { sql: '', params: [] };
  const placeholders = usuarioIds.map(() => '?').join(', ');
  return { sql: ` AND ${alias}.usuario_id IN (${placeholders}) `, params: usuarioIds };
}

router.get(
  '/api/dashboard/kpis/:empresa_id',
  verificarToken,
  revisarRol(['super_admin', 'admin_empresa', 'supervisor']),
  validarEmpresaParam('empresa_id'),
  async (req, res) => {
    const { empresa_id } = req.params;
    const db = pool.promise();

    // Mes objetivo para las métricas mensuales (formato YYYY-MM). Default: mes actual.
    const mesQuery = req.query.mes;
    const mesObjetivo = mesQuery && /^\d{4}-\d{2}$/.test(mesQuery)
      ? mesQuery
      : new Date().toISOString().slice(0, 7);

    try {
      const usuarioIds = await resolverUsuariosVisibles(db, req.usuarioCRM);
      const filtro = construirFiltroUsuarios(usuarioIds, 'l');

      // 1. Total histórico de leads (para conversión y efectividad global acumulada)
      const [[{ totalLeads }]] = await db.query(
        `SELECT COUNT(*) as totalLeads
         FROM leads l
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND le.incluir_en_suma = 1 ${filtro.sql}`,
        [empresa_id, ...filtro.params],
      );

      // 2. Total histórico de leads colocados (llegaron alguna vez a la etapa COLOCADO)
      const [[{ totalColocados }]] = await db.query(
        `SELECT COUNT(DISTINCT l.id) as totalColocados
         FROM leads l
         JOIN lead_etapas_historial leh ON leh.lead_id = l.id
         JOIN pipeline_stages ps ON ps.id = leh.stage_id
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND ps.nombre_etapa = ? AND le.incluir_en_suma = 1 ${filtro.sql}`,
        [empresa_id, STAGE_COLOCADO, ...filtro.params],
      );

      // 3. Colocados por vendedor (histórico) — para "total de colocación... por vendedor"
      const [colocadosPorVendedor] = await db.query(
        `SELECT u.id as usuario_id, u.nombre, COUNT(DISTINCT l.id) as colocados
         FROM leads l
         JOIN lead_etapas_historial leh ON leh.lead_id = l.id
         JOIN pipeline_stages ps ON ps.id = leh.stage_id
         JOIN usuarios u ON u.id = l.usuario_id
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND ps.nombre_etapa = ? AND le.incluir_en_suma = 1 ${filtro.sql}
         GROUP BY u.id, u.nombre
         ORDER BY colocados DESC`,
        [empresa_id, STAGE_COLOCADO, ...filtro.params],
      );

      // 4. Prospectos por vendedor (histórico total)
      const [prospectosPorVendedor] = await db.query(
        `SELECT u.id as usuario_id, u.nombre, COUNT(*) as prospectos
         FROM leads l
         JOIN usuarios u ON u.id = l.usuario_id
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND le.incluir_en_suma = 1 ${filtro.sql}
         GROUP BY u.id, u.nombre
         ORDER BY prospectos DESC`,
        [empresa_id, ...filtro.params],
      );

      // 5. Prospectos del mes objetivo por vendedor, vs meta de 15.
      //    "No repetidos": si el mismo teléfono o correo ya aparece más de una vez
      //    dentro del mes, solo cuenta una vez hacia la meta.
      const [metaPorVendedor] = await db.query(
        `SELECT u.id as usuario_id, u.nombre,
                COUNT(*) as prospectos_mes,
                COUNT(DISTINCT COALESCE(NULLIF(l.telefono, ''), NULLIF(l.correo, ''), l.id)) as prospectos_mes_no_repetidos
         FROM leads l
         JOIN usuarios u ON u.id = l.usuario_id
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND le.incluir_en_suma = 1 AND DATE_FORMAT(l.created_at, '%Y-%m') = ? ${filtro.sql}
         GROUP BY u.id, u.nombre
         ORDER BY u.nombre ASC`,
        [empresa_id, mesObjetivo, ...filtro.params],
      );

      // 6. Colocados del mes objetivo (general y por vendedor), según cuándo alcanzaron COLOCADO
      const [colocadosMesPorVendedor] = await db.query(
        `SELECT u.id as usuario_id, u.nombre, COUNT(DISTINCT l.id) as colocados_mes
         FROM leads l
         JOIN lead_etapas_historial leh ON leh.lead_id = l.id
         JOIN pipeline_stages ps ON ps.id = leh.stage_id
         JOIN usuarios u ON u.id = l.usuario_id
         JOIN lead_estatus le ON le.id = l.estatus_id
         WHERE l.empresa_id = ? AND ps.nombre_etapa = ? AND le.incluir_en_suma = 1
           AND DATE_FORMAT(leh.alcanzado_at, '%Y-%m') = ? ${filtro.sql}
         GROUP BY u.id, u.nombre`,
        [empresa_id, STAGE_COLOCADO, mesObjetivo, ...filtro.params],
      );
      const colocadosMesGeneral = colocadosMesPorVendedor.reduce((acc, v) => acc + v.colocados_mes, 0);

      const indiceConversion = totalLeads > 0 ? (totalColocados / totalLeads) * 100 : 0;

      res.status(200).json({
        mes: mesObjetivo,
        meta_prospectos_mes: META_PROSPECTOS_MES,
        indice_conversion: Number(indiceConversion.toFixed(2)),
        efectividad_global: Number(indiceConversion.toFixed(2)), // colocados/prospectos acumulado (mismo cálculo, alcance global de la empresa)
        total_leads: totalLeads,
        total_colocados: totalColocados,
        colocados_mes_general: colocadosMesGeneral,
        prospectos_por_vendedor: prospectosPorVendedor,
        colocados_por_vendedor: colocadosPorVendedor,
        meta_por_vendedor: metaPorVendedor,
        colocados_mes_por_vendedor: colocadosMesPorVendedor,
      });
    } catch (error) {
      console.error('❌ Error al calcular KPIs del dashboard:', error);
      res.status(500).json({ error: 'No se pudieron calcular los indicadores del dashboard.' });
    }
  },
);

module.exports = router;
