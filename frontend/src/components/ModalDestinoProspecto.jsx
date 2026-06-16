import { useEffect, useState } from 'react';
import { etiquetaLeadOpcion, leadBloqueaCotizacion, leadsMismoNombre } from '../lib/destinoProspectoCotizacion';

/**
 * @typedef {'solo' | 'nuevo' | 'existente'} TipoDestino
 * @typedef {{ tipo: TipoDestino, leadId?: string, nombre?: string }} DestinoProspecto
 */

const ModalDestinoProspecto = ({
  abierto,
  titulo,
  subtitulo,
  nombreCliente = '',
  leads = [],
  modo = 'guardar',
  pedirNombre = false,
  nombreInicial = '',
  pasoInicial = 'elegir',
  onCerrar,
  onConfirmar,
}) => {
  const [paso, setPaso] = useState(pasoInicial);
  const [leadIdElegido, setLeadIdElegido] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState(nombreInicial);

  const coincidencias = leadsMismoNombre(leads, nombreCliente || nombreInicial);
  const leadsVinculables = leads.filter((l) => !leadBloqueaCotizacion(l));
  const leadsCongelados = leads.length - leadsVinculables.length;

  useEffect(() => {
    if (!abierto) return;
    setPaso(pasoInicial);
    setLeadIdElegido(leadsVinculables[0]?.id || '');
    setNombreNuevo(nombreInicial || nombreCliente || '');
  }, [abierto, nombreInicial, nombreCliente, pasoInicial, leads]);

  if (!abierto) return null;

  const cerrar = () => {
    onCerrar?.();
  };

  const confirmar = (destino) => {
    onConfirmar?.(destino);
  };

  const irNuevo = () => {
    if (pedirNombre || modo === 'historial') {
      setPaso('nombre');
      return;
    }
    confirmar({ tipo: 'nuevo', nombre: nombreCliente.trim() });
  };

  const confirmarNuevo = () => {
    const nombre = String(nombreNuevo || '').trim();
    if (!nombre) {
      alert('Indica el nombre del cliente para la nueva oportunidad.');
      return;
    }
    confirmar({ tipo: 'nuevo', nombre });
  };

  const irExistente = () => {
    if (!leadsVinculables.length) {
      alert('No hay oportunidades disponibles para vincular (las existentes tienen el folio congelado).');
      return;
    }
    setLeadIdElegido(leadsVinculables[0]?.id || '');
    setPaso('existente');
  };

  const confirmarExistente = () => {
    if (!leadIdElegido) {
      alert('Selecciona una oportunidad.');
      return;
    }
    const elegido = leadsVinculables.find((l) => l.id === leadIdElegido);
    if (!elegido) {
      alert('Esa oportunidad tiene el folio congelado y no acepta vinculación.');
      return;
    }
    confirmar({ tipo: 'existente', leadId: leadIdElegido });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-destino-titulo"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
        <h2 id="modal-destino-titulo" className="text-lg font-black text-slate-800 mb-1">
          {titulo}
        </h2>
        {subtitulo && (
          <p className="text-sm text-slate-600 mb-4">{subtitulo}</p>
        )}

        {paso === 'elegir' && (
          <div className="space-y-3">
            {modo === 'guardar' && (
              <button
                type="button"
                onClick={() => confirmar({ tipo: 'solo' })}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700"
              >
                Solo guardar cotización
                <span className="block text-xs font-normal text-slate-500 mt-0.5">
                  Sin prospecto en el tablero; podrás vincular después.
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={irNuevo}
              className="w-full text-left px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 text-sm font-bold text-blue-800"
            >
              Nueva oportunidad en el tablero
              <span className="block text-xs font-normal text-blue-700/90 mt-0.5">
                Crea un prospecto nuevo (aunque ya exista el mismo nombre).
              </span>
            </button>

            {coincidencias.length > 0 && modo === 'guardar' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Ya hay {coincidencias.length} oportunidad(es) con el nombre &quot;{nombreCliente}&quot;.
                Cada trato debe ser su propia tarjeta en el embudo.
              </p>
            )}

            <button
              type="button"
              onClick={irExistente}
              disabled={!leadsVinculables.length}
              className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Vincular a oportunidad existente
              <span className="block text-xs font-normal text-slate-500 mt-0.5">
                Se añadirá al prospecto sin desvincular las cotizaciones que ya tenga.
              </span>
            </button>

            {leadsCongelados > 0 && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {leadsCongelados} oportunidad(es) no aparecen porque tienen el folio congelado.
              </p>
            )}

            <button
              type="button"
              onClick={cerrar}
              className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Cancelar
            </button>
          </div>
        )}

        {paso === 'nombre' && (
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Nombre del cliente
            </label>
            <input
              type="text"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
              placeholder="Nombre para el prospecto"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaso('elegir')}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={confirmarNuevo}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold"
              >
                Crear y vincular
              </button>
            </div>
          </div>
        )}

        {paso === 'existente' && (
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Oportunidad
            </label>
            <select
              value={leadIdElegido}
              onChange={(e) => setLeadIdElegido(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm"
            >
              {leadsVinculables.map((l) => (
                <option key={l.id} value={l.id}>
                  {etiquetaLeadOpcion(l)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaso('elegir')}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={confirmarExistente}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold"
              >
                Vincular
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModalDestinoProspecto;
