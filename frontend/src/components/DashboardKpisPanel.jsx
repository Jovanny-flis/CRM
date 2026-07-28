import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { TrendingUp, Target, Trophy, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';

const mesActualISO = () => new Date().toISOString().slice(0, 7);

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

const COLOR_PRIMARIO = '#4f46e5';
const COLOR_META_OK = '#10b981';
const COLOR_META_FALTA = '#f43f5e';

const TarjetaStat = ({ icono, etiqueta, valor, sufijo = '' }) => {
  const Icono = icono;
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{etiqueta}</p>
        <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
          <Icono size={18} strokeWidth={2.5} />
        </div>
      </div>
      <h2 className="text-3xl font-black text-slate-800">{valor}{sufijo}</h2>
    </div>
  );
};

/**
 * Panel de KPIs del dashboard. SOLO debe renderizarse para
 * super_admin / admin_empresa / supervisor (el componente padre decide eso).
 */
const DashboardKpisPanel = ({ empresaId }) => {
  const [mes, setMes] = useState(mesActualISO());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargarKpis = useCallback(() => {
    if (!empresaId) return;
    setCargando(true);
    setError(null);
    api.get(`/dashboard/kpis/${empresaId}?mes=${mes}`)
      .then((res) => setDatos(res.data))
      .catch((err) => {
        console.error('Error al cargar KPIs del dashboard:', err);
        setError('No se pudieron cargar los indicadores.');
      })
      .finally(() => setCargando(false));
  }, [empresaId, mes]);

  useEffect(() => {
    cargarKpis();
  }, [cargarKpis]);

  if (error) {
    return <p className="text-sm text-red-500 mb-10">{error}</p>;
  }

  const meta = datos?.meta_prospectos_mes ?? 15;

  const datosMeta = (datos?.meta_por_vendedor || []).map((v) => ({
    nombre: v.nombre,
    prospectos: v.prospectos_mes_no_repetidos,
  }));

  const datosProspectos = (datos?.prospectos_por_vendedor || []).map((v) => ({
    nombre: v.nombre,
    prospectos: v.prospectos,
  }));

  const datosColocacion = (datos?.colocados_por_vendedor || []).map((v) => ({
    nombre: v.nombre,
    colocados: v.colocados,
  }));

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Indicadores del equipo</h2>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
          <button type="button" onClick={() => setMes((m) => sumarMes(m, -1))} className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-primary transition-colors" aria-label="Mes anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center capitalize">
            {formatearMesLegible(mes)}
          </span>
          <button type="button" onClick={() => setMes((m) => sumarMes(m, 1))} className="p-1 rounded-lg hover:bg-white text-slate-500 hover:text-primary transition-colors" aria-label="Mes siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="text-sm text-slate-500 mb-6">Cargando indicadores…</p>
      ) : (
        <>
          {/* Tarjetas de KPIs generales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <TarjetaStat icono={TrendingUp} etiqueta="Índice de conversión" valor={datos?.indice_conversion ?? 0} sufijo="%" />
            <TarjetaStat icono={BarChart3} etiqueta="Efectividad global acumulada" valor={datos?.efectividad_global ?? 0} sufijo="%" />
            <TarjetaStat icono={Trophy} etiqueta="Colocaciones este mes" valor={datos?.colocados_mes_general ?? 0} />
            <TarjetaStat icono={Target} etiqueta="Meta por vendedor" valor={meta} sufijo="/mes" />
          </div>

          {/* Gráfica: prospectos por vendedor */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Prospectos por vendedor (histórico)</h3>
            {datosProspectos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={datosProspectos}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="prospectos" fill={COLOR_PRIMARIO} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Gráfica: meta de 15 prospectos/mes por vendedor */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-slate-700 mb-1">Meta de {meta} prospectos del mes por vendedor</h3>
            <p className="text-xs text-slate-400 mb-4">Sin contar dos veces al mismo cliente (teléfono/correo repetido).</p>
            {datosMeta.length === 0 ? (
              <p className="text-sm text-slate-400">Sin prospectos registrados este mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={datosMeta}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <ReferenceLine y={meta} stroke={COLOR_META_FALTA} strokeDasharray="4 4" label={{ value: `Meta ${meta}`, position: 'right', fontSize: 11, fill: COLOR_META_FALTA }} />
                  <Bar dataKey="prospectos" radius={[6, 6, 0, 0]}>
                    {datosMeta.map((d, i) => (
                      <Cell key={i} fill={d.prospectos >= meta ? COLOR_META_OK : COLOR_META_FALTA} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Gráfica: colocación total por vendedor */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4">
              Total de colocación por vendedor (histórico) — {datos?.total_colocados ?? 0} en total
            </h3>
            {datosColocacion.length === 0 ? (
              <p className="text-sm text-slate-400">Sin colocaciones todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={datosColocacion}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="colocados" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </section>
  );
};

export default DashboardKpisPanel;
