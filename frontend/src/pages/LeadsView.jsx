import { useEffect, useState } from 'react';
import api from '../api';

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [medios, setMedios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  // NUEVO: Estado para el filtro inteligente

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leadEditando, setLeadEditando] = useState(null); // NUEVO: Guarda el ID del lead a editar
  
// 1. PRIMERO declaramos tu formData que ya tenías
  const [formData, setFormData] = useState({
    nombre: '', 
    correo: '', 
    telefono: '', 
    valor: '', 
    medio: '',
    usuario_id: ''
  });

  // 2. SEGUNDO leemos quién es el usuario logueado
  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id; 

  // 3. TERCERO (Y AQUÍ ESTÁ EL TRUCO), ponemos el filtro porque AHORA SÍ ya sabemos quién es el usuario
  const [filtroAgente, setFiltroAgente] = useState(
    usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : ''
  );

  const fetchTablero = () => {
    if (!empresaId) {
      setCargando(false);
      return; 
    }

    api.get(`/pipelines/${empresaId}`)
      .then(resPipeline => {
        if (resPipeline.data.length === 0) {
           setCargando(false);
           return;
        }

        const pipelineId = resPipeline.data[0].id; 

        Promise.all([
          api.get(`/leads/${empresaId}`),
          api.get(`/medios/${empresaId}`),
          api.get(`/etapas/${pipelineId}`),
          api.get(`/usuarios/empresa/${empresaId}`) 
        ]).then(([resLeads, resMedios, resEtapas, resUsuarios]) => {
          setLeads(resLeads.data);
          setMedios(resMedios.data);
          setEtapas(resEtapas.data);
          setAgentes(resUsuarios.data);
          setCargando(false);
        }).catch(err => {
          console.error("❌ Error cargando el tablero:", err);
          setCargando(false);
        });

      })
      .catch(err => {
        console.error("❌ Error buscando pipeline:", err);
        setCargando(false);
      });
  };

  useEffect(() => {
    fetchTablero();
  }, []);

  // NUEVA FUNCIÓN: Limpia el formulario y cierra el modal
  const cerrarModal = () => {
    setIsModalOpen(false);
    setLeadEditando(null);
    setFormData({ nombre: '', correo: '', telefono: '', valor: '', medio: '', usuario_id: '' });
  };

  // NUEVA FUNCIÓN: Abre el modal con los datos del lead a editar
  const abrirModalEditar = (lead) => {
    setLeadEditando(lead.id);
    setFormData({
      nombre: lead.nombre || '',
      correo: lead.correo || '',
      telefono: lead.telefono || '',
      valor: lead.valor || '',
      medio: lead.medio || '',
      usuario_id: lead.usuario_id || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Determinar el agente asignado (Agentes se auto-asignan, Admins eligen)
    const agenteAsignado = usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : formData.usuario_id;
    
    // Si estamos EDITANDO
    if (leadEditando) {
      const datosActualizados = {
        nombre: formData.nombre,
        correo: formData.correo,
        telefono: formData.telefono,
        valor: formData.valor ? parseFloat(formData.valor) : 0,
        medio: formData.medio || 'Directo',
        usuario_id: agenteAsignado
      };

      api.put(`/leads/${leadEditando}`, datosActualizados)
        .then(() => {
          fetchTablero();
          cerrarModal();
        })
        .catch(err => alert("Error al actualizar: " + err.message));
    } 
    // Si estamos CREANDO
    else {
      const primeraEtapaId = etapas.length > 0 ? etapas[0].id : null;
      const nuevoProspecto = {
        empresa_id: empresaId, 
        nombre: formData.nombre,
        correo: formData.correo,
        telefono: formData.telefono,
        valor: formData.valor ? parseFloat(formData.valor) : 0,
        medio: formData.medio || 'Directo',
        stage_id: primeraEtapaId,
        usuario_id: agenteAsignado
      };

      api.post('/leads', nuevoProspecto)
        .then(() => {
          fetchTablero(); 
          cerrarModal();
        })
        .catch(err => alert("Error al guardar: " + err.message));
    }
  };

const obtenerLeadsPorEtapaId = (stageId) => {
    return leads.filter(lead => {
      // 1. Verificamos que esté en la columna correcta
      const esDeLaEtapa = lead.stage_id === stageId;
      // 2. Verificamos que sea del agente filtrado (o si el filtro está vacío, mostramos todos)
      const esDelAgente = filtroAgente === '' || lead.usuario_id === filtroAgente;
      
      return esDeLaEtapa && esDelAgente;
    });
  };

  const formatoMoneda = (monto) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);
  };

