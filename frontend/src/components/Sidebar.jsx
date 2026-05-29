import { Link, useLocation } from 'react-router-dom';
import { cerrarSesion, CLAVE_USUARIO, obtenerTabId } from '../lib/sesion';

const Sidebar = () => {
  const location = useLocation();

  // 1. Recuperamos al usuario que inició sesión desde la memoria del navegador
  const usuarioGuardado = localStorage.getItem(CLAVE_USUARIO);
  const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : { nombre: 'Cargando...', rol: 'agente' };

  // 2. Definimos las reglas: ¡Ahora con las 4 jerarquías reales!
  const menuItems = [
    { 
      name: 'Dashboard', 
      path: '/', 
      icon: '📊', 
      roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente'] 
    },
    { 
      name: 'Leads', 
      path: '/leads', 
      icon: '🚀', 
      roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente'] 
    },
    // 👇 AQUÍ AGREGAMOS LA LISTA MAESTRA TIPO EXCEL 👇
    { 
      name: 'Directorio Maestro', 
      path: '/maestro-leads', 
      icon: '📋', 
      roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente', 'agente_cotizador'] 
    },
    // 👇 AQUÍ AGREGAMOS EL COTIZADOR 👇
    { 
      name: 'Cotizador', 
      path: '/cotizador', 
      icon: '🧮', 
      roles: ['super_admin', 'admin_empresa', 'supervisor', 'agente','agente_cotizador'] 
    },
    { 
      name: 'Agentes', 
      path: '/agentes', 
      icon: '👥', 
      roles: ['super_admin', 'admin_empresa', 'supervisor'] 
    }, 
    { 
      name: 'Pipelines', 
      path: '/pipelines', 
      icon: '🛤️', 
      roles: ['super_admin', 'admin_empresa'] 
    },
    { 
      name: 'Empresas', 
      path: '/empresas', 
      icon: '🏢', 
      roles: ['super_admin'] // <--- SOLO TÚ ves esto
    },
  ];

  // 3. El Filtro Mágico: Solo renderizamos los items donde el rol del usuario esté permitido
  const menuPermitido = menuItems.filter(item => item.roles.includes(usuario.rol));

  // 4. Función para cerrar sesión con un clic
  const manejarCerrarSesion = async () => {
    await cerrarSesion({ razon: 'manual', tabId: obtenerTabId() });
    window.location.replace('/');
  };

  return (
    <div className="w-64 h-screen bg-white border-r border-slate-200 flex flex-col fixed left-0 top-0 z-30">
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-xl font-bold text-blue-600 tracking-tighter">FLISING CRM</h2>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {/* Usamos menuPermitido en lugar de menuItems */}
        {menuPermitido.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                isActive 
                  ? 'bg-blue-50 text-blue-600 shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <span>{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100">
        {/* Mostramos los datos reales del usuario */}
        <div className="bg-slate-900 rounded-xl p-4 text-white mb-3">
          <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider">{usuario.rol}</p>
          <p className="text-sm font-bold truncate mt-0.5">{usuario.nombre}</p>
        </div>

        {/* El nuevo botón de Cerrar Sesión */}
        <button 
          onClick={manejarCerrarSesion}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
};

export default Sidebar;