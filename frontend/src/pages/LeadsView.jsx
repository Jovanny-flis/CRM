import { useEffect, useState, useRef } from 'react';
import api from '../api';
import { Users, User, Check, ChevronDown, Search, FileText, Calendar, DollarSign, Package, Eye } from 'lucide-react';
import SelectorCanales, { MEDIO_DEFAULT } from '../components/SelectorCanales';

const CODIGO_ACTIVO = 'activo';
const CODIGO_CANCELADO = 'cancelado';

const valorEstimadoValido = (valor) => {
  const n = parseFloat(valor);
  return Number.isFinite(n) && n > 0;
};

const valorMostrableLead = (lead) => {
  if (lead.cotizacion_id && lead.cotizacion_valor_activo != null) {
    return parseFloat(lead.cotizacion_valor_activo);
  }
  return parseFloat(lead.valor || 0);
};

function LeadsView() {
  const [leads, setLeads] = useState([]);
  const [medios, setMedios] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [estatusList, setEstatusList] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [menuAgentesAbierto, setMenuAgentesAbierto] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [leadEditando, setLeadEditando] = useState(null); 
  const [modoSoloLectura, setModoSoloLectura] = useState(false);
  
  // ESTADOS PARA EL BUSCADOR DE COTIZACIONES
  const [terminoBusquedaCotizacion, setTerminoBusquedaCotizacion] = useState('');
  const [sugerenciasCotizaciones, setSugerenciasCotizaciones] = useState([]);
  const [buscandoCotizaciones, setBuscandoCotizaciones] = useState(false);
  const [mostrarBuscadorCotizacion, setMostrarBuscadorCotizacion] = useState(false);
  const buscadorRef = useRef(null);
  
  const [formData, setFormData] = useState({
    nombre: '', 
    correo: '', 
    telefono: '', 
    valor: '', 
    medio: '',
    usuario_id: '',
    estatus_id: ''
  });

  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id; 

  const [filtroAgente, setFiltroAgente] = useState(
    usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : ''
  );
  const [filtroEstatusIds, setFiltroEstatusIds] = useState([]);
  const [modoFiltroEstatus, setModoFiltroEstatus] = useState('predeterminado');
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

  // CARGA AUTOMÁTICA DE COTIZACIONES AL ABRIR EL BUSCADOR
  useEffect(() => {
    if (mostrarBuscadorCotizacion && !modoSoloLectura) {
      const cargarInicial = async () => {
        setBuscandoCotizaciones(true);
        try {
          const res = await api.get(`/cotizaciones/buscar/${empresaId}?termino=`);
          setSugerenciasCotizaciones(res.data);
        } catch (error) {
          console.error("Error cargando cotizaciones libres:", error);
        } finally {
          setBuscandoCotizaciones(false);
        }
      };
      cargarInicial();
    }
  }, [mostrarBuscadorCotizacion, modoSoloLectura, empresaId]);

  const cerrarModal = () => {
    setIsModalOpen(false);
    setLeadEditando(null);
    setModoSoloLectura(false);
    setFormData({ nombre: '', correo: '', telefono: '', valor: '', medio: '', usuario_id: '', estatus_id: '' });
    setMotivoDesactivacion('');
    setMostrarAvisoCancelacion(false);
    setEstatusOriginalCodigo('activo');
    setMostrarBuscadorCotizacion(false);
    setTerminoBusquedaCotizacion('');
    setSugerenciasCotizaciones([]);
  };

  const esLeadCancelado = (lead) => lead.estatus_codigo === CODIGO_CANCELADO;
  const esLeadMovible = (lead) => !esLeadCancelado(lead) && (lead.estatus_permite_mover === 1 || lead.estatus_permite_mover === true);
  const esLeadEditable = (lead) => !esLeadCancelado(lead);
  const incluyeEnSuma = (lead) => lead.estatus_incluir_en_suma === 1 || lead.estatus_incluir_en_suma === true;

  const estatusCanceladoId = estatusList.find((e) => e.codigo === CODIGO_CANCELADO)?.id;
  const vaACancelarEnFormulario = formData.estatus_id && formData.estatus_id === estatusCanceladoId;

  const abrirModalEditar = (leadCompleto) => {
    if (!esLeadEditable(leadCompleto)) return;
    setModoSoloLectura(false);
    cargarDatosAlModal(leadCompleto);
  };

  const abrirModalVer = (leadCompleto) => {
    setModoSoloLectura(true);
    cargarDatosAlModal(leadCompleto);
  };

  const cargarDatosAlModal = (leadCompleto) => {
    setLeadEditando(leadCompleto);
    setFormData({
      nombre: leadCompleto.nombre || '',
      correo: leadCompleto.correo || '',
      telefono: leadCompleto.telefono || '',
      valor: leadCompleto.cotizacion_id
        ? (leadCompleto.cotizacion_valor_activo ?? leadCompleto.valor ?? '')
        : (leadCompleto.valor || ''),
      medio: leadCompleto.medio || '',
      usuario_id: leadCompleto.usuario_id || '',
      estatus_id: leadCompleto.estatus_id || ''
    });
    setEstatusOriginalCodigo(leadCompleto.estatus_codigo || 'activo');
    setMotivoDesactivacion('');
    setMostrarAvisoCancelacion(false);
    setIsModalOpen(true);
    setMostrarBuscadorCotizacion(!leadCompleto.cotizacion_id); 
  };

  const handleCambioEstatus = (nuevoEstatusId) => {
    if (modoSoloLectura) return;
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
    setModoFiltroEstatus('seleccion');
    setFiltroEstatusIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) {
        setModoFiltroEstatus('predeterminado');
      }
      return next;
    });
  };

  const seleccionarTodosLosEstatus = () => {
    setModoFiltroEstatus('todos');
    setFiltroEstatusIds([]);
    setMenuEstatusAbierto(false);
  };

  const seleccionarVistaPredeterminada = () => {
    setModoFiltroEstatus('predeterminado');
    setFiltroEstatusIds([]);
    setMenuEstatusAbierto(false);
  };

  const codigoEstatusLead = (lead) => lead.estatus_codigo || CODIGO_ACTIVO;

  const leadCoincideConFiltroEstatus = (lead) => {
    const codigoLead = codigoEstatusLead(lead);
    const idLead = lead.estatus_id != null ? String(lead.estatus_id) : null;

    if (modoFiltroEstatus === 'todos') return true;

    if (modoFiltroEstatus === 'predeterminado') {
      return codigoLead !== CODIGO_CANCELADO;
    }

    return filtroEstatusIds.some((idFiltro) => {
      if (idLead && String(idFiltro) === idLead) return true;
      const est = estatusList.find((e) => String(e.id) === String(idFiltro));
      return est?.codigo === codigoLead;
    });
  };

  const etiquetaFiltroEstatus = () => {
    if (modoFiltroEstatus === 'todos') return 'Todos los estatus';
    if (modoFiltroEstatus === 'predeterminado' || filtroEstatusIds.length === 0) {
      return 'Vista predeterminada';
    }
    if (filtroEstatusIds.length === 1) {
      return estatusList.find((e) => String(e.id) === String(filtroEstatusIds[0]))?.nombre || '1 estatus';
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

  // --- LÓGICA DEL BUSCADOR DE COTIZACIONES ---
  const handleBuscarCotizacion = async (e) => {
    if (modoSoloLectura) return;
    const termino = e.target.value;
    setTerminoBusquedaCotizacion(termino);

    setBuscandoCotizaciones(true);
    try {
      const res = await api.get(`/cotizaciones/buscar/${empresaId}?termino=${termino}`);
      setSugerenciasCotizaciones(res.data);
    } catch (error) {
      console.error("Error buscando cotizaciones:", error);
    } finally {
      setBuscandoCotizaciones(false);
    }
  };

  const asignarCotizacion = async (cotizacionId) => {
    if (modoSoloLectura || !leadEditando || !leadEditando.id) return;
    
    try {
      await api.put(`/leads/${leadEditando.id}/vincular-cotizacion`, { cotizacion_id: cotizacionId });
      alert("✅ Cotización asignada con éxito.");
      fetchTablero();
      cerrarModal(); 
    } catch (error) {
      alert("❌ Error al asignar cotización: " + (error.response?.data?.error || error.message));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (modoSoloLectura) return;

    const tieneCotizacion = Boolean(leadEditando?.cotizacion_id);
    const valorNumerico = tieneCotizacion
      ? parseFloat(leadEditando.cotizacion_valor_activo ?? formData.valor)
      : parseFloat(formData.valor);

    if (!tieneCotizacion && !valorEstimadoValido(formData.valor)) {
      alert('El valor estimado es obligatorio y debe ser mayor a cero.');
      return;
    }
    const agenteAsignado = usuarioLogueado.rol === 'agente' ? usuarioLogueado.id : formData.usuario_id;
    
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

      api.put(`/leads/${leadEditando.id}`, datosActualizados) 
        .then(() => {
          fetchTablero();
          cerrarModal();
        })
        .catch(err => {
          const msg = err.response?.data?.error || err.message;
          alert("Error al actualizar: " + msg);
        });
    } 
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
      const cumpleFiltroEstatus = leadCoincideConFiltroEstatus(lead);

      return esDeLaEtapa && esDelAgente && cumpleFiltroEstatus;
    });
  };

  const formatoMoneda = (monto) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);
  };

  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData("leadId", leadId.toString());
    e.target.style.opacity = "0.5";
    e.target.style.cursor = "grabbing";
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
  };

  const handleDragOver = (e) => {
    e.preventDefault(); 
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
    <div className="font-sans w-full max-w-full min-w-0 pb-20">
      <header className="mb-8 w-full max-w-full min-w-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 shrink">
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Tablero de Leads</h1>
          <p className="text-slate-500 mt-1">Gestión de prospectos por equipo</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 sm:justify-end sm:shrink-0">
          
          {(usuarioLogueado.rol === 'super_admin' || usuarioLogueado.rol === 'admin_empresa' || usuarioLogueado.rol === 'supervisor') && (
            <div className="relative inline-block text-left min-w-[240px]">
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

              {menuAgentesAbierto && (
                <div className="absolute z-10 w-full mt-2 bg-white rounded-xl shadow-lg border border-slate-100 py-1 max-h-60 overflow-y-auto">
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
                  onClick={seleccionarVistaPredeterminada}
                  className={`flex items-center justify-between w-full px-4 py-2.5 text-sm ${
                    modoFiltroEstatus === 'predeterminado' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Vista predeterminada
                  {modoFiltroEstatus === 'predeterminado' && <Check size={14} />}
                </button>
                <button
                  type="button"
                  onClick={seleccionarTodosLosEstatus}
                  className={`flex items-center justify-between w-full px-4 py-2.5 text-sm ${
                    modoFiltroEstatus === 'todos' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Todos los estatus
                  {modoFiltroEstatus === 'todos' && <Check size={14} />}
                </button>
                {estatusList.map((est) => {
                  const sel = modoFiltroEstatus === 'seleccion' && filtroEstatusIds.includes(est.id);
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
            onClick={() => { setLeadEditando(null); setModoSoloLectura(false); setIsModalOpen(true); }}
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

      {/* EL TABLERO KANBAN */}
      <div className="flex gap-6 overflow-x-auto pb-6 w-full max-w-full min-w-0 h-full">
        {etapas.map(etapa => {
          const leadsFiltrados = obtenerLeadsPorEtapaId(etapa.id);
          const sumaTotal = leadsFiltrados.reduce((total, lead) => {
            if (!incluyeEnSuma(lead)) return total;
            return total + valorMostrableLead(lead);
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
                    
                    {/* BOTONES DE ACCIÓN FLOTANTES: VER Y EDITAR */}
                    <div className="absolute top-9 right-3 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      <button 
                        type="button"
                        onClick={() => abrirModalVer(lead)}
                        className="text-slate-400 hover:text-blue-500 bg-white/95 border border-slate-100 rounded-md p-1.5 shadow-sm transition-colors"
                        title="Ver Detalles"
                      >
                        <Eye size={14} />
                      </button>
                      
                      {editable && (
                        <button 
                          type="button"
                          onClick={() => abrirModalEditar(lead)}
                          className="text-slate-400 hover:text-[#ea5533] bg-white/95 border border-slate-100 rounded-md p-1.5 shadow-sm transition-colors"
                          title="Editar Prospecto"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                      )}
                    </div>

                    {/* BADGES ESQUINA SUPERIOR DERECHA: folio arriba, estatus abajo */}
                    <div className={`absolute top-3 right-3 flex flex-col items-end gap-1 z-10 pointer-events-none ${editable ? 'group-hover:opacity-0' : ''}`}>
                      {lead.cotizacion_folio && (
                        <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded text-white bg-[#ea5533] shadow-sm">
                          FL-{String(lead.cotizacion_folio).padStart(3, '0')}
                        </span>
                      )}
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        cancelado
                          ? 'text-slate-500 bg-slate-200'
                          : 'text-slate-600 bg-white/90 border border-slate-200'
                      }`}>
                        {lead.estatus_nombre || '—'}
                      </span>
                    </div>

                    <div className={`flex justify-between items-start mb-1 pr-14`}>
                      <p className={`font-bold text-sm truncate ${cancelado ? 'text-slate-500' : 'text-slate-900'}`}>{lead.nombre || "Sin nombre"}</p>
                    </div>

                    <div className="mb-2">
                      {valorMostrableLead(lead) > 0 && (
                        <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap inline-block mb-1 ${
                          incluyeEnSuma(lead)
                            ? 'text-green-700 bg-green-50 border-green-200'
                            : 'text-slate-500 bg-slate-200 border-slate-300'
                        }`}>
                          {formatoMoneda(valorMostrableLead(lead))}
                        </span>
                      )}
                      <p className={`text-[11px] truncate ${cancelado ? 'text-slate-400' : 'text-slate-500'}`}>{lead.correo || 'Sin correo'}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-medium max-w-[120px]">
                          <User size={12} className="text-blue-500 shrink-0" />
                          <span className="truncate" title={lead.agente_nombre || 'Desconocido'}>
                            {lead.agente_nombre ? lead.agente_nombre.split(' ')[0] : 'Desconocido'}
                          </span>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                          {lead.medio || MEDIO_DEFAULT}
                        </span>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE CONFIRMACIÓN DE MOVIMIENTO */}
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

      {/* MODAL PRINCIPAL: CREAR/EDITAR LEAD Y VER COTIZACIÓN */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 ${leadEditando ? 'w-full max-w-5xl' : 'w-full max-w-lg'}`}>
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                  {modoSoloLectura && <Eye className="text-slate-400" size={24} />}
                  {leadEditando ? (modoSoloLectura ? 'Detalles del Prospecto' : 'Editar Prospecto') : 'Nuevo Prospecto'}
                </h2>
                <button onClick={cerrarModal} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 rounded-full p-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <div className={`grid grid-cols-1 ${leadEditando ? 'lg:grid-cols-2 gap-8' : ''}`}>
                
                {/* COLUMNA IZQUIERDA: Formulario de Lead */}
                <div>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Completo *</label>
                      <input 
                        type="text" required 
                        value={formData.nombre} 
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})} 
                        disabled={modoSoloLectura}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent" 
                        placeholder="Ej. Juan Pérez" 
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Correo</label>
                        <input 
                          type="email" 
                          value={formData.correo} 
                          onChange={(e) => setFormData({...formData, correo: e.target.value})} 
                          disabled={modoSoloLectura}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent" 
                          placeholder="juan@mail.com" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teléfono</label>
                        <input 
                          type="text" 
                          value={formData.telefono} 
                          onChange={(e) => setFormData({...formData, telefono: e.target.value})} 
                          disabled={modoSoloLectura}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent" 
                          placeholder="5512345678" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${modoSoloLectura ? 'text-slate-500' : 'text-green-600'}`}>
                          {leadEditando?.cotizacion_id ? 'Valor del activo (cotización)' : 'Valor Estimado ($) *'}
                        </label>
                        <input 
                          type="number" required min="0.01" step="0.01" 
                          value={formData.valor} 
                          onChange={(e) => setFormData({...formData, valor: e.target.value})} 
                          disabled={modoSoloLectura || Boolean(leadEditando?.cotizacion_id)}
                          className={`w-full border rounded-xl px-4 py-3 outline-none font-bold ${modoSoloLectura || leadEditando?.cotizacion_id ? 'bg-slate-100 border-transparent text-slate-600' : 'bg-green-50 border-green-200 focus:bg-white focus:border-green-500 text-green-700'}`} 
                          placeholder="Ej. 15000" 
                        />
                      </div>
                      <div className={modoSoloLectura ? "pointer-events-none opacity-80" : ""}>
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
                            disabled={modoSoloLectura}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent appearance-none"
                          >
                            {estatusList.map((est) => (
                              <option key={est.id} value={est.id}>
                                {est.nombre}
                              </option>
                            ))}
                          </select>
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
                              disabled={modoSoloLectura}
                              rows={3}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-amber-500 text-sm disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent"
                              placeholder="Describe el motivo..."
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {(usuarioLogueado.rol === 'admin_empresa' || usuarioLogueado.rol === 'supervisor') && (
                      <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Asignado a:</label>
                        <select 
                          value={formData.usuario_id} 
                          onChange={(e) => setFormData({...formData, usuario_id: e.target.value})} 
                          disabled={modoSoloLectura}
                          className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 focus:bg-white outline-none appearance-none font-medium text-blue-800 disabled:bg-slate-100 disabled:text-slate-600 disabled:border-transparent"
                        >
                          <option value="">Sin asignar</option>
                          {agentes.map(agente => (
                            <option key={agente.id} value={agente.id}>
                              {agente.nombre} ({agente.rol.replace('_', ' ')})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {!modoSoloLectura && (
                      <div className="pt-6 flex gap-4">
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all text-lg">
                          {leadEditando ? '💾 Guardar Cambios' : 'Crear Prospecto'}
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                {/* COLUMNA DERECHA: Cotización y Buscador Inteligente */}
                {leadEditando && (
                  <div className="flex flex-col h-full bg-slate-50 rounded-2xl p-6 border border-slate-200 relative">
                    
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                        <FileText className="text-[#ea5533]" size={20} />
                        Cotización Asignada
                      </h3>
                      
                      {/* Botón para cambiar cotización (SOLO EN EDICIÓN) */}
                      {leadEditando.cotizacion_id && !mostrarBuscadorCotizacion && !modoSoloLectura && (
                        <button 
                          onClick={() => setMostrarBuscadorCotizacion(true)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 underline shrink-0"
                        >
                          Cambiar Cotización
                        </button>
                      )}
                    </div>

                    {/* MOSTRAR DATOS SÚPER DETALLADOS DE LA COTIZACIÓN ACTUAL */}
                    {leadEditando.cotizacion_id && !mostrarBuscadorCotizacion ? (
                      <div className="bg-[#1e1e1e] text-white rounded-2xl p-6 shadow-xl border border-slate-800 relative overflow-hidden flex-1 flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#ea5533]/10 rounded-bl-full pointer-events-none"></div>
                        
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span className="text-[10px] font-bold text-[#ea5533] uppercase tracking-widest">FOLIO</span>
                            <div className="text-2xl font-black">FL-{String(leadEditando.cotizacion_folio).padStart(3, '0')}</div>
                          </div>
                          <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-medium border border-white/20 backdrop-blur-sm shadow-inner">
                            {leadEditando.cotizacion_plazo} Meses
                          </span>
                        </div>

                        <div className="space-y-5 border-t border-white/10 pt-5">
                          
                          {/* Fila 1: Producto principal */}
                          <div>
                            <div className="text-slate-400 text-xs font-medium flex items-center gap-1.5 mb-1"><Package size={14} /> Producto / Activo</div>
                            <div className="font-bold text-sm bg-black/40 p-3 rounded-xl border border-white/5 shadow-inner">
                              {leadEditando.cotizacion_activo || leadEditando.cotizacion_tipo_activo || 'No especificado'}
                            </div>
                          </div>

                          {/* Fila 2: Detalles Vehiculares (Si existen) */}
                          {(leadEditando.cotizacion_marca || leadEditando.cotizacion_modelo || leadEditando.cotizacion_anio) && (
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-white/5 p-2.5 rounded-lg border border-white/10 text-center">
                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Marca</div>
                                <div className="font-bold text-xs truncate" title={leadEditando.cotizacion_marca}>{leadEditando.cotizacion_marca || '-'}</div>
                              </div>
                              <div className="bg-white/5 p-2.5 rounded-lg border border-white/10 text-center">
                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Modelo</div>
                                <div className="font-bold text-xs truncate" title={leadEditando.cotizacion_modelo}>{leadEditando.cotizacion_modelo || '-'}</div>
                              </div>
                              <div className="bg-white/5 p-2.5 rounded-lg border border-white/10 text-center">
                                <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Año</div>
                                <div className="font-bold text-xs truncate" title={leadEditando.cotizacion_anio}>{leadEditando.cotizacion_anio || '-'}</div>
                              </div>
                            </div>
                          )}

                          {/* Fila 3: Renta y Enganche */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-slate-400 text-xs font-medium flex items-center gap-1.5 mb-1"><Calendar size={14} /> Renta Mensual</div>
                              <div className="font-bold text-lg text-blue-400">
                                {formatoMoneda(leadEditando.cotizacion_renta)}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-xs font-medium flex items-center gap-1.5 mb-1"><DollarSign size={14} /> Pago Inicial</div>
                              <div className="font-bold text-lg text-green-400">
                                {formatoMoneda(leadEditando.cotizacion_enganche)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Fila 4: Valores del activo */}
                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 mt-auto">
                            <div>
                              <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Valor del bien</div>
                              <div className="font-bold text-sm text-slate-200">
                                {formatoMoneda(leadEditando.cotizacion_valor_activo)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">
                                Valor Residual ({leadEditando.cotizacion_porcentaje_vr || 0}%)
                              </div>
                              <div className="font-bold text-sm text-slate-200">
                                {formatoMoneda(leadEditando.cotizacion_vr_calculado)}
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    ) : (
                      
                      /* BUSCADOR INTELIGENTE DE COTIZACIONES (Oculto en modo lectura si no hay cotización) */
                      <div className="flex-1 flex flex-col relative">
                        
                        {!modoSoloLectura ? (
                          <>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                              Vincular Cotización Libre
                            </label>
                            <div className="relative shrink-0">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                              <input 
                                type="text" 
                                value={terminoBusquedaCotizacion}
                                onChange={handleBuscarCotizacion}
                                placeholder="Buscar por folio o vehículo..." 
                                className="w-full bg-white border-2 border-slate-300 rounded-xl pl-11 pr-4 py-3 focus:border-[#ea5533] outline-none transition-colors font-medium text-slate-700 shadow-inner"
                              />
                            </div>

                            {/* LISTA INTEGRADA DE RESULTADOS */}
                            <div className="mt-4 flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto max-h-[350px]">
                              {buscandoCotizaciones ? (
                                <div className="p-6 text-center text-slate-400 text-sm font-medium animate-pulse">
                                  Cargando cotizaciones...
                                </div>
                              ) : sugerenciasCotizaciones.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                  {sugerenciasCotizaciones.map(cot => (
                                    <button 
                                      key={cot.id}
                                      onClick={() => asignarCotizacion(cot.id)}
                                      className="w-full text-left p-4 hover:bg-slate-50 transition-colors group flex justify-between items-center"
                                    >
                                      <div>
                                        <div className="font-black text-slate-800 text-sm group-hover:text-[#ea5533] transition-colors">
                                          Folio FL-{String(cot.folio).padStart(3, '0')}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">
                                          {cot.nombre_activo || cot.tipo_activo || 'Sin detalle de vehículo'}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <div className="font-bold text-blue-600 text-sm">{formatoMoneda(cot.renta_mensual_con_iva)}</div>
                                        <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-0.5">Mensual</div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-6 text-center text-slate-500 text-sm">
                                  {terminoBusquedaCotizacion !== '' 
                                    ? `No encontramos la cotización "${terminoBusquedaCotizacion}".`
                                    : 'No hay cotizaciones libres en este momento.'}
                                </div>
                              )}
                            </div>
                          </>
                        ) : null}

                        {/* ESTADO VACÍO CUANDO ES SOLO LECTURA */}
                        {modoSoloLectura && !leadEditando.cotizacion_id && (
                           <div className="mt-12 text-center opacity-60 flex flex-col items-center">
                              <FileText size={48} className="text-slate-400 mb-3" />
                              <p className="text-sm font-medium text-slate-600">Este prospecto no tiene <br/>ninguna cotización vinculada.</p>
                           </div>
                        )}
                        
                        {/* BOTÓN CANCELAR BÚSQUEDA */}
                        {leadEditando.cotizacion_id && !modoSoloLectura && (
                          <button 
                            onClick={() => setMostrarBuscadorCotizacion(false)}
                            className="mt-4 px-4 py-3 text-slate-500 font-bold hover:text-slate-700 text-sm shrink-0"
                          >
                            Cancelar cambio
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeadsView;