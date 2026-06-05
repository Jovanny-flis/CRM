import {
  MENSAJE_COTIZACION_PARAMETROS_ESPECIALES,
} from '../lib/cotizacionEspecial';

/** Tachuela indicadora de cotización especial. */
export function BolitaCotizacionEspecial({ className = '' }) {
  return (
    <span
      className={`inline-block text-base leading-none ${className}`}
      title={MENSAJE_COTIZACION_PARAMETROS_ESPECIALES}
      aria-label={MENSAJE_COTIZACION_PARAMETROS_ESPECIALES}
      role="img"
    >
      📌
    </span>
  );
}

/** Aviso en modales de detalle del prospecto o cotización. */
export function AvisoCotizacionParametrosEspeciales({ className = '' }) {
  return (
    <p
      className={`text-sm font-bold text-amber-950 bg-amber-50 border-2 border-amber-500/70 rounded-xl px-4 py-3 flex items-center gap-3 ${className}`}
      role="status"
    >
      <BolitaCotizacionEspecial className="shrink-0" />
      {MENSAJE_COTIZACION_PARAMETROS_ESPECIALES}
    </p>
  );
}
