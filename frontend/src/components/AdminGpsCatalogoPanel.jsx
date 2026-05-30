import { useEffect, useState } from 'react';
import { ChevronRight, MoreVertical, Plus, X } from 'lucide-react';
import api from '../api';

const formatoPrecioGps = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto ?? 0);

function AdminGpsCatalogoPanel({ abierto, onCerrar, empresaId, catalogo, onCatalogoActualizado }) {
  const [menuAccionId, setMenuAccionId] = useState(null);
  const [modoFormulario, setModoFormulario] = useState(null);
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formProveedorId, setFormProveedorId] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [editandoTipo, setEditandoTipo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [gruposExpandidos, setGruposExpandidos] = useState(() => new Set());

  useEffect(() => {
    if (!abierto) {
      setMenuAccionId(null);
      cerrarFormulario();
    }
  }, [abierto]);

  const cerrarFormulario = () => {
    setModoFormulario(null);
    setFormNombre('');
    setFormPrecio('');
    setFormProveedorId('');
    setEditandoId(null);
    setEditandoTipo(null);
  };

  const recargarCatalogo = async () => {
    const res = await api.get(`/gps-catalogo/${empresaId}`);
    onCatalogoActualizado(res.data);
  };

  const toggleGrupo = (proveedorId) => {
    setGruposExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(proveedorId)) next.delete(proveedorId);
      else next.add(proveedorId);
      return next;
    });
  };

  const abrirNuevoProveedor = () => {
    setModoFormulario('nuevo-proveedor');
    setFormNombre('');
    setFormPrecio('');
    setFormProveedorId('');
    setEditandoId(null);
    setEditandoTipo(null);
    setMenuAccionId(null);
  };

  const abrirNuevoProducto = (proveedor) => {
    setModoFormulario('nuevo-producto');
    setFormNombre('');
    setFormPrecio('');
    setFormProveedorId(proveedor.id);
    setEditandoId(null);
    setEditandoTipo(null);
    setMenuAccionId(null);
    setGruposExpandidos((prev) => new Set(prev).add(proveedor.id));
  };

  const abrirEditarProveedor = (proveedor) => {
    setModoFormulario('editar-proveedor');
    setEditandoId(proveedor.id);
    setEditandoTipo('proveedor');
    setFormNombre(proveedor.nombre);
    setFormPrecio('');
    setFormProveedorId('');
    setMenuAccionId(null);
  };

  const abrirEditarProducto = (producto) => {
    setModoFormulario('editar-producto');
    setEditandoId(producto.id);
    setEditandoTipo('producto');
    setFormNombre(producto.nombre);
    setFormPrecio(String(producto.precio));
    setFormProveedorId('');
    setMenuAccionId(null);
  };

  const guardar = async () => {
    const nombre = formNombre.trim();
    if (!nombre) {
      alert('Indica el nombre.');
      return;
    }

    if (
      (modoFormulario === 'nuevo-producto' || modoFormulario === 'editar-producto')
      && (formPrecio === '' || Number(formPrecio) < 0 || !Number.isFinite(Number(formPrecio)))
    ) {
      alert('Indica un precio válido (con IVA incluido).');
      return;
    }

    setGuardando(true);
    try {
      if (modoFormulario === 'nuevo-proveedor') {
        await api.post('/gps-proveedores', { empresa_id: empresaId, nombre });
      } else if (modoFormulario === 'editar-proveedor' && editandoId) {
        await api.put(`/gps-proveedores/${editandoId}`, { nombre });
      } else if (modoFormulario === 'nuevo-producto') {
        await api.post('/gps-productos', {
          proveedor_id: formProveedorId,
          nombre,
          precio: Number(formPrecio),
        });
      } else if (modoFormulario === 'editar-producto' && editandoId) {
        await api.put(`/gps-productos/${editandoId}`, {
          nombre,
          precio: Number(formPrecio),
        });
      }
      await recargarCatalogo();
      cerrarFormulario();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarProveedor = async (proveedor) => {
    const confirmar = window.confirm(
      `¿Eliminar el proveedor "${proveedor.nombre}" y todos sus productos?\n\nLas cotizaciones guardadas conservan el precio GPS asignado.`,
    );
    if (!confirmar) return;

    try {
      await api.delete(`/gps-proveedores/${proveedor.id}`);
      await recargarCatalogo();
      setMenuAccionId(null);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const eliminarProducto = async (producto) => {
    const confirmar = window.confirm(
      `¿Eliminar el producto "${producto.nombre}" del catálogo?\n\nLas cotizaciones guardadas conservan el precio GPS asignado.`,
    );
    if (!confirmar) return;

    try {
      await api.delete(`/gps-productos/${producto.id}`);
      await recargarCatalogo();
      setMenuAccionId(null);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const nombreProveedorForm = catalogo.find((p) => p.id === formProveedorId)?.nombre;

  const tituloForm = () => {
    if (modoFormulario === 'nuevo-proveedor') return 'Nuevo proveedor';
    if (modoFormulario === 'editar-proveedor') return 'Editar proveedor';
    if (modoFormulario === 'nuevo-producto') return 'Nuevo producto';
    if (modoFormulario === 'editar-producto') return 'Editar producto';
    return '';
  };

  const renderMenuAcciones = (item, tipo, proveedorPadre = null) => (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuAccionId(menuAccionId === item.id ? null : item.id);
        }}
        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label={`Acciones para ${item.nombre}`}
      >
        <MoreVertical size={16} />
      </button>

      {menuAccionId === item.id && (
        <div className="absolute right-0 z-30 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1">
          {tipo === 'proveedor' && (
            <button
              type="button"
              onClick={() => abrirNuevoProducto(item)}
              className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
            >
              Nuevo producto
            </button>
          )}
          <button
            type="button"
            onClick={() => (tipo === 'proveedor' ? abrirEditarProveedor(item) : abrirEditarProducto(item))}
            className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => (tipo === 'proveedor' ? eliminarProveedor(item) : eliminarProducto(item, proveedorPadre))}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );

  const renderProducto = (producto, proveedor) => (
    <div key={producto.id} className="flex items-center gap-1 w-full py-0.5 pl-7">
      <div className="flex flex-1 items-center justify-between min-w-0 px-3 py-2 text-sm rounded-lg text-slate-600">
        <span className="truncate font-medium">{producto.nombre}</span>
        <span className="shrink-0 ml-2 tabular-nums text-slate-500">{formatoPrecioGps(producto.precio)}</span>
      </div>
      {renderMenuAcciones(producto, 'producto', proveedor)}
    </div>
  );

  const renderProveedor = (proveedor) => {
    const productos = proveedor.productos || [];
    const expandido = gruposExpandidos.has(proveedor.id);

    return (
      <div key={proveedor.id} className="py-0.5">
        <div className="flex items-center gap-0.5 w-full pr-1">
          <button
            type="button"
            onClick={() => toggleGrupo(proveedor.id)}
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-expanded={expandido}
          >
            <ChevronRight
              size={16}
              className={`transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            />
          </button>
          <span className="flex-1 px-2 py-2 text-sm font-semibold text-slate-700 truncate">
            {proveedor.nombre}
          </span>
          {renderMenuAcciones(proveedor, 'proveedor')}
        </div>

        {expandido && (
          <div className="border-l border-slate-200 ml-4 mr-1">
            {productos.length === 0 ? (
              <p className="pl-7 py-2 text-xs text-slate-400 italic">Sin productos</p>
            ) : (
              productos.map((producto) => renderProducto(producto, proveedor))
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFormulario = () => (
    <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50 shrink-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {tituloForm()}
      </p>
      {modoFormulario === 'nuevo-producto' && nombreProveedorForm && (
        <p className="text-xs text-slate-500">
          Proveedor: <span className="font-semibold text-slate-700">{nombreProveedorForm}</span>
        </p>
      )}
      <input
        type="text"
        value={formNombre}
        onChange={(e) => setFormNombre(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
        placeholder={modoFormulario?.includes('proveedor') ? 'Nombre del proveedor' : 'Nombre del producto'}
        maxLength={100}
      />
      {(modoFormulario === 'nuevo-producto' || modoFormulario === 'editar-producto') && (
        <div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formPrecio}
            onChange={(e) => setFormPrecio(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Precio con IVA incluido"
          />
          <p className="text-xs text-slate-400 mt-1">Precio con IVA incluido</p>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={guardando}
          onClick={guardar}
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

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl h-[85vh] min-h-[560px] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="admin-gps-titulo"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 id="admin-gps-titulo" className="text-lg font-bold text-slate-800">
              Catálogo GPS
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Proveedores, productos y precios para el cotizador
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-[420px] py-3 px-2">
          {catalogo.length === 0 && !modoFormulario ? (
            <p className="px-5 py-4 text-sm text-slate-400">No hay proveedores GPS. Agrega el primero.</p>
          ) : (
            catalogo.map((proveedor) => renderProveedor(proveedor))
          )}
        </div>

        {modoFormulario ? (
          renderFormulario()
        ) : (
          <button
            type="button"
            onClick={abrirNuevoProveedor}
            className="flex items-center gap-2 w-full px-5 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 border-t border-slate-100 transition-colors shrink-0"
          >
            <Plus size={16} />
            Nuevo proveedor
          </button>
        )}
      </div>
    </div>
  );
}

export default AdminGpsCatalogoPanel;