const handleDragStart = (e, leadId) => {
    // Aseguramos que guardamos el ID como texto
    e.dataTransfer.setData("leadId", leadId.toString());
    e.target.style.opacity = "0.5";
    e.target.style.cursor = "grabbing";
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Indispensable para permitir el "drop"
  };

  const handleDrop = (e, targetStageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    
    if (leadId) {
      api.put(`/leads/${leadId}/etapa`, { stage_id: targetStageId })
        .then(() => fetchTablero())
        .catch(err => console.error("❌ Error al mover:", err));
    }
  };

  if (cargando) return <div className="p-10 text-center text-slate-500 font-medium">Cargando tablero...</div>;

  if (!empresaId) return (
    <div className="p-10 text-center text-slate-500 font-medium bg-slate-50 rounded-2xl m-8">
      <h2 className="text-xl font-bold mb-2">Vista Global</h2>
      <p>Para ver un tablero de Leads, inicia sesión como un Administrador de Empresa o Agente.</p>
    </div>
  );

  return (
    <div className="font-sans">
<header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Tablero de Leads</h1>
          <p className="text-slate-500 mt-1">Gestión de prospectos por equipo</p>
        </div>
        
        <div className="flex items-center gap-4">
          
          {/* 🕵🏻‍♂️ INICIO DEL FILTRO (SOLO JEFES) */}
          {(usuarioLogueado.rol === 'super_admin' || usuarioLogueado.rol === 'admin_empresa' || usuarioLogueado.rol === 'supervisor') && (
            <select 
              value={filtroAgente}
              onChange={(e) => setFiltroAgente(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="">👥 Todos los agentes</option>
              {agentes.map(agente => (
                <option key={agente.id} value={agente.id}>
                  👤 {agente.nombre}
                </option>
              ))}
            </select>
          )}
          {/* 🛑 FIN DEL FILTRO */}

          {/* 🟢 EL BOTÓN ESTÁ AFUERA PARA QUE EL AGENTE TAMBIÉN LO VEA */}
          <button 
            onClick={() => { setLeadEditando(null); setIsModalOpen(true); }}
            disabled={etapas.length === 0}
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${etapas.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'}`}
          >
            <span className="text-xl">+</span> Nuevo Prospecto
          </button>

        </div>
      </header>

      {etapas.length === 0 && (
         <div className="p-8 text-center bg-orange-50 text-orange-600 rounded-2xl border border-orange-200 mb-8">
             <h3 className="font-bold text-lg">Aún no hay un embudo configurado</h3>
             <p className="mt-1">Ve a la pestaña de "Pipelines" y crea tus columnas para empezar.</p>
         </div>
      )}

      <div className="flex gap-6 overflow-x-auto pb-6">
        {etapas.map(etapa => {
          const leadsFiltrados = obtenerLeadsPorEtapaId(etapa.id);
          const sumaTotal = leadsFiltrados.reduce((total, lead) => total + parseFloat(lead.valor || 0), 0);

          return (
            <div 
              key={etapa.id} 
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, etapa.id)}
              className="flex-shrink-0 w-80 bg-slate-200/40 rounded-2xl p-4 border border-slate-200/60 backdrop-blur-sm"
            >
              <div className="mb-5 px-2">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: etapa.color_hex || '#cbd5e1' }}></span>
                    {etapa.nombre_etapa}
                  </div>
                  <span className="bg-white text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm border border-slate-100">
                    {leadsFiltrados.length}
                  </span>
                </div>
                <div className="text-slate-700 font-extrabold text-lg">
                  {formatoMoneda(sumaTotal)}
                </div>
              </div>

              <div className="space-y-3 min-h-[150px]">
                {leadsFiltrados.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-grab active:cursor-grabbing group relative overflow-hidden transition-shadow"
                  >
                    <div className="absolute left-0 top-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: etapa.color_hex || '#3b82f6' }}></div>
                    
                    {/* Botón flotante para Editar */}
                    <button 
                      onClick={() => abrirModalEditar(lead)}
                      className="absolute top-3 right-3 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-md p-1"
                      title="Editar Prospecto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    
                    <div className="flex justify-between items-start mb-1 pr-6">
                      <p className="text-slate-900 font-bold text-sm truncate">{lead.nombre || "Sin nombre"}</p>
                    </div>

                    <div className="mb-2">
                      {parseFloat(lead.valor) > 0 && (
                        <span className="text-green-700 font-bold text-[11px] bg-green-50 px-2 py-0.5 rounded-md border border-green-200 whitespace-nowrap inline-block mb-1">
                          {formatoMoneda(lead.valor)}
                        </span>
                      )}
                      <p className="text-slate-500 text-[11px] truncate">{lead.correo || 'Sin correo'}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[8px] font-bold uppercase" title="Agente asignado">
                          {agentes.find(a => a.id === lead.usuario_id)?.nombre?.charAt(0) || '?'}
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                          {lead.medio || 'Directo'}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-300 font-mono">
                        #{lead.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                {/* Título dinámico: Nuevo o Editar */}
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  {leadEditando ? 'Editar Prospecto' : 'Nuevo Prospecto'}
                </h2>
                <button onClick={cerrarModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Completo *</label>
                  <input type="text" required value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500" placeholder="Ej. Juan Pérez" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Correo</label>
                    <input type="email" value={formData.correo} onChange={(e) => setFormData({...formData, correo: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500" placeholder="juan@mail.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teléfono</label>
                    <input type="text" value={formData.telefono} onChange={(e) => setFormData({...formData, telefono: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500" placeholder="5512345678" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-green-600">Valor Estimado ($)</label>
                    <input 
                      type="number" min="0" step="0.01" 
                      value={formData.valor} 
                      onChange={(e) => setFormData({...formData, valor: e.target.value})} 
                      className="w-full bg-green-50 border border-green-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-green-500 font-bold text-green-700" 
                      placeholder="Ej. 15000" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Medio</label>
                    <select 
                      value={formData.medio} 
                      onChange={(e) => setFormData({...formData, medio: e.target.value})} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none appearance-none focus:border-blue-500"
                    >
                      <option value="">Selecciona o deja en blanco</option>
                      {medios.length === 0 ? (
                        <>
                          <option value="Facebook">Facebook</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Instagram">Instagram</option>
                          <option value="Página Web">Página Web</option>
                          <option value="Recomendación">Recomendación</option>
                        </>
                      ) : (
                        medios.map(m => (
                          <option key={m.id} value={m.nombre}>{m.nombre}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {(usuarioLogueado.rol === 'admin_empresa' || usuarioLogueado.rol === 'supervisor') && (
                  <div className="animate-in fade-in slide-in-from-top-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Asignar a Agente</label>
                    <select 
                      value={formData.usuario_id} 
                      onChange={(e) => setFormData({...formData, usuario_id: e.target.value})} 
                      className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 focus:bg-white outline-none appearance-none font-medium text-blue-800"
                    >
                      <option value="">Dejar sin asignar</option>
                      {agentes.map(agente => (
                        <option key={agente.id} value={agente.id}>
                          {agente.nombre} ({agente.rol.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-6 flex gap-4">
                  <button type="button" onClick={cerrarModal} className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
                  <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all">
                    {/* Botón dinámico */}
                    {leadEditando ? 'Guardar Cambios' : 'Guardar Lead'}
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

export default LeadsView;