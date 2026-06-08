import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import api from '../api';
import PanelDetalleCotizacion from './PanelDetalleCotizacion';
import { AvisoCotizacionParametrosEspeciales } from './CotizacionEspecialIndicadores';
import { esCotizacionEspecial } from '../lib/cotizacionEspecial';

function ModalDetalleCotizacion({
  abierto,
  onCerrar,
  cotizacionId,
  cotizacionInicial = null,
  prospectoNombre,
  agenteNombre,
  onGenerarPdf,
  generandoPdf = false,
}) {
  const [cotizacion, setCotizacion] = useState(cotizacionInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) {
      setCotizacion(null);
      setError('');
      setCargando(false);
      return undefined;
    }

    const id = cotizacionId || cotizacionInicial?.id;
    if (!id) {
      setError('No se encontró la cotización.');
      return undefined;
    }

    let cancelado = false;
    setCargando(true);
    setError('');
    if (cotizacionInicial) setCotizacion(cotizacionInicial);

    api.get(`/cotizaciones/${id}`)
      .then((res) => {
        if (cancelado) return;
        setCotizacion(res.data);
      })
      .catch((err) => {
        if (cancelado) return;
        console.error('Error al cargar detalle de cotización:', err);
        setError('No se pudo cargar el detalle de la cotización.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => { cancelado = true; };
  }, [abierto, cotizacionId, cotizacionInicial]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onEscape = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const nombreProspecto = prospectoNombre
    ?? cotizacion?.lead_nombre
    ?? null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-detalle-cotizacion-titulo"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col relative min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCerrar}
          className="absolute -top-1 right-0 z-10 p-2 rounded-full bg-slate-800/90 text-white/90 hover:bg-slate-700 border border-white/10 transition-colors"
          aria-label="Cerrar detalle de cotización"
        >
          <X size={20} />
        </button>

        <h2 id="modal-detalle-cotizacion-titulo" className="sr-only">
          Detalle de cotización
        </h2>

        {cargando && (
          <div className="bg-[#141414] rounded-2xl p-12 text-center text-slate-400 text-sm font-medium border border-slate-800 animate-pulse">
            Cargando detalle…
          </div>
        )}

        {!cargando && error && (
          <div className="bg-[#141414] rounded-2xl p-8 text-center text-red-300 text-sm font-medium border border-red-900/40">
            {error}
          </div>
        )}

        {!cargando && !error && cotizacion && (
          <div className="flex flex-col gap-3 min-h-0 max-h-[92vh] overflow-y-auto">
            {esCotizacionEspecial(cotizacion) && (
              <AvisoCotizacionParametrosEspeciales className="shrink-0" />
            )}
            <PanelDetalleCotizacion
              cotizacion={cotizacion}
              prospectoNombre={nombreProspecto}
              agenteNombre={agenteNombre ?? cotizacion.agente_nombre}
              onGenerarPdf={onGenerarPdf}
              generandoPdf={generandoPdf}
              mostrarAcciones
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default ModalDetalleCotizacion;
