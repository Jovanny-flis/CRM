import { useEffect, useState } from 'react';
import api from '../api';
import { Users, User, Check, ChevronDown } from 'lucide-react';
import SelectorCanales, { MEDIO_DEFAULT } from '../components/SelectorCanales';

const esLeadActivo = (lead) => lead.activo !== 0 && lead.activo !== false;

const valorEstimadoValido = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0;
};

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [medios, setMedios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [menuAgentesAbierto, setMenuAgentesAbierto] = useState(false);
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
  const [filtroActivo, setFiltroActivo] = useState('activos');
  const [leadActivoEnEdicion, setLeadActivoEnEdicion] = useState(true);
  const [motivoDesactivacion, setMotivoDesactivacion] = useState('');
  const [mostrarAvisoDesactivacion, setMostrarAvisoDesactivacion] = useState(false);

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
    setLeadActivoEnEdicion(true);
    setMotivoDesactivacion('');
    setMostrarAvisoDesactivacion(false);
  };

  // NUEVA FUNCIÓN: Abre el modal con los datos del lead a editar
  const abrirModalEditar = (lead) => {
    if (!esLeadActivo(lead)) return;
    setLeadEditando(lead.id);
    setFormData({
      nombre: lead.nombre || '',
      correo: lead.correo || '',
      telefono: lead.telefono || '',
      valor: lead.valor || '',
      medio: lead.medio || '',
      usuario_id: lead.usuario_id || ''
    });
    setLeadActivoEnEdicion(true);
    setMotivoDesactivacion('');
    setMostrarAvisoDesactivacion(false);
    setIsModalOpen(true);
  };

  const handleToggleActivo = (marcarActivo) => {
    if (marcarActivo) {
      setLeadActivoEnEdicion(true);
      setMotivoDesactivacion('');
      return;
    }
    setMostrarAvisoDesactivacion(true);
  };

  const confirmarAvisoDesactivacion = () => {
    setMostrarAvisoDesactivacion(false);
    setLeadActivoEnEdicion(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!valorEstimadoValido(formData.valor)) {
      alert('El valor estimado es obligatorio y debe ser mayor a cero.');
      return;
    }

    const valorNumerico = parseFloat(formData.valor);

    // Determinar el agente asignado (Agentes se auto-asignan, Admins eligen)
    const agenteAsignado = usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : formData.usuario_id;
    
    // Si estamos EDITANDO
    if (leadEditando) {
      if (!leadActivoEnEdicion && !motivoDesactivacion.trim()) {
        alert('Indica el motivo de desactivación antes de guardar.');
        return;
      }

      const datosActualizados = {
        nombre: formData.nombre,
        correo: formData.correo,
        telefono: formData.telefono,
        valor: valorNumerico,
        medio: formData.medio || MEDIO_DEFAULT,
        usuario_id: agenteAsignado
      };

      if (!leadActivoEnEdicion) {
        datosActualizados.activo = 0;
        datosActualizados.motivo_desactivacion = motivoDesactivacion.trim();
      }

      api.put(`/leads/${leadEditando}`, datosActualizados)
        .then(() => {
          fetchTablero();
          cerrarModal();
        })
        .catch(err => {
          const msg = err.response?.data?.error || err.message;
          alert("Error al actualizar: " + msg);
        });
    } 
    // Si estamos CREANDO
    else {
      const primeraEtapaId = etapas.length > 0 ? etapas[0].id : null;
      const nuevoProspecto = {
        empresa_id: empresaId, 
        nombre: formData.nombre,
        correo: formData.correo,
        telefono: formData.telefono,
        valor: valorNumerico,
        medio: formData.medio || MEDIO_DEFAULT,
        stage_id: primeraEtapaId,
        usuario_id: agenteAsignado
      };

      api.post('/leads', nuevoProspecto)
        .then(() => {
          fetchTablero(); 
          cerrarModal();
        })
        .catch(err => {
          const msg = err.response?.data?.error || err.message;
          alert("Error al guardar: " + msg);
        });
    }
  };

