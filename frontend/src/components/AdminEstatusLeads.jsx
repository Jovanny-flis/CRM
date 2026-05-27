import { useEffect, useState, useRef } from 'react';
import api from '../api';
import { MoreVertical } from 'lucide-react';

const CODIGO_ACTIVO = 'activo';
const CODIGO_CANCELADO = 'cancelado';
const UMBRAL_ARRASTRE = 8;

const esSistema = (e) => e.codigo === CODIGO_ACTIVO || e.codigo === CODIGO_CANCELADO;

function AdminEstatusLeads({ empresaId }) {
  const [estatus, setEstatus] = useState([]);
  const [personalizadosOrden, setPersonalizadosOrden] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [menuAbiertoId, setMenuAbiertoId] = useState(null);
  const [editando, setEditando] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [arrastrandoId, setArrastrandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [formNuevo, setFormNuevo] = useState({
    nombre: '',
    color_hex: '',
    incluir_en_suma: true,
    permite_mover: true,
    bloquea_cotizacion: false,
  });
  const [formEdit, setFormEdit] = useState({
    nombre: '',
    color_hex: '#3b82f6',
    sin_color: false,
    incluir_en_suma: true,
    permite_mover: true,
    bloquea_cotizacion: false,
  });

  const dragRef = useRef(null);
  const ultimoHoverRef = useRef(null);
  const menuRef = useRef(null);
  const personalizadosOrdenRef = useRef([]);

  const cargar = () => {
    if (!empresaId) {
      setCargando(false);
      return;
    }
    api.get(`/estatus-leads/${empresaId}`)
      .then((res) => {
        const intermedios = res.data.filter((e) => !esSistema(e));
        setEstatus(res.data);
        setPersonalizadosOrden(intermedios);
        personalizadosOrdenRef.current = intermedios;
      })
      .catch((err) => console.error('Error estatus:', err))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [empresaId]);

  useEffect(() => {
    const cerrarMenu = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbiertoId(null);
      }
    };
    document.addEventListener('mousedown', cerrarMenu);
    return () => document.removeEventListener('mousedown', cerrarMenu);
  }, []);

  const activo = estatus.find((e) => e.codigo === CODIGO_ACTIVO);
  const cancelado = estatus.find((e) => e.codigo === CODIGO_CANCELADO);

  const reordenarLocal = (fromId, toId) => {
    if (fromId === toId) return;
    setPersonalizadosOrden((prev) => {
      const lista = [...prev];
      const fromIdx = lista.findIndex((x) => x.id === fromId);
      const toIdx = lista.findIndex((x) => x.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item] = lista.splice(fromIdx, 1);
      lista.splice(toIdx, 0, item);
      personalizadosOrdenRef.current = lista;
      return lista;
    });
  };

  const guardarOrden = async (lista) => {
    try {
      await api.put('/estatus-leads/reordenar', {
        empresa_id: empresaId,
        ids_ordenados: lista.map((e) => e.id),
      });
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
      cargar();
    }
  };

  const handleMenuPointerDown = (e, item, esArrastrable) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      itemId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      movido: false,
      esArrastrable,
    };
    ultimoHoverRef.current = null;
  };

  const handleMenuPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (!d.dragging && (Math.abs(dx) > UMBRAL_ARRASTRE || Math.abs(dy) > UMBRAL_ARRASTRE)) {
      d.movido = true;
      if (!d.esArrastrable) return;
      d.dragging = true;
      setMenuAbiertoId(null);
      setArrastrandoId(d.itemId);
    }

    if (!d.dragging) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const fila = el?.closest('[data-estatus-id]');
    const overId = fila?.getAttribute('data-estatus-id');

    if (overId && overId !== d.itemId && overId !== ultimoHoverRef.current) {
      const esPersonalizado = personalizadosOrdenRef.current.some((p) => p.id === overId);
      if (esPersonalizado) {
        ultimoHoverRef.current = overId;
        reordenarLocal(d.itemId, overId);
      }
    }
  };

  const handleMenuPointerUp = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    if (d.dragging) {
      guardarOrden(personalizadosOrdenRef.current);
      setArrastrandoId(null);
    } else if (!d.movido) {
      setMenuAbiertoId((prev) => (prev === d.itemId ? null : d.itemId));
    }

    dragRef.current = null;
    ultimoHoverRef.current = null;
  };

  const abrirEditar = (item) => {
    const sinColor = !item.color_hex || item.color_hex === 'sin_color';
    setFormEdit({
      nombre: item.nombre,
      color_hex: sinColor ? '#3b82f6' : item.color_hex,
      sin_color: sinColor,
      incluir_en_suma: !!item.incluir_en_suma,
      permite_mover: !!item.permite_mover,
      bloquea_cotizacion: !!item.bloquea_cotizacion,
    });
    setEditando(item);
    setMenuAbiertoId(null);
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    if (!formEdit.nombre.trim()) return alert('Indica el nombre del estatus.');
    setGuardando(true);
    try {
      const payload = {
        nombre: formEdit.nombre.trim(),
        color_hex: formEdit.sin_color ? 'sin_color' : formEdit.color_hex,
        incluir_en_suma: formEdit.incluir_en_suma,
        permite_mover: formEdit.permite_mover,
        bloquea_cotizacion: formEdit.bloquea_cotizacion,
      };
      await api.put(`/estatus-leads/${editando.id}`, payload);
      setEditando(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    setGuardando(true);
    try {
      await api.delete(`/estatus-leads/${eliminando.id}`);
      setEliminando(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGuardando(false);
    }
  };

  const crearEstatus = async (e) => {
    e.preventDefault();
    if (!formNuevo.nombre.trim()) return alert('Indica el nombre del estatus.');
    try {
      await api.post('/estatus-leads', {
        empresa_id: empresaId,
        nombre: formNuevo.nombre.trim(),
        color_hex: formNuevo.color_hex || 'sin_color',
        incluir_en_suma: formNuevo.incluir_en_suma,
        permite_mover: formNuevo.permite_mover,
        bloquea_cotizacion: formNuevo.bloquea_cotizacion,
      });
      setFormNuevo({ nombre: '', color_hex: '', incluir_en_suma: true, permite_mover: true, bloquea_cotizacion: false });
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const renderMenuAcciones = (item, esArrastrable) => (
    <div className="relative shrink-0" ref={menuAbiertoId === item.id ? menuRef : null}>
      <button
        type="button"
        onPointerDown={(e) => handleMenuPointerDown(e, item, esArrastrable)}
        onPointerMove={handleMenuPointerMove}
        onPointerUp={handleMenuPointerUp}
        className={`p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors touch-none ${
          esArrastrable ? 'cursor-grab active:cursor-grabbing' : ''
        } ${arrastrandoId === item.id ? 'cursor-grabbing bg-slate-100' : ''}`}
        aria-label={`Acciones para ${item.nombre}`}
      >
        <MoreVertical size={18} />
      </button>

      {menuAbiertoId === item.id && (
        <div className="absolute right-0 z-30 mt-1 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1">
          <button
            type="button"
            onClick={() => abrirEditar(item)}
            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>
          {!esSistema(item) && (
            <button
              type="button"
              onClick={() => {
                setEliminando(item);
                setMenuAbiertoId(null);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  );

  const filaEstatus = (item, { esArrastrable = false } = {}) => (
    <div
      key={item.id}
      data-estatus-id={item.id}
      className={`flex items-center justify-between gap-3 p-4 bg-white border rounded-2xl transition-all ${
        arrastrandoId === item.id
          ? 'border-blue-400 shadow-md opacity-80 scale-[1.01]'
          : 'border-slate-200'
      }`}
    >
      <span className="font-bold text-slate-800 truncate">{item.nombre}</span>
      {renderMenuAcciones(item, esArrastrable)}
    </div>
  );

  const esActivo = editando?.codigo === CODIGO_ACTIVO;
  const esCancelado = editando?.codigo === CODIGO_CANCELADO;
  const esPersonalizado = editando && !esSistema(editando);

  if (!empresaId) {
    return (
      <p className="text-slate-500 text-sm p-4 bg-slate-50 rounded-2xl">
        Inicia sesión con una empresa asignada para administrar estatus.
      </p>
    );
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando estatus...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-black text-slate-800 text-lg mb-1">Estatus de prospectos</h3>
        <p className="text-sm text-slate-500">
          Mantén presionado el icono de menú y arrastra para reordenar estatus personalizados.
          Activo y Cancelado son obligatorios (solo renombrables).
        </p>
      </div>

      <div className="space-y-2">
        {activo && filaEstatus(activo)}
        {personalizadosOrden.map((item) => filaEstatus(item, { esArrastrable: true }))}
        {cancelado && filaEstatus(cancelado)}
      </div>

      <form onSubmit={crearEstatus} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Nuevo estatus</h4>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={formNuevo.nombre}
            onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
            placeholder="Nombre del estatus"
            className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
          />
          <input
            type="color"
            value={formNuevo.color_hex || '#3b82f6'}
            onChange={(e) => setFormNuevo({ ...formNuevo, color_hex: e.target.value })}
            className="w-14 h-12 rounded-xl cursor-pointer"
            title="Color de tarjeta"
          />
          <button
            type="button"
            onClick={() => setFormNuevo({ ...formNuevo, color_hex: '' })}
            className="text-xs font-bold text-slate-500 self-center hover:text-blue-600"
          >
            Sin color
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={formNuevo.incluir_en_suma}
              onChange={(e) => setFormNuevo({ ...formNuevo, incluir_en_suma: e.target.checked })}
            />
            Mostrar en suma de la etapa
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={formNuevo.permite_mover}
              onChange={(e) => setFormNuevo({ ...formNuevo, permite_mover: e.target.checked })}
            />
            Permite mover de etapa
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={formNuevo.bloquea_cotizacion}
              onChange={(e) => setFormNuevo({ ...formNuevo, bloquea_cotizacion: e.target.checked })}
            />
            Bloquea folio asignado
          </label>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700">
          Agregar estatus
        </button>
      </form>

      {editando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Editar estatus</h2>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={guardarEdicion} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={formEdit.nombre}
                    onChange={(e) => setFormEdit({ ...formEdit, nombre: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none"
                  />
                </div>

                {(esActivo || esPersonalizado) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Color
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={formEdit.color_hex}
                        disabled={formEdit.sin_color}
                        onChange={(e) => setFormEdit({ ...formEdit, color_hex: e.target.value, sin_color: false })}
                        className="w-14 h-12 rounded-xl cursor-pointer disabled:opacity-50"
                      />
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={formEdit.sin_color}
                          onChange={(e) => setFormEdit({ ...formEdit, sin_color: e.target.checked })}
                        />
                        Sin color
                      </label>
                    </div>
                  </div>
                )}

                {esCancelado && (
                  <p className="text-xs text-slate-400">
                    El estatus cancelado usa color fijo (gris), no aparece en la suma del bin y congela el folio asignado permanentemente.
                  </p>
                )}

                {esPersonalizado && (
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={formEdit.incluir_en_suma}
                        onChange={(e) => setFormEdit({ ...formEdit, incluir_en_suma: e.target.checked })}
                      />
                      Mostrar en suma del bin
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={formEdit.permite_mover}
                        onChange={(e) => setFormEdit({ ...formEdit, permite_mover: e.target.checked })}
                      />
                      Permite mover en embudo
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={formEdit.bloquea_cotizacion}
                        onChange={(e) => setFormEdit({ ...formEdit, bloquea_cotizacion: e.target.checked })}
                      />
                      Bloquea folio asignado
                    </label>
                  </div>
                )}

                {esActivo && (
                  <p className="text-xs text-slate-400">
                    Estatus inicial: siempre visible en suma y permite mover leads en el embudo.
                  </p>
                )}

                <div className="pt-6 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all disabled:opacity-60"
                  >
                    Guardar cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {eliminando && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-3">
                Está por eliminar este estatus
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed">
                Los leads con este estatus pasarán a{' '}
                <span className="font-bold text-slate-700">&quot;{activo?.nombre || 'Activo'}&quot;</span>.
              </p>
              <div className="pt-8 flex gap-4">
                <button
                  type="button"
                  onClick={() => setEliminando(null)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={confirmarEliminar}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 transition-all disabled:opacity-60"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminEstatusLeads;
