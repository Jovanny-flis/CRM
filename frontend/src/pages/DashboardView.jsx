import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const DashboardView = () => {
  const [stats, setStats] = useState({ totalLeads: 0, totalValor: 0, totalCotizaciones: 0 });
  const [cargando, setCargando] = useState(true);

  // Recuperamos los datos del usuario logueado
  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id;
  const nombreUsuario = usuarioLogueado.nombre ? usuarioLogueado.nombre.split(' ')[0] : 'Usuario';

  useEffect(() => {
    if (empresaId) {
      // Llamamos a la ruta que acabamos de crear en el backend
      api.get(`/dashboard/${empresaId}?usuario_id=${usuarioLogueado.id}&rol=${usuarioLogueado.rol}`)
        .then(res => {
          setStats(res.data);
          setCargando(false);
        })
        .catch(err => {
          console.error("Error al cargar dashboard:", err);
          setCargando(false);
        });
    } else {
      setCargando(false);
    }
  }, [empresaId]);

  // Función para formatear dinero
  const formatoMoneda = (monto) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);
  };

  if (cargando) return <div className="p-10 text-center text-slate-500 font-medium">Cargando tu resumen...</div>;

  return (
    <div className="max-w-7xl mx-auto">
      {/* CABECERA */}
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
          ¡Hola, {nombreUsuario}! 👋
        </h1>
        <p className="text-slate-500 mt-1">
          Aquí está el resumen de tu actividad en el CRM.
        </p>
      </header>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        
        {/* Tarjeta 1: Prospectos */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center gap-6 transition-transform hover:-translate-y-1">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl shadow-inner">
            👥
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Prospectos Activos</p>
            <h2 className="text-3xl font-black text-slate-800">{stats.totalLeads}</h2>
          </div>
        </div>

        {/* Tarjeta 2: Valor del Embudo */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center gap-6 transition-transform hover:-translate-y-1">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl shadow-inner">
            💰
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Valor en Embudo</p>
            <h2 className="text-3xl font-black text-slate-800">{formatoMoneda(stats.totalValor)}</h2>
          </div>
        </div>

        {/* Tarjeta 3: Cotizaciones */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center gap-6 transition-transform hover:-translate-y-1">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center text-3xl shadow-inner">
            📄
          </div>
          <div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Cotizaciones</p>
            <h2 className="text-3xl font-black text-slate-800">{stats.totalCotizaciones}</h2>
          </div>
        </div>

      </div>

      {/* ACCESOS DIRECTOS */}
      <h2 className="text-xl font-bold text-slate-800 mb-4">Accesos Rápidos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/leads" className="bg-slate-900 text-white rounded-2xl p-6 flex items-center justify-between hover:bg-slate-800 transition-colors group">
          <div>
            <h3 className="text-lg font-bold">Ver Tablero Kanban</h3>
            <p className="text-slate-400 text-sm mt-1">Gestiona el seguimiento de tus clientes.</p>
          </div>
          <span className="text-2xl transform group-hover:translate-x-2 transition-transform">👉</span>
        </Link>
        
        <Link to="/cotizador" className="bg-blue-600 text-white rounded-2xl p-6 flex items-center justify-between hover:bg-blue-700 transition-colors group shadow-lg shadow-blue-600/20">
          <div>
            <h3 className="text-lg font-bold">Nueva Cotización</h3>
            <p className="text-blue-200 text-sm mt-1">Calcula arrendamientos al instante.</p>
          </div>
          <span className="text-2xl transform group-hover:translate-x-2 transition-transform">🧮</span>
        </Link>
      </div>

    </div>
  );
};

export default DashboardView;