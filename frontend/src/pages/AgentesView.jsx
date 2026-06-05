import { useEffect, useState } from 'react';
import api from '../api';

function AgentesView() {
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const usuarioActual = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const isSuperAdmin = usuarioActual.rol === 'super_admin';

  const [empresasList, setEmpresasList] = useState([]);
  
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    rol: 'agente',
    password_hash: '',
    supervisor_id: '',
    empresa_id: isSuperAdmin ? '' : usuarioActual.empresa_id
  });

  const listaSupervisores = agentes.filter(a => a.rol === 'supervisor' || a.rol === 'admin_empresa');

  const fetchAgentes = () => {
    const url = isSuperAdmin ? '/usuarios' : `/usuarios/empresa/${usuarioActual.empresa_id}`;
    
    api.get(url)
      .then(res => {
        setAgentes(res.data);
        setCargando(false);
      })
      .catch(err => {
        console.error("Error cargando agentes:", err);
        setCargando(false);
      });
  };

  useEffect(() => {
    fetchAgentes();
    if (isSuperAdmin) {
      api.get('/empresas')
        .then(res => setEmpresasList(res.data))
        .catch(err => console.error("Error cargando empresas", err));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (isSuperAdmin && !formData.empresa_id) {
      return alert("Por favor, selecciona una empresa para este usuario.");
    }

    const datosEnvio = { ...formData };

    const peticion = formData.id 
      ? api.put(`/usuarios/${formData.id}`, datosEnvio) 
      : api.post('/usuarios', datosEnvio);

    peticion
      .then(() => {
        fetchAgentes();
        setIsModalOpen(false);
        setFormData({ 
          nombre: '', email: '', rol: 'agente', password_hash: '', 
          supervisor_id: '', empresa_id: isSuperAdmin ? '' : usuarioActual.empresa_id 
        });
      })
      .catch(err => {
        alert("Error en la operación: " + (err.response?.data?.error || err.message));
      });
  };

  const eliminarAgente = (id) => {
    if (window.confirm("¿Estás seguro de dar de baja a este agente?")) {
      api.delete(`/usuarios/${id}`)
        .then(() => fetchAgentes())
        .catch(err => alert("Error: " + err.message));
    }
  };

  const prepararEdicion = (agente) => {
    setFormData({
      id: agente.id,
      nombre: agente.nombre,
      email: agente.email,
      rol: agente.rol,
      password_hash: '', 
      supervisor_id: agente.supervisor_id || '',
      empresa_id: agente.empresa_id || ''
    });
    setIsModalOpen(true);
  };

  if (cargando) return (
    <div className="flex justify-center items-center py-20 text-slate-500 font-medium">
      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Cargando equipo de ventas...
    </div>
  );

  return (
    <div className="font-sans max-w-7xl mx-auto pb-10">
      <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary tracking-tight">Equipo de Ventas</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Gestiona los agentes y sus permisos de acceso.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold hover:brightness-95 shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Nuevo Usuario
        </button>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Nombre</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Email</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Rol</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {agentes.map(agente => (
                <tr key={agente.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
                        {agente.nombre?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{agente.nombre}</span>
                        {agente.supervisor_id && (
                          <span className="text-[10px] font-semibold text-slate-400 mt-0.5 uppercase tracking-wide">
                            Reporta a: {agentes.find(a => a.id === agente.supervisor_id)?.nombre || 'Superior'}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm font-medium whitespace-nowrap">
                    {agente.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider inline-block ${
                      agente.rol === 'super_admin' ? 'bg-slate-800 text-white' :
                      agente.rol === 'admin_empresa' ? 'bg-purple-50 text-purple-600 border border-purple-200' : 
                      agente.rol === 'supervisor' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 
                      'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}>
                      {agente.rol.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => prepararEdicion(agente)} 
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                        title="Editar Usuario"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button 
                        onClick={() => eliminarAgente(agente.id)} 
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Eliminar Usuario"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {agentes.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/50">
                    Aún no hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                  {formData.id ? 'Editar Usuario' : 'Nuevo Usuario'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {isSuperAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">Asignar a Empresa *</label>
                    <select 
                      required
                      value={formData.empresa_id} 
                      onChange={(e) => setFormData({...formData, empresa_id: e.target.value})} 
                      className="w-full bg-primary/5 border border-primary/20 text-slate-800 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none font-medium"
                    >
                      <option value="">-- Selecciona una empresa --</option>
                      {empresasList.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre_comercial}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Completo</label>
                  <input type="text" required value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="Ej. Carlos Agente" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Email Corporativo</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="carlos@empresa.com" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contraseña Temporal</label>
                  <input type="password" required={!formData.id} value={formData.password_hash} onChange={(e) => setFormData({...formData, password_hash: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all" placeholder="••••••••" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Rol del Usuario</label>
                  <select 
                    value={formData.rol} 
                    onChange={(e) => setFormData({...formData, rol: e.target.value, supervisor_id: ''})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none"
                  >
                    <option value="agente_cotizador">Agente Cotizador (Solo usa el Cotizador)</option>
                    <option value="agente">Agente (Solo ve sus leads)</option>
                    <option value="supervisor">Supervisor (Ve todo el equipo)</option>
                    <option value="admin_empresa">Administrador (Control total de la empresa)</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin (Sistema Global)</option>}
                  </select>
                </div>

                {(formData.rol === 'agente' || formData.rol === 'agente_cotizador') && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Asignar a Supervisor</label>
                    <select 
                      value={formData.supervisor_id} 
                      onChange={(e) => setFormData({...formData, supervisor_id: e.target.value})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all appearance-none"
                    >
                      <option value="">Sin supervisor (Reporta al Admin)</option>
                      {listaSupervisores.map(sup => (
                        <option key={sup.id} value={sup.id}>{sup.nombre} ({sup.rol.replace('_', ' ')})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-6 flex gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:brightness-95 shadow-sm transition-all">
                    {formData.id ? 'Guardar Cambios' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentesView;