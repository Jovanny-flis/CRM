import { formatearFolio, etiquetaActivoCotizacion } from '../lib/cotizacionesLead';
import { esCotizacionEspecial } from '../lib/cotizacionEspecial';
import { BolitaCotizacionEspecial } from './CotizacionEspecialIndicadores';

const formatoMoneda = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);

/**
 * Lista compacta scrolleable de folios vinculados a un prospecto (master-detail).
 */
const ListaCotizacionesLead = ({ cotizaciones, seleccionadaId, onSeleccionar }) => {
  if (!cotizaciones?.length || cotizaciones.length <= 1) return null;

  return (
    <div className="mb-4 shrink-0">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="max-h-[140px] overflow-y-auto divide-y divide-slate-100 shadow-[inset_0_-8px_8px_-8px_rgba(0,0,0,0.06)]">
          {cotizaciones.map((cot) => {
            const activa = cot.id === seleccionadaId;
            return (
              <button
                key={cot.id}
                type="button"
                onClick={() => onSeleccionar(cot.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors border-l-[3px] ${
                  activa
                    ? 'bg-orange-50 border-l-[#ea5533]'
                    : 'border-l-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1 shrink-0 min-w-[4.5rem]">
                  <span className={`text-xs font-black ${activa ? 'text-[#ea5533]' : 'text-slate-800'}`}>
                    {formatearFolio(cot.folio)}
                  </span>
                  {esCotizacionEspecial(cot) && (
                    <BolitaCotizacionEspecial className="shrink-0 text-sm" />
                  )}
                </div>
                <div
                  className="flex-1 min-w-0 text-xs text-slate-600 truncate"
                  title={etiquetaActivoCotizacion(cot)}
                >
                  {etiquetaActivoCotizacion(cot)}
                </div>
                <div className="shrink-0 text-xs font-bold text-primary">
                  {formatoMoneda(cot.renta_mensual_con_iva)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ListaCotizacionesLead;
