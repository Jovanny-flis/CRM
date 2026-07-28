import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react';

const formatoMoneda = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);

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

/**
 * Panel de comisiones dentro del Dashboard.
 * - Un agente (vendedor) solo ve su propia comisión.
 * - admin_empresa / supervisor / super_admin ven la de todo su equipo.
 * El backend (/api/comisiones/:empresa_id) ya aplica ese filtro por rol,
 * así que este componente simplemente pinta lo que reciba.
 */
const ComisionesPanel = ({ empresaId, usuarioId, esVendedorSolo }) => {
  const [mes, setMes] = useState(mesActualISO());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

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
          // Vista vendedor: solo su propia tarjeta
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-6 max-w-sm">
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
        ) : (
          // Vista admin/supervisor: tabla de todo el equipo + total
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
                      .map((v) => (
                        <tr key={v.usuario_id} className="border-b border-slate-50 last:border-0">
                          <td className="py-2.5 pr-4 font-medium text-slate-700">{v.nombre}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{v.colocaciones}</td>
                          <td className="py-2.5 pr-4 font-bold text-slate-800">{formatoMoneda(v.comision_total)}</td>
                        </tr>
                      ))}
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
