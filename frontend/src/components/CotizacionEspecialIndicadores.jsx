import {
  MENSAJE_COTIZACION_PARAMETROS_ESPECIALES,
} from '../lib/cotizacionEspecial';

/** Bolita con relleno de cinta policial (esquina de tarjeta en Leads). */
export function BolitaCotizacionEspecial({ className = '' }) {
  return (
    <span
      className={`cotizacion-especial-cinta-relleno inline-block w-3.5 h-3.5 rounded-full border border-slate-800 shadow-[0_0_0_2px_#ffffff] ${className}`}
      title={MENSAJE_COTIZACION_PARAMETROS_ESPECIALES}
      aria-label={MENSAJE_COTIZACION_PARAMETROS_ESPECIALES}
    />
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