const obtenerLeadsPorEtapaId = (stageId) => {
    return leads.filter(lead => {
      const esDeLaEtapa = lead.stage_id === stageId;
      const esDelAgente = filtroAgente === '' || lead.usuario_id === filtroAgente;
      const activo = esLeadActivo(lead);
      const cumpleFiltroActivo =
        filtroActivo === 'ambos' ||
        (filtroActivo === 'activos' && activo) ||
        (filtroActivo === 'inactivos' && !activo);

      return esDeLaEtapa && esDelAgente && cumpleFiltroActivo;
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
    const lead = leads.find(l => l.id === leadId);

    if (leadId && lead && esLeadActivo(lead)) {
      api.put(`/leads/${leadId}/etapa`, { stage_id: targetStageId })
        .then(() => fetchTablero())
        .catch(err => {
          const msg = err.response?.data?.error || err.message;
          console.error("❌ Error al mover:", msg);
        });
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
    <div className="font-sans w-full max-w-full min-w-0">
<header className="mb-8 w-full max-w-full min-w-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 shrink">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Tablero de Leads</h1>
          <p className="text-slate-500 mt-1">Gestión de prospectos por equipo</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 sm:justify-end sm:shrink-0">
          
{(usuarioLogueado.rol === 'super_admin' || usuarioLogueado.rol === 'admin_empresa' || usuarioLogueado.rol === 'supervisor') && (
  <div className="relative inline-block text-left min-w-[240px]">
    {/* Botón Principal */}
    <button 
      type="button"
      onClick={() => setMenuAgentesAbierto(!menuAgentesAbierto)}
      className="flex items-center justify-between w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none focus:border-blue-500 shadow-sm transition-all hover:bg-slate-50"
    >
      <span className="flex items-center gap-2">
        {filtroAgente === "" ? (
          <Users size={18} className="text-blue-500" />
        ) : (
          <User size={18} className="text-blue-500" />
        )}
        {filtroAgente === "" 
          ? "Todos los agentes" 
          : agentes.find(a => a.id === filtroAgente)?.nombre || "Seleccionar agente..."}
      </span>
      <ChevronDown 
        size={16} 
        className={`text-slate-400 transition-transform duration-200 ${menuAgentesAbierto ? 'rotate-180' : ''}`} 
      />
    </button>

    {/* Menú Desplegable (Flotante) */}
    {menuAgentesAbierto && (
      <div className="absolute z-10 w-full mt-2 bg-white rounded-xl shadow-lg border border-slate-100 py-1 max-h-60 overflow-y-auto">
        
        {/* Opción: Todos los agentes */}
        <button
          type="button"
          onClick={() => {
            setFiltroAgente("");
            setMenuAgentesAbierto(false);
          }}
          className={`flex items-center justify-between w-full px-4 py-3 text-sm transition-colors ${
            filtroAgente === "" ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'
          }`}
        >
          <div className="flex items-center gap-3">
            <Users size={18} className={filtroAgente === "" ? 'text-blue-600' : 'text-slate-400'} />
            Todos los agentes
          </div>
          {filtroAgente === "" && <Check size={16} className="text-blue-600" />}
        </button>

        {/* Opciones: Lista de Agentes Dinámica */}
        {agentes.map(agente => {
          const esSeleccionado = filtroAgente === agente.id;
          return (
            <button
              key={agente.id}
              type="button"
              onClick={() => {
                setFiltroAgente(agente.id);
                setMenuAgentesAbierto(false);
              }}
              className={`flex items-center justify-between w-full px-4 py-3 text-sm transition-colors ${
                esSeleccionado ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'
              }`}
            >
              <div className="flex items-center gap-3">
                <User size={18} className={esSeleccionado ? 'text-blue-600' : 'text-slate-400'} />
                {agente.nombre}
              </div>
              {esSeleccionado && <Check size={16} className="text-blue-600" />}
            </button>
          );
        })}
      </div>
    )}
  </div>
)}
      

          <select
            value={filtroActivo}
            onChange={(e) => setFiltroActivo(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none focus:border-blue-500 shadow-sm min-w-[160px]"
            aria-label="Filtrar por estado del lead"
          >
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="ambos">Activos e inactivos</option>
          </select>

          <button 
            onClick={() => { setLeadEditando(null); setIsModalOpen(true); }}
            disabled={etapas.length === 0}
            className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 whitespace-nowrap ${etapas.length === 0 ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'}`}
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

      <div className="flex gap-6 overflow-x-auto pb-6 w-full max-w-full min-w-0">
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
                {leadsFiltrados.map(lead => {
                  const activo = esLeadActivo(lead);
                  return (
                  <div 
                    key={lead.id} 
                    draggable={activo}
                    onDragStart={activo ? (e) => handleDragStart(e, lead.id) : undefined}
                    onDragEnd={activo ? handleDragEnd : undefined}
                    className={`p-4 rounded-xl shadow-sm border group relative overflow-hidden transition-shadow ${
                      activo
                        ? 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md cursor-grab active:cursor-grabbing'
                        : 'bg-slate-100 border-slate-300 opacity-75 grayscale cursor-default'
                    }`}
                  >
                    <div className="absolute left-0 top-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: activo ? (etapa.color_hex || '#3b82f6') : '#94a3b8' }}></div>
                    
                    {activo && (
                      <button 
                        type="button"
                        onClick={() => abrirModalEditar(lead)}
                        className="absolute top-3 right-3 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-md p-1"
                        title="Editar Prospecto"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                      </button>
                    )}

                    {!activo && (
                      <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                        Inactivo
                      </span>
                    )}
                    
                    <div className={`flex justify-between items-start mb-1 ${activo ? 'pr-6' : 'pr-16'}`}>
                      <p className={`font-bold text-sm truncate ${activo ? 'text-slate-900' : 'text-slate-500'}`}>{lead.nombre || "Sin nombre"}</p>
                    </div>

                    <div className="mb-2">
                      {parseFloat(lead.valor) > 0 && (
                        <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap inline-block mb-1 ${
                          activo
                            ? 'text-green-700 bg-green-50 border-green-200'
                            : 'text-slate-500 bg-slate-200 border-slate-300'
                        }`}>
                          {formatoMoneda(lead.valor)}
                        </span>
                      )}
                      <p className={`text-[11px] truncate ${activo ? 'text-slate-500' : 'text-slate-400'}`}>{lead.correo || 'Sin correo'}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[8px] font-bold uppercase" title="Agente asignado">
                          {agentes.find(a => a.id === lead.usuario_id)?.nombre?.charAt(0) || '?'}
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                          {lead.medio || MEDIO_DEFAULT}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-300 font-mono">
                        #{lead.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {mostrarAvisoDesactivacion && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
            <p className="text-slate-800 font-semibold text-lg leading-relaxed">
              Si se guardan los cambios no se podrá activar de nuevo este lead.
            </p>
            <button
              type="button"
              onClick={confirmarAvisoDesactivacion}
              className="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

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
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 text-green-600">Valor Estimado ($) *</label>
                    <input 
                      type="number" required min="0.01" step="0.01" 
                      value={formData.valor} 
                      onChange={(e) => setFormData({...formData, valor: e.target.value})} 
                      className="w-full bg-green-50 border border-green-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-green-500 font-bold text-green-700" 
                      placeholder="Ej. 15000" 
                    />
                  </div>
                  <div>
                    <SelectorCanales
                      empresaId={empresaId}
                      value={formData.medio}
                      onChange={(medio) => setFormData({ ...formData, medio })}
                      medios={medios}
                      onMediosActualizados={setMedios}
                    />
                  </div>
                </div>

                {leadEditando && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lead activo</p>
                        <p className="text-sm text-slate-600 mt-0.5">Desactivar es permanente al guardar</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={leadActivoEnEdicion}
                        onClick={() => handleToggleActivo(!leadActivoEnEdicion)}
                        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
                          leadActivoEnEdicion ? 'bg-blue-600' : 'bg-slate-400'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-1 ${
                            leadActivoEnEdicion ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {!leadActivoEnEdicion && (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          ¿Por qué se desactiva este lead? *
                        </label>
                        <textarea
                          required
                          value={motivoDesactivacion}
                          onChange={(e) => setMotivoDesactivacion(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-amber-500 text-sm"
                          placeholder="Describe el motivo..."
                        />
                      </div>
                    )}
                  </div>
                )}

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