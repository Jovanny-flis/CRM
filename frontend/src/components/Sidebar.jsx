import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { cerrarSesion, CLAVE_USUARIO, obtenerTabId } from '../lib/sesion';

const Sidebar = () => {
  const location = useLocation();

  const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO);
  const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : { nombre: 'Cargando...', rol: 'agente' };

useEffect(() => {
    // Tomamos el color hexadecimal directo de tu base de datos
    const colorHex = usuario?.color_principal || usuario?.empresa?.color_principal || '#f97316'; 
    
    // Lo inyectamos a la variable raíz
    document.documentElement.style.setProperty('--empresa-color', colorHex);
  }, [usuario]);

  // Menú reorganizado con agrupaciones y iconos SVG limpios (estilo minimalista)
  const menuItems = [
    { 
      grupo: null,
      items: [
        { name: 'Dashboard', path: '/', roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /> }
      ]
    },
    {
      grupo: 'Operación',
      items: [
        { name: 'Leads', path: '/leads', roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> },
        { name: 'Directorio Maestro', path: '/maestro-leads', roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente', 'agente_cotizador'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /> },
        { name: 'Cotizador', path: '/cotizador', roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente', 'agente_cotizador'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
        { name: 'Agentes', path: '/agentes', roles: ['super_admin', 'admin_empresa', 'supervisor'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
        { name: 'Pipelines', path: '/pipelines', roles: ['super_admin', 'admin_empresa'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> }
      ]
    },
    {
      grupo: 'Administración',
      items: [
        { name: 'Empresas', path: '/empresas', roles: ['super_admin'], icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /> }
      ]
    }
  ];

  const manejarCerrarSesion = async () => {
    await cerrarSesion({ razon: 'manual', tabId: obtenerTabId() });
    window.location.replace('/');
  };

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-100 flex flex-col fixed left-0 top-0 z-30">
      
      {/* 1. Header con Logo y botón de colapsar */}
      <div className="flex items-center justify-between p-6">
        <h2 className="text-xl font-bold text-primary tracking-tight">FLISING FLOW</h2>
        <button className="text-slate-400 hover:text-slate-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
        </button>
      </div>

      {/* 2. Tarjeta de Perfil de Usuario */}
      <div className="px-5 mb-4">
        <div className="p-3 border border-slate-100 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="flex-1 overflow-hidden">
            <h3 className="text-sm font-bold text-slate-800 truncate">{usuario.nombre}</h3>
            {/* El rol usa el color primary para resaltar, igual que tu imagen de referencia */}
            <p className="text-xs text-primary font-medium truncate capitalize">{usuario.rol.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* 4. Navegación principal */}
      <nav className="flex-1 px-3 overflow-y-auto pb-4 space-y-6">
        {menuItems.map((seccion, idx) => {
          // Filtramos los items de esta sección según el rol
          const itemsPermitidos = seccion.items.filter(item => item.roles.includes(usuario.rol));
          
          if (itemsPermitidos.length === 0) return null;

          return (
            <div key={idx} className="space-y-1">
              {seccion.grupo && (
                <p className="px-4 mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {seccion.grupo}
                </p>
              )}
              {itemsPermitidos.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                      isActive 
                        ? 'text-primary bg-primary/5 font-semibold' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <svg className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {item.icon}
                    </svg>
                    {item.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* 5. Footer con botón de salida sutil */}
      <div className="p-4 border-t border-slate-100">
        <button 
          onClick={manejarCerrarSesion}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
};

export default Sidebar;