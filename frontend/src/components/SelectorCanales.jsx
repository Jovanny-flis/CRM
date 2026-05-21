import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Check, MoreVertical, Plus } from 'lucide-react';
import api from '../api';

const MEDIO_DEFAULT = 'Contacto directo';
const ALTURA_PANEL_MAX = 320;

/** Orden de canales raíz (coincide con lib/canales.js) */
const ORDEN_RAIZ = [
  'Referidos de clientes',
  'Marketing digital',
  'Socios',
  'Agentes',
  'Eventos empresariales',
  'Concesionarios',
  'Webinars',
  'Contacto directo',
  'Cotizador',
];

const indiceOrdenRaiz = (nombre) => {
  const idx = ORDEN_RAIZ.indexOf(nombre);
  return idx === -1 ? 999 : idx;
};

const construirArbol = (medios) => {
  const padres = medios
    .filter((m) => !m.parent_id)
    .sort((a, b) => {
      const diff = indiceOrdenRaiz(a.nombre) - indiceOrdenRaiz(b.nombre);
      return diff !== 0 ? diff : a.nombre.localeCompare(b.nombre, 'es');
    });
  const hijosPorPadre = {};
  medios
    .filter((m) => m.parent_id)
    .forEach((m) => {
      if (!hijosPorPadre[m.parent_id]) hijosPorPadre[m.parent_id] = [];
      hijosPorPadre[m.parent_id].push(m);
    });
  Object.values(hijosPorPadre).forEach((arr) =>
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  );
  return { padres, hijosPorPadre };
};

const obtenerPadreDelValor = (value, medios) => {
  if (!value) return null;
  const medio = medios.find((m) => m.nombre === value);
  return medio?.parent_id || null;
};

