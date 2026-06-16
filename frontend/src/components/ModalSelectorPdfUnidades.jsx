import { useEffect, useState } from 'react';
/**
 * Selector de unidades para generar PDF en vivo (ninguna seleccionada por defecto).
 */
const ModalSelectorPdfUnidades = ({
  abierto,
  cantidadUnidades = 1,
  onCerrar,
  onGenerar,
  generando = false,
}) => {
  const [seleccionadas, setSeleccionadas] = useState(new Set());

  useEffect(() => {
    if (!abierto) return;
    setSeleccionadas(new Set());
  }, [abierto, cantidadUnidades]);

  if (!abierto) return null;

  const toggle = (indice) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(indice)) next.delete(indice);
      else next.add(indice);
      return next;
    });
  };

  const seleccionarTodas = () => {
    setSeleccionadas(new Set(Array.from({ length: cantidadUnidades }, (_, i) => i + 1)));
  };

  const confirmar = () => {
    const indices = Array.from(seleccionadas).sort((a, b) => a - b);
    if (!indices.length) {
      alert('Selecciona al menos una unidad para generar el PDF.');
      return;
    }
    onGenerar?.(indices);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
        <h2 className="text-slate-900 font-bold text-lg mb-2">Generar PDF en vivo</h2>
        <p className="text-slate-600 text-sm mb-5 leading-relaxed">
          Elige qué unidades incluir. Los PDF se generan <strong>sin folio</strong> y{' '}
          <strong>no se guardan</strong> en el historial.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {Array.from({ length: cantidadUnidades }, (_, i) => i + 1).map((n) => {
            const activa = seleccionadas.has(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  activa
                    ? 'bg-primary text-white border-primary'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Unidad {n}
              </button>
            );
          })}
        </div>

        {cantidadUnidades > 1 && (
          <button
            type="button"
            onClick={seleccionarTodas}
            className="text-xs font-bold text-primary hover:brightness-75 underline mb-4"
          >
            Seleccionar todas
          </button>
        )}

        <p className="text-[11px] text-slate-500 mb-6">
          {seleccionadas.size === 0
            ? 'Ninguna unidad seleccionada.'
            : `${seleccionadas.size} unidad(es) seleccionada(s).`}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={generando}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={generando}
            className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-[#ea5533] hover:opacity-90 text-white transition-colors shadow-sm disabled:opacity-50"
          >
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalSelectorPdfUnidades;
