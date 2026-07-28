const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verificarToken, revisarRol, validarEmpresaParam } = require('../middlewares/authMiddleware');
const { calcularResultadosCotizacion } = require('./cotizacion-calculo');

// Nombre exacto de la etapa que dispara el pago de comisión.
const STAGE_COLOCADO = 'COLOCADO';
// Porcentaje del monto de "comisión de apertura" (sin IVA) que se lleva el vendedor asignado.
const PORCENTAJE_COMISION_VENDEDOR = 0.5;

/**
 * Resuelve qué usuarios (vendedores) puede ver el solicitante, según su rol.
 * - agente: SOLO él mismo (nunca ve comisión de otros).
 * - supervisor: él mismo + sus agentes a cargo.
 * - admin_empresa / super_admin: null => sin filtro, ve a todos en la empresa.
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
  '/api/comisiones/:empresa_id',
  verificarToken,
  revisarRol(['super_admin', 'admin_empresa', 'supervisor', 'agente']),
  validarEmpresaParam('empresa_id'),
  async (req, res) => {
    const { empresa_id } = req.params;
    const db = pool.promise();

    const mesQuery = req.query.mes;
    const mesObjetivo = mesQuery && /^\d{4}-\d{2}$/.test(mesQuery)
      ? mesQuery
      : new Date().toISOString().slice(0, 7);

    try {
      const usuarioIds = await resolverUsuariosVisibles(db, req.usuarioCRM);
      const filtro = construirFiltroUsuarios(usuarioIds, 'l');

      // Para el mes objetivo: cada lead que llegó a COLOCADO ese mes (según lead_etapas_historial),
      // junto con su cotización principal (la de folio más bajo, igual que en el tablero) y su vendedor.
      const [filas] = await db.query(
        `SELECT
            l.id as lead_id, l.nombre as lead_nombre, u.id as usuario_id, u.nombre as usuario_nombre,
            leh.alcanzado_at,
            c.id as cotizacion_id, c.folio,
            c.valor_activo, c.pago_inicial_valor, c.is_pago_inicial_pct,
            c.comision_valor, c.is_comision_pct
         FROM leads l
         JOIN lead_etapas_historial leh ON leh.lead_id = l.id
         JOIN pipeline_stages ps ON ps.id = leh.stage_id AND ps.nombre_etapa = ?
         JOIN usuarios u ON u.id = l.usuario_id
         JOIN cotizaciones c ON c.id = (
           SELECT c2.id FROM cotizaciones c2 WHERE c2.lead_id = l.id ORDER BY c2.folio ASC LIMIT 1
         )
         WHERE l.empresa_id = ? AND DATE_FORMAT(leh.alcanzado_at, '%Y-%m') = ? ${filtro.sql}`,
        [STAGE_COLOCADO, empresa_id, mesObjetivo, ...filtro.params],
      );

      // Calculamos la comisión real de cada cotización con la MISMA fórmula del cotizador
      // (lib/cotizacion-calculo.js), para que el número nunca se desincronice del PDF/formulario.
      const porVendedor = {};
      let totalGeneral = 0;

      for (const fila of filas) {
        let comisionSub = 0;
        try {
          const { res: resultado } = calcularResultadosCotizacion(
            {
              valorActivo: fila.valor_activo,
              pagoInicial: fila.pago_inicial_valor,
              isPagoInicialPct: !!fila.is_pago_inicial_pct,
              comision: fila.comision_valor,
              isComisionPct: !!fila.is_comision_pct,
            },
            { modoEspecial: true },
          );
          comisionSub = resultado?.comisionSub || 0;
        } catch (errCalculo) {
          console.error('⚠️ No se pudo calcular comisión de la cotización', fila.cotizacion_id, errCalculo.message);
          continue;
        }

        const comisionVendedor = comisionSub * PORCENTAJE_COMISION_VENDEDOR;

        if (!porVendedor[fila.usuario_id]) {
          porVendedor[fila.usuario_id] = {
            usuario_id: fila.usuario_id,
            nombre: fila.usuario_nombre,
            colocaciones: 0,
            comision_total: 0,
            detalle: [],
          };
        }
        porVendedor[fila.usuario_id].colocaciones += 1;
        porVendedor[fila.usuario_id].comision_total += comisionVendedor;
        porVendedor[fila.usuario_id].detalle.push({
          lead_id: fila.lead_id,
          lead_nombre: fila.lead_nombre,
          cotizacion_id: fila.cotizacion_id,
          folio: fila.folio,
          fecha_colocado: fila.alcanzado_at,
          valor_activo: Number(fila.valor_activo) || 0,
          comision: Number(comisionVendedor.toFixed(2)),
        });
        totalGeneral += comisionVendedor;
      }

      // Ordenamos el detalle de cada vendedor por fecha de colocación (más reciente primero)
      Object.values(porVendedor).forEach((v) => {
        v.detalle.sort((a, b) => new Date(b.fecha_colocado) - new Date(a.fecha_colocado));
      });

      res.status(200).json({
        mes: mesObjetivo,
        porcentaje_vendedor: PORCENTAJE_COMISION_VENDEDOR * 100,
        total_general: Number(totalGeneral.toFixed(2)),
        por_vendedor: Object.values(porVendedor).map((v) => ({
          ...v,
          comision_total: Number(v.comision_total.toFixed(2)),
        })),
      });
    } catch (error) {
      console.error('❌ Error al calcular comisiones:', error);
      res.status(500).json({ error: 'No se pudieron calcular las comisiones.' });
    }
  },
);

module.exports = router;
