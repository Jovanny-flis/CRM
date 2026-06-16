import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Users, DollarSign, FileText, ArrowRight, Calculator } from 'lucide-react';

const DashboardView = () => {
  const [stats, setStats] = useState({ totalLeads: 0, totalValor: 0, totalCotizaciones: 0 });
  const [cargando, setCargando] = useState(true);

  // Recuperamos los datos del usuario logueado
  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id;
  const nombreUsuario = usuarioLogueado.nombre ? usuarioLogueado.nombre.split(' ')[0] : 'Usuario';

  useEffect(() => {
    if (empresaId) {
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

  if (cargando) return (
    <div className="flex justify-center items-center py-20 text-slate-500 font-medium">
      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Cargando tu resumen...
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* CABECERA MINIMALISTA */}
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
          ¡Hola, <span className="text-primary">{nombreUsuario}</span>!
        </h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">
          Resumen general de tu actividad en la plataforma.
        </p>
      </header>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        
        {/* Tarjeta 1: Prospectos */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm transition-all hover:border-primary/30 hover:shadow-md group">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Prospectos Activos</p>
            <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center transition-colors group-hover:bg-primary/10">
              <Users size={18} strokeWidth={2.5} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-800 truncate">{stats.totalLeads}</h2>
        </div>

        {/* Tarjeta 2: Valor del Embudo */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm transition-all hover:border-primary/30 hover:shadow-md group">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Valor en Embudo</p>
            <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center transition-colors group-hover:bg-primary/10">
              <DollarSign size={18} strokeWidth={2.5} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-800 truncate" title={formatoMoneda(stats.totalValor)}>
            {formatoMoneda(stats.totalValor)}
          </h2>
        </div>

        {/* Tarjeta 3: Cotizaciones */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm transition-all hover:border-primary/30 hover:shadow-md group">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cotizaciones</p>
            <div className="w-10 h-10 rounded-xl bg-primary/5 text-primary flex items-center justify-center transition-colors group-hover:bg-primary/10">
              <FileText size={18} strokeWidth={2.5} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-slate-800 truncate">{stats.totalCotizaciones}</h2>
        </div>

      </div>

      {/* ACCESOS DIRECTOS */}
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Accesos Rápidos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        
        {/* Enlace Kanban (Estilo Outline) */}
        <Link to="/leads" className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between hover:border-primary/40 hover:shadow-md transition-all group">
          <div>
            <h3 className="text-base font-bold text-slate-800 group-hover:text-primary transition-colors">Ver Tablero Kanban</h3>
            <p className="text-slate-500 text-sm mt-1">Gestiona el seguimiento de clientes.</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 transform group-hover:translate-x-2 group-hover:text-primary group-hover:bg-primary/10 group-hover:border-primary/20 transition-all">
            <ArrowRight size={18} strokeWidth={2.5} />
          </div>
        </Link>
        
        {/* Enlace Cotizador (Estilo Sólido) */}
        <Link to="/cotizador" className="bg-primary text-white rounded-2xl p-6 flex items-center justify-between hover:brightness-95 shadow-sm hover:shadow-md transition-all group">
          <div>
            <h3 className="text-base font-bold">Nueva Cotización</h3>
            <p className="text-white/80 text-sm mt-1">Calcula arrendamientos al instante.</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center transform group-hover:scale-110 transition-transform">
            <Calculator size={20} strokeWidth={2.5} />
          </div>
        </Link>

      </div>

    </div>
  );
};

export default DashboardView;