function SelectorCanales({ empresaId, value, onChange, medios, onMediosActualizados }) {
  const [abierto, setAbierto] = useState(false);
  const [menuAccionId, setMenuAccionId] = useState(null);
  const [modoFormulario, setModoFormulario] = useState(null);
  const [formNombre, setFormNombre] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [gruposExpandidos, setGruposExpandidos] = useState(() => new Set());
  const [panelStyle, setPanelStyle] = useState(null);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const { padres, hijosPorPadre } = useMemo(() => construirArbol(medios), [medios]);
  const textoMostrado = value || MEDIO_DEFAULT;

  const cerrarFormulario = () => {
    setModoFormulario(null);
    setFormNombre('');
    setFormParentId('');
    setEditandoId(null);
  };

  const calcularPosicionPanel = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - rect.bottom - 12;
    const espacioArriba = rect.top - 12;
    const abrirArriba = espacioAbajo < 180 && espacioArriba > espacioAbajo;
    const maxHeight = Math.max(
      120,
      Math.min(ALTURA_PANEL_MAX, abrirArriba ? espacioArriba : espacioAbajo),
    );
    const top = abrirArriba
      ? Math.max(8, rect.top - 8 - maxHeight)
      : rect.bottom + 8;

    setPanelStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 9999,
      top,
    });
  };

  useEffect(() => {
    if (!abierto) {
      setPanelStyle(null);
      return undefined;
    }

    const padreSeleccionado = obtenerPadreDelValor(value, medios);
    if (padreSeleccionado) {
      setGruposExpandidos((prev) => new Set(prev).add(padreSeleccionado));
    }

    calcularPosicionPanel();

    const handleScrollOrResize = () => calcularPosicionPanel();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [abierto, value, medios]);

  useEffect(() => {
    if (!abierto) return undefined;

    const handleClickOutside = (event) => {
      const dentroTrigger = triggerRef.current?.contains(event.target);
      const dentroPanel = panelRef.current?.contains(event.target);
      if (!dentroTrigger && !dentroPanel) {
        setAbierto(false);
        setMenuAccionId(null);
        cerrarFormulario();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierto]);

  const recargarMedios = async () => {
    const res = await api.get(`/medios/${empresaId}`);
    onMediosActualizados(res.data);
  };

  const seleccionar = (nombre) => {
    onChange(nombre);
    setAbierto(false);
    setMenuAccionId(null);
    cerrarFormulario();
  };

  const toggleGrupo = (padreId) => {
    setGruposExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(padreId)) next.delete(padreId);
      else next.add(padreId);
      return next;
    });
  };

  const abrirNuevo = () => {
    setModoFormulario('nuevo');
    setFormNombre('');
    setFormParentId('');
    setEditandoId(null);
    setMenuAccionId(null);
  };

  const abrirNuevoSubcanal = (canalPadre) => {
    setModoFormulario('nuevo-subcanal');
    setFormNombre('');
    setFormParentId(canalPadre.id);
    setEditandoId(null);
    setMenuAccionId(null);
    setGruposExpandidos((prev) => new Set(prev).add(canalPadre.id));
  };

  const abrirEditar = (medio) => {
    setModoFormulario('editar');
    setEditandoId(medio.id);
    setFormNombre(medio.nombre);
    setFormParentId(medio.parent_id || '');
    setMenuAccionId(null);
  };

  const guardarCanal = async () => {
    const nombre = formNombre.trim();
    if (!nombre) {
      alert('Indica el nombre del canal.');
      return;
    }

    setGuardando(true);
    try {
      if (modoFormulario === 'nuevo' || modoFormulario === 'nuevo-subcanal') {
        await api.post('/medios', {
          empresa_id: empresaId,
          nombre,
          parent_id: formParentId || null,
        });
      } else if (modoFormulario === 'editar' && editandoId) {
        await api.put(`/medios/${editandoId}`, {
          nombre,
          parent_id: formParentId || null,
        });
      }
      await recargarMedios();
      cerrarFormulario();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarCanal = async (medio) => {
    const confirmar = window.confirm(
      `¿Eliminar "${medio.nombre}" del catálogo?\n\nLos leads existentes conservarán ese texto.`,
    );
    if (!confirmar) return;

    try {
      await api.delete(`/medios/${medio.id}`);
      if (value === medio.nombre) onChange('');
      await recargarMedios();
      setMenuAccionId(null);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const padresParaSelect = padres.filter((p) => p.id !== editandoId);
  const nombreCanalPadreForm = padres.find((p) => p.id === formParentId)?.nombre;

  const renderAcciones = (medio, esCanalRaiz = false) => (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAccionId(menuAccionId === medio.id ? null : medio.id);
        }}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label={`Acciones para ${medio.nombre}`}
      >
        <MoreVertical size={16} />
      </button>

      {menuAccionId === medio.id && (
        <div className="absolute right-0 z-30 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1">
          {esCanalRaiz && (
            <button
              type="button"
              onClick={() => abrirNuevoSubcanal(medio)}
              className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
            >
              Nuevo subcanal
            </button>
          )}
          <button
            type="button"
            onClick={() => abrirEditar(medio)}
            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => eliminarCanal(medio)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );

  const renderFilaPlana = (medio) => {
    const seleccionado = value === medio.nombre;
    return (
      <div key={medio.id} className="flex items-center gap-1 w-full px-1 py-0.5">
        <span className="w-7 shrink-0" aria-hidden="true" />
        <button
          type="button"
          onClick={() => seleccionar(medio.nombre)}
          className={`flex flex-1 items-center justify-between min-w-0 px-3 py-2 text-sm transition-colors rounded-lg ${
            seleccionado
              ? 'bg-blue-50 text-blue-700 font-bold'
              : 'text-slate-700 hover:bg-slate-50 font-semibold'
          }`}
        >
          <span className="truncate">{medio.nombre}</span>
          {seleccionado && <Check size={16} className="text-blue-600 shrink-0 ml-2" />}
        </button>
        {renderAcciones(medio, true)}
      </div>
    );
  };

  const renderSubcanal = (hijo) => {
    const seleccionado = value === hijo.nombre;
    return (
      <div key={hijo.id} className="flex items-center gap-1 w-full py-0.5 pl-7">
        <button
          type="button"
          onClick={() => seleccionar(hijo.nombre)}
          className={`flex flex-1 items-center justify-between min-w-0 px-3 py-2 text-sm transition-colors rounded-lg ${
            seleccionado
              ? 'bg-blue-50 text-blue-700 font-bold'
              : 'text-slate-500 hover:bg-slate-50 font-medium'
          }`}
        >
          <span className="truncate">{hijo.nombre}</span>
          {seleccionado && <Check size={16} className="text-blue-600 shrink-0 ml-2" />}
        </button>
        {renderAcciones(hijo)}
      </div>
    );
  };

  const renderGrupoCanal = (padre) => {
    const hijos = hijosPorPadre[padre.id] || [];
    const tieneHijos = hijos.length > 0;
    const expandido = gruposExpandidos.has(padre.id);
    const padreSeleccionado = value === padre.nombre;

    if (!tieneHijos) {
      return renderFilaPlana(padre);
    }

    return (
      <div key={padre.id} className="py-0.5">
        <div className="flex items-center gap-0.5 w-full pr-1">
          <button
            type="button"
            onClick={() => toggleGrupo(padre.id)}
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-expanded={expandido}
            aria-label={expandido ? 'Contraer subcanales' : 'Expandir subcanales'}
          >
            <ChevronRight
              size={16}
              className={`transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={() => seleccionar(padre.nombre)}
            className={`flex flex-1 items-center justify-between min-w-0 px-2 py-2 text-sm transition-colors rounded-lg ${
              padreSeleccionado
                ? 'bg-blue-50 text-blue-700 font-bold'
                : 'text-slate-700 hover:bg-slate-50 font-semibold'
            }`}
          >
            <span className="truncate">{padre.nombre}</span>
            {padreSeleccionado && <Check size={16} className="text-blue-600 shrink-0 ml-2" />}
          </button>

          {renderAcciones(padre, true)}
        </div>

        {expandido && (
          <div className="border-l border-slate-200 ml-4 mr-1">
            {hijos.map((hijo) => renderSubcanal(hijo))}
          </div>
        )}
      </div>
    );
  };

  const renderFormulario = () => {
    const esNuevoSubcanal = modoFormulario === 'nuevo-subcanal';
    const tituloForm =
      modoFormulario === 'editar'
        ? 'Editar canal'
        : esNuevoSubcanal
          ? 'Nuevo subcanal'
          : 'Nuevo canal';

    return (
    <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50 shrink-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {tituloForm}
      </p>
      {esNuevoSubcanal && nombreCanalPadreForm && (
        <p className="text-xs text-slate-500">
          Canal padre: <span className="font-semibold text-slate-700">{nombreCanalPadreForm}</span>
        </p>
      )}
      <input
        type="text"
        value={formNombre}
        onChange={(e) => setFormNombre(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
        placeholder={esNuevoSubcanal ? 'Nombre del subcanal' : 'Nombre del canal'}
        maxLength={100}
      />
      {modoFormulario === 'editar' && (
        <select
          value={formParentId}
          onChange={(e) => setFormParentId(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">Canal raíz (sin padre)</option>
          {padresParaSelect.map((padre) => (
            <option key={padre.id} value={padre.id}>
              Subcanal de: {padre.nombre}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={guardando}
          onClick={guardarCanal}
          className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={cerrarFormulario}
          className="flex-1 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
    );
  };

  const panelContenido = abierto && panelStyle && (
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
    >
      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 py-1">
        {padres.length === 0 && !modoFormulario && (
          <p className="px-4 py-3 text-sm text-slate-400">No hay canales configurados.</p>
        )}

        {padres.map((padre) => renderGrupoCanal(padre))}
      </div>

      {modoFormulario ? (
        renderFormulario()
      ) : (
        <button
          type="button"
          onClick={abrirNuevo}
          className="flex items-center gap-2 w-full px-4 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-slate-100 transition-colors shrink-0"
        >
          <Plus size={16} />
          Nuevo
        </button>
      )}
    </div>
  );

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
        Canal
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
      >
        <span className={`truncate ${value ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
          {textoMostrado}
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 shrink-0 ml-2 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {panelContenido && createPortal(panelContenido, document.body)}
    </div>
  );
}

export { MEDIO_DEFAULT };
export default SelectorCanales;
