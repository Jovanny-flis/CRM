import { useEffect, useState } from 'react';
import api from '../api';
import { Users, User, Check, ChevronDown } from 'lucide-react';
import SelectorCanales, { MEDIO_DEFAULT } from '../components/SelectorCanales';

const CODIGO_CANCELADO = 'cancelado';

const valorEstimadoValido = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0;
};

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [medios, setMedios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [estatusList, setEstatusList] = useState([]);
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
    usuario_id: '',
    estatus_id: ''
  });

  // 2. SEGUNDO leemos quién es el usuario logueado
  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id; 

  // 3. TERCERO (Y AQUÍ ESTÁ EL TRUCO), ponemos el filtro porque AHORA SÍ ya sabemos quién es el usuario
  const [filtroAgente, setFiltroAgente] = useState(
    usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : ''
  );
  const [filtroEstatusIds, setFiltroEstatusIds] = useState([]);
  const [menuEstatusAbierto, setMenuEstatusAbierto] = useState(false);
  const [motivoDesactivacion, setMotivoDesactivacion] = useState('');
  const [mostrarAvisoCancelacion, setMostrarAvisoCancelacion] = useState(false);
  const [estatusOriginalCodigo, setEstatusOriginalCodigo] = useState('activo');
  const [confirmacionMovimiento, setConfirmacionMovimiento] = useState(null);

  const fetchTablero = () => {
    if (!empresaId) {
      setCargando(false);
      return; 
    }

    api.get(`/pipelines/${empresaId}`)
      .then(resPipeline => {
        const baseRequests = [
          api.get(`/leads/${empresaId}`),
          api.get(`/medios/${empresaId}`),
          api.get(`/usuarios/empresa/${empresaId}`),
          api.get(`/estatus-leads/${empresaId}`),
        ];

        if (resPipeline.data.length === 0) {
          Promise.all(baseRequests).then(([resLeads, resMedios, resUsuarios, resEstatus]) => {
            setLeads(resLeads.data);
            setMedios(resMedios.data);
            setEtapas([]);
            setAgentes(resUsuarios.data);
            setEstatusList(resEstatus.data);
            setCargando(false);
          }).catch(err => {
            console.error('❌ Error cargando el tablero:', err);
            setCargando(false);
          });
          return;
        }

        const pipelineId = resPipeline.data[0].id;

        Promise.all([
          ...baseRequests,
          api.get(`/etapas/${pipelineId}`),
        ]).then(([resLeads, resMedios, resUsuarios, resEstatus, resEtapas]) => {
          setLeads(resLeads.data);
          setMedios(resMedios.data);
          setAgentes(resUsuarios.data);
          setEstatusList(resEstatus.data);
          setEtapas(resEtapas.data);
          setCargando(false);
        }).catch(err => {
          console.error('❌ Error cargando el tablero:', err);
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
    setFormData({ nombre: '', correo: '', telefono: '', valor: '', medio: '', usuario_id: '', estatus_id: '' });
    setMotivoDesactivacion('');
    setMostrarAvisoCancelacion(false);
    setEstatusOriginalCodigo('activo');
  };

  // NUEVA FUNCIÓN: Abre el modal con los datos del lead a editar
  const esLeadCancelado = (lead) => lead.estatus_codigo === CODIGO_CANCELADO;
  const esLeadMovible = (lead) => !esLeadCancelado(lead) && (lead.estatus_permite_mover === 1 || lead.estatus_permite_mover === true);
  const esLeadEditable = (lead) => !esLeadCancelado(lead);
  const incluyeEnSuma = (lead) => lead.estatus_incluir_en_suma === 1 || lead.estatus_incluir_en_suma === true;

  const estatusCanceladoId = estatusList.find((e) => e.codigo === CODIGO_CANCELADO)?.id;
  const vaACancelarEnFormulario = formData.estatus_id && formData.estatus_id === estatusCanceladoId;

  const abrirModalEditar = (lead) => {
    if (!esLeadEditable(lead)) return;
    setLeadEditando(lead.id);
    setFormData({
      nombre: lead.nombre || '',
      correo: lead.correo || '',
      telefono: lead.telefono || '',
      valor: lead.valor || '',
      medio: lead.medio || '',
      usuario_id: lead.usuario_id || '',
      estatus_id: lead.estatus_id || ''
    });
    setEstatusOriginalCodigo(lead.estatus_codigo || 'activo');
    setMotivoDesactivacion('');
    setMostrarAvisoCancelacion(false);
    setIsModalOpen(true);
  };

  const handleCambioEstatus = (nuevoEstatusId) => {
    const nuevo = estatusList.find((e) => e.id === nuevoEstatusId);
    if (nuevo?.codigo === CODIGO_CANCELADO && estatusOriginalCodigo !== CODIGO_CANCELADO) {
      setMostrarAvisoCancelacion(true);
    }
    if (nuevo?.codigo !== CODIGO_CANCELADO) {
      setMotivoDesactivacion('');
    }
    setFormData({ ...formData, estatus_id: nuevoEstatusId });
  };

  const confirmarAvisoCancelacion = () => {
    setMostrarAvisoCancelacion(false);
  };

  const toggleFiltroEstatus = (id) => {
    setFiltroEstatusIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const etiquetaFiltroEstatus = () => {
    if (filtroEstatusIds.length === 0) return 'Todos los estatus';
    if (filtroEstatusIds.length === 1) {
      return estatusList.find((e) => e.id === filtroEstatusIds[0])?.nombre || '1 estatus';
    }
    return `${filtroEstatusIds.length} estatus`;
  };

  const estiloTarjetaLead = (lead) => {
    if (esLeadCancelado(lead)) {
      return { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' };
    }
    if (lead.estatus_color) {
      return {
        backgroundColor: `${lead.estatus_color}14`,
        borderColor: `${lead.estatus_color}55`,
      };
    }
    return {};
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
      if (vaACancelarEnFormulario && !motivoDesactivacion.trim()) {
        alert('Indica el motivo de cancelación antes de guardar.');
        return;
      }

      const datosActualizados = {
        nombre: formData.nombre,
        correo: formData.correo,
        telefono: formData.telefono,
        valor: valorNumerico,
        medio: formData.medio || MEDIO_DEFAULT,
        usuario_id: agenteAsignado,
        estatus_id: formData.estatus_id
      };

      if (vaACancelarEnFormulario) {
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
      const cumpleFiltroEstatus =
        filtroEstatusIds.length === 0 || filtroEstatusIds.includes(lead.estatus_id);

      return esDeLaEtapa && esDelAgente && cumpleFiltroEstatus;
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

  const parseEtapasAlcanzadas = (lead) => {
    if (!lead.etapas_alcanzadas) return new Set();
    return new Set(String(lead.etapas_alcanzadas).split(','));
  };

  const hayEtapasNuevasPorRegistrar = (lead, ordenOrigen, ordenDestino) => {
    const alcanzadas = parseEtapasAlcanzadas(lead);
    return etapas.some(
      (et) => et.orden > ordenOrigen && et.orden <= ordenDestino && !alcanzadas.has(et.id),
    );
  };

  const handleDrop = (e, targetStageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    const lead = leads.find(l => l.id === leadId);

    if (!leadId || !lead || !esLeadMovible(lead)) return;
    if (lead.stage_id === targetStageId) return;

    const etapaOrigen = etapas.find((et) => et.id === lead.stage_id);
    const etapaDestino = etapas.find((et) => et.id === targetStageId);
    const ordenOrigen = etapaOrigen?.orden ?? -1;
    const ordenDestino = etapaDestino?.orden ?? 0;

    if (ordenDestino <= ordenOrigen || !hayEtapasNuevasPorRegistrar(lead, ordenOrigen, ordenDestino)) {
      ejecutarMovimientoEtapa(leadId, targetStageId);
      return;
    }

    setConfirmacionMovimiento({
      leadId,
      idCorto: leadId.slice(0, 8),
      etapaOrigen: etapaOrigen?.nombre_etapa || '—',
      etapaDestino: etapaDestino?.nombre_etapa || '—',
      targetStageId,
    });
  };

  const ejecutarMovimientoEtapa = (leadId, targetStageId) => {
    api.put(`/leads/${leadId}/etapa`, { stage_id: targetStageId })
      .then(() => fetchTablero())
      .catch(err => {
        const msg = err.response?.data?.error || err.message;
        console.error("❌ Error al mover:", msg);
        alert('Error al mover el lead: ' + msg);
      });
  };

  const confirmarMovimientoEtapa = () => {
    if (!confirmacionMovimiento) return;
    ejecutarMovimientoEtapa(confirmacionMovimiento.leadId, confirmacionMovimiento.targetStageId);
    setConfirmacionMovimiento(null);
  };

  const cancelarMovimientoEtapa = () => {
    setConfirmacionMovimiento(null);
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
      

          <div className="relative inline-block text-left min-w-[200px]">
            <button
              type="button"
              onClick={() => setMenuEstatusAbierto(!menuEstatusAbierto)}
              className="flex items-center justify-between w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 outline-none focus:border-blue-500 shadow-sm hover:bg-slate-50"
            >
              <span>{etiquetaFiltroEstatus()}</span>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${menuEstatusAbierto ? 'rotate-180' : ''}`} />
            </button>
            {menuEstatusAbierto && (
              <div className="absolute z-20 right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-100 py-1 max-h-72 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setFiltroEstatusIds([]); setMenuEstatusAbierto(false); }}
                  className={`flex items-center justify-between w-full px-4 py-2.5 text-sm ${
                    filtroEstatusIds.length === 0 ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Todos los estatus
                  {filtroEstatusIds.length === 0 && <Check size={14} />}
                </button>
                {estatusList.map((est) => {
                  const sel = filtroEstatusIds.includes(est.id);
                  return (
                    <button
                      key={est.id}
                      type="button"
                      onClick={() => toggleFiltroEstatus(est.id)}
                      className={`flex items-center justify-between w-full px-4 py-2.5 text-sm ${
                        sel ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: est.color_hex || '#e2e8f0' }}
                        />
                        {est.nombre}
                      </span>
                      {sel && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
          const sumaTotal = leadsFiltrados.reduce((total, lead) => {
            if (!incluyeEnSuma(lead)) return total;
            return total + parseFloat(lead.valor || 0);
          }, 0);

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
                  const movible = esLeadMovible(lead);
                  const editable = esLeadEditable(lead);
                  const cancelado = esLeadCancelado(lead);
                  return (
                  <div 
                    key={lead.id} 
                    draggable={movible}
                    onDragStart={movible ? (e) => handleDragStart(e, lead.id) : undefined}
                    onDragEnd={movible ? handleDragEnd : undefined}
                    style={estiloTarjetaLead(lead)}
                    className={`p-4 rounded-xl shadow-sm border group relative overflow-hidden transition-shadow ${
                      movible
                        ? 'hover:shadow-md cursor-grab active:cursor-grabbing'
                        : cancelado
                          ? 'opacity-75 grayscale cursor-default'
                          : 'opacity-90 cursor-default'
                    } ${!lead.estatus_color && !cancelado ? 'bg-white border-slate-200 hover:border-blue-400' : ''}`}
                  >
                    <div
                      className="absolute left-0 top-0 w-1 h-full opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: lead.estatus_color || (cancelado ? '#94a3b8' : (etapa.color_hex || '#3b82f6')) }}
                    />
                    
                    {editable && (
                      <button 
                        type="button"
                        onClick={() => abrirModalEditar(lead)}
                        className="absolute top-9 right-3 text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-md p-1 z-20"
                        title="Editar Prospecto"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                      </button>
                    )}

                    <span className={`absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded z-10 pointer-events-none ${
                      cancelado
                        ? 'text-slate-500 bg-slate-200'
                        : 'text-slate-600 bg-white/90 border border-slate-200'
                    } ${editable ? 'group-hover:opacity-0' : ''}`}>
                      {lead.estatus_nombre || '—'}
                    </span>
                    
                    <div className={`flex justify-between items-start mb-1 pr-20`}>
                      <p className={`font-bold text-sm truncate ${cancelado ? 'text-slate-500' : 'text-slate-900'}`}>{lead.nombre || "Sin nombre"}</p>
                    </div>

                    <div className="mb-2">
                      {parseFloat(lead.valor) > 0 && (
                        <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap inline-block mb-1 ${
                          incluyeEnSuma(lead)
                            ? 'text-green-700 bg-green-50 border-green-200'
                            : 'text-slate-500 bg-slate-200 border-slate-300'
                        }`}>
                          {formatoMoneda(lead.valor)}
                        </span>
                      )}
                      <p className={`text-[11px] truncate ${cancelado ? 'text-slate-400' : 'text-slate-500'}`}>{lead.correo || 'Sin correo'}</p>
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

      {confirmacionMovimiento && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <p className="text-slate-800 font-semibold text-lg leading-relaxed">
              El lead #{confirmacionMovimiento.idCorto} se moverá de{' '}
              <span className="text-blue-700">{confirmacionMovimiento.etapaOrigen}</span> a{' '}
              <span className="text-blue-700">{confirmacionMovimiento.etapaDestino}</span>{' '}
              y generará una etiqueta temporal en la base de datos. ¿Desea continuar?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={cancelarMovimientoEtapa}
                className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMovimientoEtapa}
                className="flex-1 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarAvisoCancelacion && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
            <p className="text-slate-800 font-semibold text-lg leading-relaxed">
              Si guardas con estatus cancelado, este lead no podrá cambiar de estatus ni editarse de nuevo.
            </p>
            <button
              type="button"
              onClick={confirmarAvisoCancelacion}
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Estatus del prospecto
                      </label>
                      <select
                        value={formData.estatus_id}
                        onChange={(e) => handleCambioEstatus(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-medium text-slate-800"
                      >
                        {estatusList.map((est) => (
                          <option key={est.id} value={est.id}>
                            {est.nombre}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1.5">
                        Cancelar es permanente. Los demás estatus se pueden cambiar después.
                      </p>
                    </div>

                    {vaACancelarEnFormulario && (
                      <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Motivo de cancelación *
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