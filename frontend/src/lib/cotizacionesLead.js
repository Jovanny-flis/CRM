import { derivarPorcentajeYVr } from './cotizacionFormulario';

/** Utilidades de folios y cotizaciones vinculadas a prospectos. */

export const formatearFolio = (folio) => {
  if (folio == null || folio === '') return null;
  return `FL-${String(folio).padStart(3, '0')}`;
};

/** Texto corto de activo para filas de listado en el modal de lead. */
export const etiquetaActivoCotizacion = (cot) => {
  if (!cot) return 'Sin detalle';
  return cot.nombre_activo || cot.tipo_activo || 'Sin detalle';
};

/** Etiqueta de tarjeta: FL-001 o FL-001 +3 */
export const etiquetaFolioLead = (lead) => {
  const folio = lead?.cotizacion_folio_min ?? lead?.cotizacion_folio;
  if (folio == null || folio === '') return null;
  const base = formatearFolio(folio);
  const cantidad = Number(lead?.cotizaciones_cantidad ?? (lead?.cotizacion_id ? 1 : 0));
  const extra = cantidad > 1 ? cantidad - 1 : 0;
  return extra > 0 ? `${base} +${extra}` : base;
};

/** Mapea fila de cotizaciones → campos usados en el panel del modal de lead. */
export const cotizacionAPanelLead = (cot) => {
  if (!cot) return null;
  const { porcentajeVr, vrCalculado } = derivarPorcentajeYVr(cot);
  return {
    cotizacion_id: cot.id,
    cotizacion_folio: cot.folio,
    cotizacion_tipo_activo: cot.tipo_activo,
    cotizacion_activo: cot.nombre_activo,
    cotizacion_marca: cot.marca,
    cotizacion_modelo: cot.modelo,
    cotizacion_version: cot.version,
    cotizacion_anio: cot.anio,
    cotizacion_valor_activo: cot.valor_activo,
    cotizacion_plazo: cot.plazo,
    cotizacion_enganche: cot.pago_inicial,
    cotizacion_renta: cot.renta_mensual_con_iva,
    cotizacion_renta_sin_iva: cot.renta_mensual_sin_iva,
    cotizacion_vr_calculado: vrCalculado,
    cotizacion_porcentaje_vr: porcentajeVr,
    cotizacion_tipo_renta: cot.tipo_renta,
    cotizacion_es_especial: cot.es_especial,
    cotizacion_autorizacion_estado: cot.autorizacion_estado,
  };
};

/** Deriva porcentaje y VR para tarjetas del modal de lead (incluye datos resumidos del tablero). */
export const derivarVrDesdeCamposLead = (lead) => derivarPorcentajeYVr({
  valor_activo: lead?.cotizacion_valor_activo,
  residual_valor: lead?.residual_valor,
  is_residual_pct: lead?.is_residual_pct,
  porcentaje_vr: lead?.cotizacion_porcentaje_vr,
  vr_calculado: lead?.cotizacion_vr_calculado,
  tasa_anual: lead?.tasa_anual,
});

export const combinarLeadConCotizacion = (lead, cot) => ({
  ...lead,
  ...cotizacionAPanelLead(cot),
});
