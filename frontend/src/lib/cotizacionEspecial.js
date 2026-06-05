/** Utilidades UI para cotización especial. */

export const MENSAJE_COTIZACION_PARAMETROS_ESPECIALES = 'Cotización con parámetros especiales';

export const ESTADO_AUTORIZACION_PENDIENTE = 'pendiente';
export const ESTADO_AUTORIZACION_APROBADA = 'aprobada';
export const ESTADO_AUTORIZACION_RECHAZADA = 'rechazada';
export const CODIGO_PENDIENTE_AUTORIZACION = 'pendiente_autorizacion';

export const esCotizacionEspecial = (cot) =>
  cot?.es_especial === 1 || cot?.es_especial === true
  || cot?.cotizacion_es_especial === 1 || cot?.cotizacion_es_especial === true;

/** Lead con cotización activa vinculada en modo especial. */
export const leadTieneCotizacionEspecial = (lead) =>
  Boolean(lead?.cotizacion_id) && esCotizacionEspecial(lead);

export const cotizacionPendienteAutorizacion = (cot) =>
  esCotizacionEspecial(cot)
  && (cot?.autorizacion_estado === ESTADO_AUTORIZACION_PENDIENTE
    || cot?.cotizacion_autorizacion_estado === ESTADO_AUTORIZACION_PENDIENTE);

export const leadPendienteAutorizacion = (lead) =>
  lead?.estatus_codigo === CODIGO_PENDIENTE_AUTORIZACION;

export const puedeAutorizarEspecial = (usuario) =>
  usuario?.rol === 'supervisor' || usuario?.rol === 'admin_empresa';

export const puedeUsarModoEspecial = (usuario) => {
  const rol = usuario?.rol;
  return rol === 'supervisor' || rol === 'admin_empresa' || rol === 'agente' || rol === 'agente_cotizador';
};

export const claseMarcoCotizacionEspecial = () =>
  'ring-4 ring-offset-2 ring-[#ea5533]/80 bg-gradient-to-br from-[#ea5533]/20 to-slate-50/40';

export const claseFilaHistorialEspecial = () => 'cotizacion-especial-marco-historial';

/** Cotizaciones especiales no se replican ni reasignan (marco permanente en historial). */
export const cotizacionEspecialBloqueaAccionesHistorial = (cot) => esCotizacionEspecial(cot);
