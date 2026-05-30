import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';

const ALTURA_PANEL_MAX = 420;

const formatoPrecioGps = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto ?? 0);

function SelectorGpsPrecio({ catalogo, onSeleccionarPrecio, disabled = false }) {
  const [abierto, setAbierto] = useState(false);
  const [gruposExpandidos, setGruposExpandidos] = useState(() => new Set());
  const [panelStyle, setPanelStyle] = useState(null);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const calcularPosicionPanel = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const anchoPanel = Math.max(rect.width + 160, 320);
    const espacioAbajo = window.innerHeight - rect.bottom - 12;
    const espacioArriba = rect.top - 12;
    const abrirArriba = espacioAbajo < 160 && espacioArriba > espacioAbajo;
    const maxHeight = Math.max(
      120,
      Math.min(ALTURA_PANEL_MAX, abrirArriba ? espacioArriba : espacioAbajo),
    );
    const top = abrirArriba
      ? Math.max(8, rect.top - 8 - maxHeight)
      : rect.bottom + 8;

    setPanelStyle({
      position: 'fixed',
      right: Math.max(8, window.innerWidth - rect.right),
      width: anchoPanel,
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

    calcularPosicionPanel();

    const handleScrollOrResize = () => calcularPosicionPanel();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [abierto, catalogo]);

  useEffect(() => {
    if (!abierto) return undefined;

    const handleClickOutside = (event) => {
      const dentroTrigger = triggerRef.current?.contains(event.target);
      const dentroPanel = panelRef.current?.contains(event.target);
      if (!dentroTrigger && !dentroPanel) {
        setAbierto(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierto]);

  const toggleGrupo = (proveedorId) => {
    setGruposExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(proveedorId)) next.delete(proveedorId);
      else next.add(proveedorId);
      return next;
    });
  };

  const seleccionarProducto = (producto) => {
    onSeleccionarPrecio(producto.precio);
    setAbierto(false);
  };

  const renderProducto = (producto) => (
    <button
      key={producto.id}
      type="button"
      onClick={() => seleccionarProducto(producto)}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left"
    >
      <span className="truncate font-medium">{producto.nombre}</span>
      <span className="shrink-0 text-slate-500 tabular-nums">{formatoPrecioGps(producto.precio)}</span>
    </button>
  );

  const renderProveedor = (proveedor) => {
    const productos = proveedor.productos || [];
    const tieneProductos = productos.length > 0;
    const expandido = gruposExpandidos.has(proveedor.id);

    if (!tieneProductos) {
      return (
        <div key={proveedor.id} className="px-3 py-2 text-sm text-slate-400 italic">
          {proveedor.nombre} — sin productos
        </div>
      );
    }

    return (
      <div key={proveedor.id} className="py-0.5">
        <div className="flex items-center gap-0.5 w-full pr-1">
          <button
            type="button"
            onClick={() => toggleGrupo(proveedor.id)}
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-expanded={expandido}
            aria-label={expandido ? 'Contraer productos' : 'Expandir productos'}
          >
            <ChevronRight
              size={16}
              className={`transition-transform duration-200 ${expandido ? 'rotate-90' : ''}`}
            />
          </button>
          <span className="flex-1 px-2 py-2 text-sm font-semibold text-slate-700 truncate">
            {proveedor.nombre}
          </span>
        </div>

        {expandido && (
          <div className="border-l border-slate-200 ml-4 mr-1 pl-2">
            {productos.map((producto) => renderProducto(producto))}
          </div>
        )}
      </div>
    );
  };

  const panelContenido = abierto && panelStyle && (
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Catálogo GPS
        </p>
      </div>
      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 py-1">
        {catalogo.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-400">No hay proveedores GPS configurados.</p>
        ) : (
          catalogo.map((proveedor) => renderProveedor(proveedor))
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAbierto(!abierto)}
        className="shrink-0 flex items-center justify-center w-10 border border-l-0 border-slate-200 rounded-r-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-50"
        aria-label="Elegir producto GPS del catálogo"
        title="Elegir del catálogo"
      >
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {panelContenido && createPortal(panelContenido, document.body)}
    </>
  );
}

export default SelectorGpsPrecio;
