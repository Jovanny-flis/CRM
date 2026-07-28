import { useState, useEffect, useCallback, Fragment } from 'react';
import api from '../api';
import { Wallet, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

const formatoMoneda = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);

const formatoFecha = (fecha) => {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const mesActualISO = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const formatearMesLegible = (mesISO) => {
  const [anio, mes] = mesISO.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  const texto = fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const sumarMes = (mesISO, delta) => {
  const [anio, mes] = mesISO.split('-').map(Number);
  const fecha = new Date(anio, mes - 1 + delta, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
};

/** Tabla de detalle (leads/cotizaciones) que arma la comisión de un vendedor. */
const DetalleVendedor = ({ detalle }) => (
  <tr>
    <td colSpan={3} className="bg-slate-50/70 px-4 py-3">
      {(!detalle || detalle.length === 0) ? (
        <p className="text-xs text-slate-400">Sin detalle disponible.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <th className="py-1.5 pr-3">Cliente / Folio</th>
              <th className="py-1.5 pr-3">Fecha de colocación</th>
              <th className="py-1.5 pr-3">Valor del activo</th>
              <th className="py-1.5 pr-3">Comisión</th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((d) => (
              <tr key={d.cotizacion_id || d.lead_id} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-slate-600">
                  {d.lead_nombre || 'Sin nombre'}
                  {d.folio ? <span className="text-slate-400"> — Folio {d.folio}</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{formatoFecha(d.fecha_colocado)}</td>
                <td className="py-1.5 pr-3 text-slate-500">{formatoMoneda(d.valor_activo)}</td>
                <td className="py-1.5 pr-3 font-semibold text-slate-700">{formatoMoneda(d.comision)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </td>
  </tr>
);

/**
 * Panel de comisiones dentro del Dashboard.
 * - Un agente (vendedor) solo ve su propia comisión.
 * - admin_empresa / supervisor / super_admin ven la de todo su equipo, y pueden
 *   expandir cada vendedor para ver el detalle de las colocaciones que arman su comisión.
 * El backend (/api/comisiones/:empresa_id) ya aplica el filtro por rol,
 * así que este componente simplemente pinta lo que reciba.
 */
const ComisionesPanel = ({ empresaId, usuarioId, esVendedorSolo }) => {
  const [mes, setMes] = useState(mesActualISO());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [expandidos, setExpandidos] = useState(() => new Set());

  const cargarComisiones = useCallback(() => {
    if (!empresaId) return;
    setCargando(true);
    setError(null);
    api.get(`/comisiones/${empresaId}?mes=${mes}`)
      .then((res) => setDatos(res.data))
      .catch((err) => {
        console.error('Error al cargar comisiones:', err);
        setError('No se pudo cargar la información de comisiones.');
      })
      .finally(() => setCargando(false));
  }, [empresaId, mes]);

  useEffect(() => {
    cargarComisiones();
  }, [cargarComisiones]);

  // Al cambiar de mes, cerramos cualquier detalle que estuviera expandido.
  useEffect(() => {
    setExpandidos(new Set());
  }, [mes]);

  const alternarExpandido = (usuarioIdFila) => {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(usuarioIdFila)) {
        siguiente.delete(usuarioIdFila);
      } else {
        siguiente.add(usuarioIdFila);
      }
      return siguiente;
    });
  };

  const miFila = datos?.por_vendedor?.find((v) => v.usuario_id === usuarioId);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wallet size={18} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {esVendedorSolo ? 'Mi comisión' : 'Comisiones del equipo'}
            </h2>
            <p className="text-xs text-slate-500">
              Comisión de apertura ({datos?.porcentaje_vendedor ?? 50}%) sobre colocaciones cerradas en el mes.
            </p>
          </div>
        </div>

        {/* Selector de mes */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
          <button
            type="button"
            onClick={() => setMes((m) => sumarMes(m, -1))}
            className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-primary transition-colors"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center capitalize">
            {formatearMesLegible(mes)}
          </span>
          <button
            type="button"
            onClick={() => setMes((m) => sumarMes(m, 1))}
            className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-primary transition-colors"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {cargando && <p className="text-sm text-slate-500">Cargando comisiones…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!cargando && !error && datos && (
        esVendedorSolo ? (
          // Vista vendedor: su propia tarjeta + su propio detalle (siempre visible, sin acordeón)
          <div className="max-w-xl">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-6 mb-4">
              <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest mb-2">
                Comisión de {formatearMesLegible(mes)}
              </p>
              <h3 className="text-3xl font-black text-slate-800">
                {formatoMoneda(miFila?.comision_total || 0)}
              </h3>
              <p className="text-sm text-slate-500 mt-2">
                {miFila?.colocaciones || 0} colocación{(miFila?.colocaciones || 0) === 1 ? '' : 'es'} este mes
              </p>
            </div>
            {miFila?.detalle && miFila.detalle.length > 0 && (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50">
                      <th className="py-2 px-3">Cliente / Folio</th>
                      <th className="py-2 px-3">Fecha de colocación</th>
                      <th className="py-2 px-3">Valor del activo</th>
                      <th className="py-2 px-3">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miFila.detalle.map((d) => (
                      <tr key={d.cotizacion_id || d.lead_id} className="border-t border-slate-100">
                        <td className="py-2 px-3 text-slate-600">
                          {d.lead_nombre || 'Sin nombre'}
                          {d.folio ? <span className="text-slate-400"> — Folio {d.folio}</span> : null}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{formatoFecha(d.fecha_colocado)}</td>
                        <td className="py-2 px-3 text-slate-500">{formatoMoneda(d.valor_activo)}</td>
                        <td className="py-2 px-3 font-semibold text-slate-700">{formatoMoneda(d.comision)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          // Vista admin/supervisor: tabla de todo el equipo + total, con detalle expandible por vendedor
          <>
            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 mb-5 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-600">Total del equipo este mes</p>
              <p className="text-2xl font-black text-primary">{formatoMoneda(datos.total_general)}</p>
            </div>

            {datos.por_vendedor.length === 0 ? (
              <p className="text-sm text-slate-500">Sin colocaciones registradas en este mes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                      <th className="py-2 pr-4">Vendedor</th>
                      <th className="py-2 pr-4">Colocaciones</th>
                      <th className="py-2 pr-4">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.por_vendedor
                      .slice()
                      .sort((a, b) => b.comision_total - a.comision_total)
                      .map((v) => {
                        const abierto = expandidos.has(v.usuario_id);
                        return (
                          <Fragment key={v.usuario_id}>
                            <tr
                              onClick={() => alternarExpandido(v.usuario_id)}
                              className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50/60 transition-colors"
                            >
                              <td className="py-2.5 pr-4 font-medium text-slate-700">
                                <span className="inline-flex items-center gap-1.5">
                                  <ChevronDown
                                    size={14}
                                    className={`text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
                                  />
                                  {v.nombre}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 text-slate-500">{v.colocaciones}</td>
                              <td className="py-2.5 pr-4 font-bold text-slate-800">{formatoMoneda(v.comision_total)}</td>
                            </tr>
                            {abierto && <DetalleVendedor detalle={v.detalle} />}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
};

export default ComisionesPanel;
