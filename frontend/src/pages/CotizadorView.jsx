import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { MoreVertical, Plus, Search } from 'lucide-react';
import api from '../api';
import ModalDestinoProspecto from '../components/ModalDestinoProspecto';
import ModalDetalleCotizacion from '../components/ModalDetalleCotizacion';
import AdminGpsCatalogoPanel from '../components/AdminGpsCatalogoPanel';
import SelectorGpsPrecio from '../components/SelectorGpsPrecio';
import { OPCIONES_TIPO_PERSONA } from '../constants/tipoPersona';
import {
  cotizacionAFormData,
  formDataAPayloadCotizacion,
  formDataCotizadorVacio,
  formatMontoEnFormulario,
  parseNumeroFormulario,
  limpiarCamposSoloAutomotriz,
} from '../lib/cotizacionFormulario';
import {
  descargarPdfPreview,
  generarPdfDesdeCotizacion,
} from '../lib/generarPdfCotizacion';
import {
  claveNombreLead,
  crearLeadOportunidad,
  leadsPorNombreUnico,
  vincularCotizacionActiva,
} from '../lib/destinoProspectoCotizacion';
import { calcularErroresYResultados } from '../lib/cotizacionCalculo';
import {
  claseFilaHistorialEspecial,
  claseMarcoCotizacionEspecial,
  cotizacionEspecialBloqueaAccionesHistorial,
  cotizacionPendienteAutorizacion,
  esCotizacionEspecial,
  puedeAutorizarEspecial,
  puedeUsarModoEspecial,
} from '../lib/cotizacionEspecial';

/** Automotriz: marca - modelo - version - año */
const camposActivoCompletos = (data) => {
  if (data.tipoArrendamiento === 'Automotriz') {
    return ['marca', 'modelo', 'version', 'anio'].every((k) => String(data[k] || '').trim() !== '');
  }
  return String(data.nombreActivo || '').trim() !== '';
};

const cotizacionListaParaAccion = (data, erroresCalculo) => {
  if (Object.keys(erroresCalculo).length > 0) return false;
  if (!String(data.nombre_cliente || '').trim()) return false;
  const valor = parseNumeroFormulario(data.valorActivo);
  if (!valor || valor <= 0) return false;
  return camposActivoCompletos(data);
};

const normalizarBusquedaHistorial = (texto) =>
  String(texto || '').trim().toLowerCase();

/** Variantes de folio para búsqueda parcial (FL-042, 042, 42, etc.) */
const variantesFolioHistorial = (folio) => {
  if (folio == null || folio === '') return '';
  const num = String(folio);
  const padded = num.padStart(3, '0');
  return `fl-${padded} ${padded} ${num}`.toLowerCase();
};

const folioHistorialTexto = (folio) =>
  (folio != null && folio !== '')
    ? `FL-${String(folio).padStart(3, '0')}`
    : 'esta cotización';

const cotizacionCoincideBusquedaHistorial = (cot, termino) => {
  const q = normalizarBusquedaHistorial(termino);
  if (!q) return true;

  const nombre = normalizarBusquedaHistorial(cot.lead_nombre);
  if (nombre && nombre.includes(q)) return true;

  const folioTxt = variantesFolioHistorial(cot.folio);
  if (!folioTxt) return false;

  const qFolio = q.replace(/^fl-?/, '');
  return folioTxt.includes(q) || (qFolio !== '' && folioTxt.includes(qFolio));
};

// --- TABLAS DE TOPES RESIDUALES ---
const tablaResidual = [
  { min: 12, max: 12, valores: { Sedan: 67, SUV: 70, Camionetas: 68, Lujo: 60, Tractocamion: 65, Autobus: 65 }},
  { min: 13, max: 24, valores: { Sedan: 58, SUV: 63, Camionetas: 60, Lujo: 48, Tractocamion: 52, Autobus: 52 }},
  { min: 25, max: 36, valores: { Sedan: 47, SUV: 55, Camionetas: 52, Lujo: 38, Tractocamion: 42, Autobus: 42 }},
  { min: 37, max: 48, valores: { Sedan: 38, SUV: 47, Camionetas: 45, Lujo: 30, Tractocamion: 34, Autobus: 34 }},
  { min: 49, max: 60, valores: { Sedan: 30, SUV: 40, Camionetas: 38, Lujo: 23, Tractocamion: 28, Autobus: 28 }},
  { min: 61, max: 72, valores: { Sedan: 25, SUV: 35, Camionetas: 33, Lujo: 18, Tractocamion: 23, Autobus: 23 }},
];

const tablaResidualOtro = [
  { min: 12, max: 12, valores: 70},
  { min: 13, max: 24, valores: 60},
  { min: 25, max: 36, valores: 51},
  { min: 37, max: 48, valores: 43},
  { min: 49, max: 60, valores: 36},
  { min: 61, max: 72, valores: 31},
];

// --- FÓRMULA MATEMÁTICA EXACTA ---
function calcularPMT(tasaAnual, n, pv, fv) {
  const r = (tasaAnual * 1.16) / 12 / 100;
  const factor = Math.pow(1 + r, n);
  const numerador = (pv * r * factor) - (fv * r);
  const denominador = factor - 1;
  if (denominador === 0) return 0;
  return numerador / denominador;
}

const formatMontoFormulario = formatMontoEnFormulario;

const CotizadorView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [historial, setHistorial] = useState([]); 
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [avisoPdfVivoAbierto, setAvisoPdfVivoAbierto] = useState(false);
  const [generandoPdfDetalle, setGenerandoPdfDetalle] = useState(false);

  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id;
  const muestraCatalogoGps = Boolean(empresaId) && usuarioLogueado.rol !== 'super_admin';
  const puedeAdministrarGps = ['admin_empresa', 'supervisor'].includes(usuarioLogueado.rol);

  const [formData, setFormData] = useState(formDataCotizadorVacio);
  const [folioOrigenReplicacion, setFolioOrigenReplicacion] = useState(null);
  const [modalDestino, setModalDestino] = useState(null);
  const [confirmacionHistorialDestino, setConfirmacionHistorialDestino] = useState(null);
  const [referenciaNombreClave, setReferenciaNombreClave] = useState('');
  const [menuHistorialId, setMenuHistorialId] = useState(null);
  const [detalleCotizacion, setDetalleCotizacion] = useState(null);
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [menuHistorialPanelStyle, setMenuHistorialPanelStyle] = useState(null);
  const menuHistorialTriggerRef = useRef(null);
  const menuHistorialPanelRef = useRef(null);
  const [gpsCatalogo, setGpsCatalogo] = useState([]);
  const [panelGpsAbierto, setPanelGpsAbierto] = useState(false);
  const [modoCotizacionEspecial, setModoCotizacionEspecial] = useState(false);
  const [confirmacionVinculoEspecial, setConfirmacionVinculoEspecial] = useState(null);
  const [procesandoAutorizacion, setProcesandoAutorizacion] = useState(false);

  const [res, setRes] = useState({});
  const [errores, setErrores] = useState({});

  const puedeGuardar = cotizacionListaParaAccion(formData, errores);
  const puedeGenerarPdf = puedeGuardar && !modoCotizacionEspecial;

  const leadsNombreUnico = useMemo(() => leadsPorNombreUnico(leads), [leads]);

  const historialFiltrado = useMemo(
    () => historial.filter((cot) => cotizacionCoincideBusquedaHistorial(cot, busquedaHistorial)),
    [historial, busquedaHistorial],
  );

  const cotizacionMenuHistorialAbierta = useMemo(
    () => historial.find((cot) => cot.id === menuHistorialId) ?? null,
    [historial, menuHistorialId],
  );

  const calcularPosicionMenuHistorial = () => {
    if (!menuHistorialTriggerRef.current) return;

    const rect = menuHistorialTriggerRef.current.getBoundingClientRect();
    const anchoPanel = 208;
    const espacioAbajo = window.innerHeight - rect.bottom - 8;
    const espacioArriba = rect.top - 8;
    const abrirArriba = espacioAbajo < 120 && espacioArriba > espacioAbajo;
    const top = abrirArriba ? Math.max(8, rect.top - 8 - 120) : rect.bottom + 4;

    setMenuHistorialPanelStyle({
      position: 'fixed',
      top,
      right: Math.max(8, window.innerWidth - rect.right),
      width: anchoPanel,
      zIndex: 9999,
    });
  };

  const cargarHistorial = () => {
    api.get(`/cotizaciones/empresa/${empresaId}?usuario_id=${usuarioLogueado.id}&rol=${usuarioLogueado.rol}`)
      .then(res => setHistorial(res.data))
      .catch(err => console.error("Error al cargar historial:", err));
  };

  const cargarLeads = () => {
    api.get(`/leads/${empresaId}`)
      .then(res => setLeads(res.data.filter(l => l.estatus_incluir_en_suma === 1 || l.estatus_incluir_en_suma === true)))
      .catch(console.error);
  };

  useEffect(() => {
    if (empresaId) {
      cargarLeads();
      cargarHistorial();
      setCargando(false);
    } else {
      setCargando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (!muestraCatalogoGps) return undefined;
    api.get(`/gps-catalogo/${empresaId}`)
      .then((res) => setGpsCatalogo(res.data))
      .catch((err) => console.error('Error al cargar catálogo GPS:', err));
    return undefined;
  }, [empresaId, muestraCatalogoGps]);

  useEffect(() => {
    const cotId = location.state?.replicarCotizacionId;
    if (!cotId || !empresaId) return undefined;

    let cancelado = false;
    (async () => {
      try {
        const res = await api.get(`/cotizaciones/${cotId}`);
        if (cancelado) return;
        setFormData(cotizacionAFormData(res.data, { paraReplicar: true }));
        setFolioOrigenReplicacion(res.data.folio ?? null);
        navigate('/cotizador', { replace: true, state: {} });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('Error al replicar cotización:', error);
        alert('No se pudo cargar la cotización a replicar.');
        navigate('/cotizador', { replace: true, state: {} });
      }
    })();

    return () => { cancelado = true; };
  }, [location.state?.replicarCotizacionId, empresaId, navigate]);

  useEffect(() => {
    if (!menuHistorialId) {
      setMenuHistorialPanelStyle(null);
      return undefined;
    }

    calcularPosicionMenuHistorial();

    const handleScrollOrResize = () => calcularPosicionMenuHistorial();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    const cerrarMenu = (e) => {
      if (e.target.closest('[data-menu-historial-cot]')) return;
      if (menuHistorialPanelRef.current?.contains(e.target)) return;
      setMenuHistorialId(null);
    };
    document.addEventListener('click', cerrarMenu);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('click', cerrarMenu);
    };
  }, [menuHistorialId]);

  const aplicarReplicacion = (cot) => {
    setFormData(cotizacionAFormData(cot, { paraReplicar: true }));
    setFolioOrigenReplicacion(cot.folio ?? null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const limpiarFormulario = () => {
    setFormData(formDataCotizadorVacio());
    setFolioOrigenReplicacion(null);
    setReferenciaNombreClave('');
    setModoCotizacionEspecial(false);
  };

  const toggleModoCotizacionEspecial = () => {
    setModoCotizacionEspecial((prev) => !prev);
  };

  const ejecutarAutorizacionEspecial = async (cotizacionId, rechazar) => {
    if (procesandoAutorizacion) return;
    setProcesandoAutorizacion(true);
    try {
      const ruta = rechazar ? 'rechazar-especial' : 'autorizar-especial';
      await api.post(`/cotizaciones/${cotizacionId}/${ruta}`);
      alert(rechazar ? 'Cotización especial rechazada.' : 'Cotización especial autorizada.');
      cargarHistorial();
      cargarLeads();
    } catch (error) {
      alert(error.response?.data?.error || error.message);
    } finally {
      setProcesandoAutorizacion(false);
    }
  };

  const handleLeadChange = (e) => {
    const clave = e.target.value;
    setReferenciaNombreClave(clave);
    if (!clave) return;
    const leadSel = leadsNombreUnico.find((l) => claveNombreLead(l.nombre) === clave);
    setFormData((prev) => ({
      ...prev,
      lead_id: '',
      nombre_cliente: leadSel ? leadSel.nombre : prev.tipo_persona,
      tipo_persona: leadSel ? (leadSel.tipo_persona || '') : prev.tipo_persona,
    }));
  };

  const sincronizarTipoPersonaLead = async (leadId) => {
    const leadRef = leads.find((l) => l.id === leadId);
    if (!leadRef) return;

    const tipoForm = formData.tipo_persona || null;
    const tipoLead = leadRef.tipo_persona || null;
    if (String(tipoForm || '') === String(tipoLead || '')) return;

    await api.put(`/leads/${leadId}`, {
      nombre: leadRef.nombre,
      correo: leadRef.correo || '',
      telefono: leadRef.telefono || '',
      valor: leadRef.valor,
      medio: leadRef.medio || '',
      usuario_id: leadRef.usuario_id,
      estatus_id: leadRef.estatus_id,
      tipo_persona: tipoForm,
    });
  };

  const ejecutarGuardadoConDestino = async (destino) => {
    setGuardando(true);
    let finalLeadId = null;

    try {
      if (destino.tipo === 'nuevo') {
        finalLeadId = await crearLeadOportunidad(api, {
          empresaId,
          usuarioId: usuarioLogueado.id,
          nombre: destino.nombre || formData.nombre_cliente,
          tipoPersona: formData.tipo_persona || null,
          valorActivo: parseNumeroFormulario(formData.valorActivo),
          medio: 'Cotizador',
        });
        cargarLeads();
      } else if (destino.tipo === 'existente') {
        finalLeadId = destino.leadId;
      }
      formData.usuario_id = usuarioLogueado.id;
      const resCot = await api.post('/cotizaciones', formDataAPayloadCotizacion(formData, res, {
        empresaId,
        usuarioId: usuarioLogueado.id,
        leadId: null,
        esEspecial: modoCotizacionEspecial,
      }));

      if (finalLeadId) {
        await vincularCotizacionActiva(api, resCot.data.id, finalLeadId);
        if (formData.tipo_persona) {
          await sincronizarTipoPersonaLead(finalLeadId);
        }
        cargarLeads();
      }

      const avisoMigracion = resCot.data?.aviso ? `\n\n⚠️ ${resCot.data.aviso}` : '';
      const avisoAuth = resCot.data?.aviso_autorizacion ? `\n\n${resCot.data.aviso_autorizacion}` : '';
      alert(`✅ Cotización guardada con éxito.${avisoMigracion}${avisoAuth}`);
      setFolioOrigenReplicacion(null);
      setModoCotizacionEspecial(false);
      cargarHistorial();
    } catch (error) {
      const detalle = error.response?.data?.error || error.message;
      console.error('Error al guardar cotización:', error.response?.data || error);
      alert(`❌ Error al guardar: ${detalle}`);
    } finally {
      setGuardando(false);
    }
  };

  const ejecutarGestionHistorial = async (cotizacion, destino) => {
    try {
      let leadId = null;
      if (destino.tipo === 'nuevo') {
        leadId = await crearLeadOportunidad(api, {
          empresaId,
          usuarioId: usuarioLogueado.id,
          nombre: destino.nombre,
          valorActivo: cotizacion.valor_activo || 0,
          medio: 'Cotizador (Historial)',
        });
      } else if (destino.tipo === 'existente') {
        leadId = destino.leadId;
      }

      await vincularCotizacionActiva(api, cotizacion.id, leadId);
      alert('✅ Cotización vinculada al prospecto.');
      cargarLeads();
      cargarHistorial();
    } catch (error) {
      alert(`❌ ${error.response?.data?.error || error.message}`);
    }
  };

  const resolverModalDestino = (destino) => {
    const ctx = modalDestino;
    setModalDestino(null);
    if (!ctx) return;
    if (ctx.modo === 'guardar') {
      ejecutarGuardadoConDestino(destino);
    } else {
      ejecutarGestionHistorial(ctx.cotizacion, destino);
    }
  };

  const solicitarDestinoHistorial = (cotizacion, pasoInicial) => {
    setMenuHistorialId(null);
    if (cotizacionEspecialBloqueaAccionesHistorial(cotizacion)) {
      if (cotizacion.lead_id) {
        alert('Esta cotización especial ya está vinculada de forma permanente a un prospecto.');
        return;
      }
      setConfirmacionVinculoEspecial({ cotizacion, pasoInicial });
      return;
    }
    setConfirmacionHistorialDestino({ cotizacion, pasoInicial });
  };

  const confirmarVinculoEspecialPermanente = () => {
    const ctx = confirmacionVinculoEspecial;
    if (!ctx) return;
    setConfirmacionVinculoEspecial(null);
    setConfirmacionHistorialDestino({ cotizacion: ctx.cotizacion, pasoInicial: ctx.pasoInicial });
  };

  const confirmarDestinoHistorial = () => {
    const ctx = confirmacionHistorialDestino;
    if (!ctx) return;
    setConfirmacionHistorialDestino(null);
    setModalDestino({
      modo: 'historial',
      cotizacion: ctx.cotizacion,
      nombreInicial: ctx.cotizacion.lead_nombre || '',
      pasoInicial: ctx.pasoInicial,
    });
  };

  useEffect(() => {
    const { errores: err, res: calculo } = calcularErroresYResultados(formData, modoCotizacionEspecial);
    setErrores(err);
    setRes(calculo);
  }, [formData, modoCotizacionEspecial]);

  const handleGuardarCotizacion = () => {
    if (!puedeGuardar || guardando) return;
    setModalDestino({ modo: 'guardar' });
  };

  const solicitarPdfVivo = () => {
    if (!puedeGenerarPdf || generandoPdf) return;
    if (modoCotizacionEspecial) {
      alert('El PDF no está disponible en cotización especial hasta que sea autorizada.');
      return;
    }
    setAvisoPdfVivoAbierto(true);
  };

  const ejecutarPdfVivo = async () => {
    setAvisoPdfVivoAbierto(false);
    setGenerandoPdf(true);
    try {
      await descargarPdfPreview(formData);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert(error.message || 'No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleGenerarPdfDetalle = async () => {
    if (!detalleCotizacion || generandoPdfDetalle) return;
    if (cotizacionPendienteAutorizacion(detalleCotizacion)) {
      alert('El PDF no está disponible hasta autorizar la cotización especial.');
      return;
    }
    setGenerandoPdfDetalle(true);
    try {
      await generarPdfDesdeCotizacion(detalleCotizacion, detalleCotizacion.lead_nombre);
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert(error.message || 'No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setGenerandoPdfDetalle(false);
    }
  };

  const formatoMoneda = (monto) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);
  
  const ToggleBtn = ({ flag, onClick, label }) => (
    <button 
      type="button" 
      onClick={onClick} 
      // El toggle ahora usa el color primary
      className={`px-3 py-2 text-xs font-bold rounded-md transition-all ${flag ? 'bg-primary text-white shadow-sm' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
    >
      {label}
    </button>
  );

  if (cargando) return <div className="p-10 text-center font-medium text-slate-500">Cargando cotizador...</div>;
  if (!empresaId) return <div className="p-10 text-center text-slate-500 bg-slate-50 rounded-2xl m-8"><h2 className="text-xl font-bold">Vista Global</h2><p>Inicia sesión como Agente o Admin para cotizar.</p></div>;

  return (
    <div className="font-sans max-w-7xl mx-auto pb-20">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-primary tracking-tight">Cotizador de Arrendamiento</h1>
          <p className="text-slate-500 mt-1">Simulación y guardado de cotizaciones.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {puedeUsarModoEspecial(usuarioLogueado) && (
            <button
              type="button"
              onClick={toggleModoCotizacionEspecial}
              className={`px-4 py-2 font-bold rounded-xl border-2 transition-colors ${
                modoCotizacionEspecial
                  ? 'bg-[#ea5533]/80 border-[#ea5533] text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {modoCotizacionEspecial ? '✓ Cotización especial' : 'Cotización especial'}
            </button>
          )}
          <button
            type="button"
            onClick={limpiarFormulario}
            className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
          >
            Limpiar Campos
          </button>
        </div>
      </header>

      {modoCotizacionEspecial && (
        <div className="mb-6 p-4 bg-[#ea5533]/80 text-white rounded-xl border-2 border-[#ea5533] text-sm font-medium shadow-sm">
          Modo cotización especial activo: los límites de parámetros no aplican. Al guardar como agente se solicitará autorización.
        </div>
      )}

      {folioOrigenReplicacion != null && (
        <div className="mb-6 p-4 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-sm font-medium shadow-sm">
          Parámetros copiados de FL-{String(folioOrigenReplicacion).padStart(3, '0')}. Al guardar se asignará un folio nuevo; la cotización original no se modifica.
        </div>
      )}

      {errores.general && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 font-bold text-sm shadow-sm">
          {errores.general}
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${modoCotizacionEspecial ? 'p-1 rounded-[1.75rem] ' + claseMarcoCotizacionEspecial() : ''}`}>
        
        {/* EL FORMULARIO EXPANDIDO */}
        <div className={`lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-200 ${modoCotizacionEspecial ? 'ring-2 ring-[#ea5533]/80' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Copiar datos de lead existente (opcional)
              </label>
              <select 
                value={referenciaNombreClave} 
                onChange={handleLeadChange} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              >
                <option value="">-- Escribir nombre manualmente --</option>
                {leadsNombreUnico.map((l) => {
                  const clave = claveNombreLead(l.nombre);
                  return (
                    <option key={clave} value={clave}>{l.nombre}</option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                No vincula al guardar. Al pulsar Guardar DB elegirás nuevo lead, existente o solo cotización.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Nombre del Cliente
              </label>
              <input 
                type="text" 
                value={formData.nombre_cliente} 
                onChange={e => setFormData({...formData, nombre_cliente: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                placeholder="Obligatorio para guardar" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Tipo de persona
              </label>
              <select
                value={formData.tipo_persona}
                onChange={e => setFormData({ ...formData, tipo_persona: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              >
                {OPCIONES_TIPO_PERSONA.map((op) => (
                  <option key={op.value || 'vacio'} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Tipo de Arrendamiento
              </label>
              <select 
                value={formData.tipoArrendamiento} 
                onChange={(e) => {
                  const tipoArrendamiento = e.target.value;
                  if (tipoArrendamiento === 'Automotriz') {
                    setFormData((prev) => ({
                      ...prev,
                      tipoArrendamiento,
                      nombreActivo: '',
                    }));
                  } else {
                    setFormData((prev) => ({
                      ...prev,
                      tipoArrendamiento,
                      marca: '',
                      modelo: '',
                      version: '',
                      anio: '',
                      tipoVehiculo: 'Sedan',
                      ...limpiarCamposSoloAutomotriz(),
                    }));
                  }
                }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              >
                <option value="Automotriz">Automotriz</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            {formData.tipoArrendamiento === 'Automotriz' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Tipo de Vehículo
                  </label>
                  <select 
                    value={formData.tipoVehiculo} 
                    onChange={e => setFormData({...formData, tipoVehiculo: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  >
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Camionetas">Camionetas</option>
                    <option value="Lujo">Lujo</option>
                    <option value="Tractocamion">Tractocamion</option>
                    <option value="Autobus">Autobus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Marca *
                  </label>
                  <input 
                    type="text" 
                    value={formData.marca} 
                    onChange={e => setFormData({...formData, marca: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                    placeholder="Ej. Nissan"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Modelo *
                  </label>
                  <input 
                    type="text"
                    value={formData.modelo} 
                    onChange={e => setFormData({...formData, modelo: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                    placeholder="Ej. Versa"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Versión *
                  </label>
                  <input 
                    type="text"
                    value={formData.version} 
                    onChange={e => setFormData({...formData, version: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                    placeholder="Ej. Sense"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Año *
                  </label>
                  <input 
                    type="text"
                    value={formData.anio} 
                    onChange={e => setFormData({...formData, anio: e.target.value})} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                    placeholder="Ej. 2024"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Nombre del activo *
                </label>
                <input 
                  type="text"
                  value={formData.nombreActivo} 
                  onChange={e => setFormData({...formData, nombreActivo: e.target.value})} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                  placeholder="Ej. Maquinaria Industrial Modelo X"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-primary uppercase mb-2">
                Valor del Activo
              </label>
              <input 
                type="text" 
                inputMode="decimal"
                value={formData.valorActivo} 
                onChange={e => setFormData({...formData, valorActivo: formatMontoFormulario(e.target.value)})} 
                className="w-full bg-primary/5 border border-primary/20 text-slate-800 font-bold rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                placeholder="Ej. 350,000" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Plazo (meses)
              </label>
              <input 
                type="number" 
                min="12" 
                max="72" 
                value={formData.plazo} 
                onChange={e => setFormData({...formData, plazo: e.target.value})} 
                className={`w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all ${errores.plazo ? 'border-red-500' : 'border-slate-200'}`} 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Tasa anual (%)
              </label>
              <input 
                type="number" 
                value={formData.tasaAnual} 
                onChange={e => setFormData({...formData, tasaAnual: e.target.value})} 
                className={`w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all ${errores.tasa ? 'border-red-500' : 'border-slate-200'}`} 
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Pago Inicial
              </label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={formData.pagoInicial} 
                  onChange={e => setFormData({...formData, pagoInicial: e.target.value})} 
                  className={`flex-1 border bg-white rounded-xl px-4 py-2 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all ${errores.pagoInicial ? 'border-red-500' : 'border-slate-200'}`} 
                />
                <ToggleBtn flag={formData.isPagoInicialPct} onClick={() => setFormData({...formData, isPagoInicialPct: true})} label="%" />
                <ToggleBtn flag={!formData.isPagoInicialPct} onClick={() => setFormData({...formData, isPagoInicialPct: false})} label="$" />
              </div>
              {errores.pagoInicial && <p className="text-red-500 text-xs mt-1">{errores.pagoInicial}</p>}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Valor Residual
              </label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={formData.residual} 
                  onChange={e => setFormData({...formData, residual: e.target.value})} 
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                />
                <ToggleBtn flag={formData.isResidualPct} onClick={() => setFormData({...formData, isResidualPct: true})} label="%" />
                <ToggleBtn flag={!formData.isResidualPct} onClick={() => setFormData({...formData, isResidualPct: false})} label="$" />
              </div>
              {errores.residual && <p className="text-red-500 text-xs mt-1">{errores.residual}</p>}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Comisión Apertura
              </label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={formData.comision} 
                  onChange={e => setFormData({...formData, comision: e.target.value})} 
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                />
                <ToggleBtn flag={formData.isComisionPct} onClick={() => setFormData({...formData, isComisionPct: true})} label="%" />
                <ToggleBtn flag={!formData.isComisionPct} onClick={() => setFormData({...formData, isComisionPct: false})} label="$" />
              </div>
            </div>

            {/* --- NUEVO CAMPO: RENTAS EN DEPÓSITO --- */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Rentas en Depósito (Garantía)
              </label>
              
              <div className="flex items-center mb-2">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.isRentasDeposito}
                    onChange={e => setFormData({ ...formData, isRentasDeposito: e.target.checked, rentasDepositoCantidad: e.target.checked ? formData.rentasDepositoCantidad : '' })}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                  ¿Solicitar rentas en depósito al inicio?
                </label>
              </div>

              {formData.isRentasDeposito && (
                <div className="flex gap-2 mt-3 animate-fade-in">
                  <input
                    type="number"
                    min="1"
                    placeholder="Cantidad de rentas (ej. 1, 2)"
                    value={formData.rentasDepositoCantidad}
                    onChange={e => setFormData({ ...formData, rentasDepositoCantidad: e.target.value })}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  <div className="flex items-center px-3 bg-slate-200 text-slate-600 rounded-xl text-sm font-bold">
                    Meses
                  </div>
                </div>
              )}
            </div>
            {/* -------------------------------------- */}

            <div className={`p-4 rounded-xl border ${formData.tipoArrendamiento === 'Automotriz' ? 'bg-slate-50 border-slate-100' : 'bg-slate-100/80 border-slate-200'}`}>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Trámites e impuestos
                {formData.tipoArrendamiento !== 'Automotriz' && (
                  <span className="ml-2 font-normal normal-case text-slate-400">(solo Automotriz)</span>
                )}
              </label>
              <input 
                type="text"
                inputMode="decimal"
                value={formData.tipoArrendamiento === 'Automotriz' ? formData.servicios : ''} 
                onChange={e => setFormData({...formData, servicios: formatMontoFormulario(e.target.value)})} 
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none disabled:bg-slate-100 disabled:text-slate-400 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                disabled={formData.tipoArrendamiento !== 'Automotriz'} 
                placeholder={formData.tipoArrendamiento !== 'Automotriz' ? 'No aplica' : ''}
              />
            </div>

            {/* Recuadro de Seguro y GPS con color tenue del primario */}
            <div className="md:col-span-2 bg-primary/5 p-4 rounded-xl border border-primary/20 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Seguro
                </label>
                <input 
                  type="text"
                  inputMode="decimal"
                  value={formData.seguro} 
                  onChange={e => setFormData({...formData, seguro: formatMontoFormulario(e.target.value)})} 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 outline-none mb-2 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" 
                />
                <div className="flex gap-2 mb-2">
                  <ToggleBtn flag={formData.isSeguroContado} onClick={() => setFormData({...formData, isSeguroContado: true})} label="Contado" />
                  <ToggleBtn flag={!formData.isSeguroContado} onClick={() => setFormData({...formData, isSeguroContado: false})} label="Financiado" />
                </div>
                <div className="flex gap-2">
                  <ToggleBtn flag={formData.isSeguroAnual} onClick={() => setFormData({...formData, isSeguroAnual: true})} label="Anual" />
                  <ToggleBtn flag={!formData.isSeguroAnual} onClick={() => setFormData({...formData, isSeguroAnual: false})} label="Multianual" />
                </div>
              </div>
              
              <div className={formData.tipoArrendamiento !== 'Automotriz' ? 'opacity-60' : ''}>
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase">
                    GPS
                    {formData.tipoArrendamiento !== 'Automotriz' && (
                      <span className="ml-2 font-normal normal-case text-slate-400">(solo Automotriz)</span>
                    )}
                  </label>
                  {puedeAdministrarGps && formData.tipoArrendamiento === 'Automotriz' && (
                    <button
                      type="button"
                      onClick={() => setPanelGpsAbierto(true)}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                      title="Administrar catálogo GPS"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
                <div className="flex mb-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.tipoArrendamiento === 'Automotriz' ? formData.gps : ''}
                    onChange={(e) => setFormData({ ...formData, gps: formatMontoFormulario(e.target.value) })}
                    className={`flex-1 bg-white min-w-0 border border-slate-200 px-4 py-2 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all disabled:bg-slate-100 disabled:text-slate-400 ${
                      muestraCatalogoGps ? 'rounded-l-xl rounded-r-none' : 'rounded-xl'
                    }`}
                    disabled={formData.tipoArrendamiento !== 'Automotriz'}
                    placeholder={formData.tipoArrendamiento !== 'Automotriz' ? 'No aplica' : ''}
                  />
                  {muestraCatalogoGps && (
                    <SelectorGpsPrecio
                      catalogo={gpsCatalogo}
                      disabled={formData.tipoArrendamiento !== 'Automotriz'}
                      onSeleccionarPrecio={(precio) =>
                        setFormData({ ...formData, gps: formatMontoFormulario(String(precio)) })
                      }
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <ToggleBtn
                    flag={formData.isGpsContado}
                    onClick={() => formData.tipoArrendamiento === 'Automotriz' && setFormData({...formData, isGpsContado: true})}
                    label="Contado"
                  />
                  <ToggleBtn
                    flag={!formData.isGpsContado}
                    onClick={() => formData.tipoArrendamiento === 'Automotriz' && setFormData({...formData, isGpsContado: false})}
                    label="Financiado"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* LOS RESULTADOS */}
        <div className="space-y-6">
          <div className="bg-[#1e1e1e] rounded-3xl p-6 shadow-xl text-white border border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">
              Desembolso Inicial
            </h2>
            <div className="space-y-3 mb-6 border-b border-slate-700 pb-4">
              <div className="flex justify-between text-sm"><span>Renta Extr:</span><span>{formatoMoneda(res.pagoInicialSub)}</span></div>
              <div className="flex justify-between text-sm text-slate-300"><span>Comisión:</span><span>{formatoMoneda(res.comisionSub)}</span></div>
              <div className="flex justify-between text-sm"><span>GPS:</span><span>{formatoMoneda(res.gpsSub)}</span></div>
              <div className="flex justify-between text-sm text-slate-300"><span>Seguro:</span><span>{formatoMoneda(res.seguroSub)}</span></div>
              <div className="flex justify-between text-sm"><span>Trámites:</span><span>{formatoMoneda(res.serviciosSub)}</span></div>
              
              {formData.isRentasDeposito && (
                <div className="flex justify-between text-sm text-slate-300">
                  <span>Rentas dep. ({formData.rentasDepositoCantidad}):</span>
                  <span>{formatoMoneda(res.rentasDepositoSubtotal || 0)}</span>
                </div>
              )}
              
              <div className="flex justify-between font-bold pt-2 border-t border-slate-700"><span>Subtotal:</span><span>{formatoMoneda(res.pagoInicialSubtotal)}</span></div>
              <div className="flex justify-between text-sm text-slate-400"><span>IVA:</span><span>{formatoMoneda(res.pagoInicialIVA)}</span></div>
            </div>
            <div className="bg-[#ea5533] p-4 rounded-xl flex justify-between items-center shadow-lg shadow-[#ea5533]/20">
              <span className="font-bold">Total Inicial:</span>
              <span className="font-black text-xl">{formatoMoneda(res.pagoInicialTotal)}</span>
            </div>
          </div>

          <div className="bg-black rounded-3xl p-6 shadow-xl text-white border border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">
              Renta Mensual
            </h2>
            <div className="space-y-3 mb-6 border-b border-slate-800 pb-4">
              <div className="flex justify-between text-sm"><span>Renta Activo:</span><span>{formatoMoneda(res.rentaSoloActivo / 1.16)}</span></div>
              <div className="flex justify-between text-sm text-slate-400"><span>GPS Fin:</span><span>{formatoMoneda(res.gpsFinMensual / 1.16)}</span></div>
              <div className="flex justify-between text-sm"><span>Seguro Fin:</span><span>{formatoMoneda(res.seguroFinMensual / 1.16)}</span></div>
              <div className="flex justify-between font-bold pt-2 border-t border-slate-800"><span>Subtotal:</span><span>{formatoMoneda(res.rentaMensualSubtotal)}</span></div>
              <div className="flex justify-between text-sm text-slate-400"><span>IVA:</span><span>{formatoMoneda(res.rentaMensualIVA)}</span></div>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-800">
              <span className="font-bold">Renta Mensual:</span>
              <span className="font-black text-2xl" style={{ color: 'var(--empresa-color)' }}>{formatoMoneda(res.rentaMensualTotal)}</span>
            </div>
          </div>

          <div className="bg-black rounded-3xl p-6 shadow-xl text-white border border-slate-800">
            <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">
              Valor Residual
            </h2>
            <div className="bg-slate-900 p-4 rounded-xl flex justify-center items-center border border-slate-800">
              <span className="font-black text-2xl text-white tabular-nums">
                {formatoMoneda(res.residualReal)}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={handleGuardarCotizacion} 
              disabled={guardando || !puedeGuardar}
              className={`flex-1 py-4 rounded-xl font-black transition-all ${guardando || !puedeGuardar ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-primary hover:brightness-95 text-white shadow-sm'}`}
            >
              {guardando ? 'Guardando...' : '💾 Guardar DB'}
            </button>
            <button 
              onClick={solicitarPdfVivo}
              disabled={!puedeGenerarPdf || generandoPdf}
              className={`flex-1 py-4 rounded-xl font-black transition-all ${!puedeGenerarPdf || generandoPdf ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#ea5533] hover:brightness-95 text-white shadow-sm'}`}
              title={modoCotizacionEspecial ? 'PDF no disponible en cotización especial hasta autorizar' : undefined}
            >
              {generandoPdf ? 'Generando PDF…' : '📄 Generar PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* HISTORIAL DE COTIZACIONES CON DISEÑO MINIMALISTA (TABLA)*/}
      {/* ========================================================= */}
      <div className="mt-12 bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">
          Historial de Cotizaciones Guardadas
        </h2>
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            value={busquedaHistorial}
            onChange={(e) => setBusquedaHistorial(e.target.value)}
            placeholder="Buscar por prospecto o folio (ej. FL-042, 42)…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 focus:bg-white focus:border-primary/50 focus:ring-2 focus:ring-primary/10 outline-none transition-all font-medium text-slate-700 shadow-inner"
            aria-label="Buscar en historial de cotizaciones"
          />
        </div>
        
        {/* Tabla Responsiva */}
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full min-w-max text-left border-separate border-spacing-0">
            <thead className="bg-slate-50/80 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
              <tr>
                <th className="p-4 rounded-tl-xl whitespace-nowrap">Folio</th>
                <th className="p-4 whitespace-nowrap">Fecha</th>
                <th className="p-4 whitespace-nowrap">Prospecto</th>
                {usuarioLogueado.rol !== 'agente' && (
                  <th className="p-4 whitespace-nowrap">Agente Creador</th>
                )}
                <th className="p-4 whitespace-nowrap">Vehículo / Activo</th>
                <th className="p-4 whitespace-nowrap">Valor</th>
                <th className="p-4 whitespace-nowrap">Renta Mensual</th>
                <th className="p-4 rounded-tr-xl whitespace-nowrap text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {historialFiltrado.map(cot => (
                <tr
                  key={cot.id}
                  className={`transition-colors group hover:bg-slate-50/80 ${
                    esCotizacionEspecial(cot) ? claseFilaHistorialEspecial() : ''
                  }`}
                >
                  <td className="p-4 text-xs font-mono font-bold text-slate-800 whitespace-nowrap">
                    {cot.folio ? (
                      <span className="text-primary bg-primary/5 border border-primary/10 px-2 py-1.5 rounded-md shadow-sm">
                        FL-{String(cot.folio).padStart(3, '0')}
                      </span>
                    ) : '---'}
                  </td>

                  <td className="p-4 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(cot.fecha_creacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>

                  <td className="p-4 min-w-[180px] whitespace-nowrap">
                    {cot.lead_nombre ? (
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-primary shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                        <span className="truncate max-w-[200px]" title={cot.lead_nombre}>{cot.lead_nombre}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Sin prospecto</span>
                    )}
                  </td>

                  {usuarioLogueado.rol !== 'agente' && (
                    <td className="p-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold border border-primary/20 shrink-0">
                          {(cot.agente_nombre || 'U')[0].toUpperCase()}
                        </div>
                        {cot.agente_nombre || 'Desconocido'}
                      </div>
                    </td>
                  )}

                  <td className="p-4 min-w-[180px] max-w-[250px] whitespace-nowrap overflow-hidden text-ellipsis" title={cot.nombre_activo}>
                    <div className="text-xs font-bold text-slate-800 truncate">{cot.nombre_activo || '-'}</div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{cot.tipo_activo}</div>
                  </td>

                  <td className="p-4 text-sm font-bold text-primary whitespace-nowrap">
                    {formatoMoneda(cot.valor_activo)}
                  </td>

                  <td className="p-4 text-sm font-black text-slate-800 whitespace-nowrap">
                    {formatoMoneda(cot.renta_mensual_con_iva)}
                  </td>

                  <td className="p-4 text-center whitespace-nowrap">
                    {cotizacionPendienteAutorizacion(cot) && puedeAutorizarEspecial(usuarioLogueado) && (
                      <div className="flex flex-wrap gap-1 mb-2 justify-center">
                        <button
                          type="button"
                          disabled={procesandoAutorizacion}
                          onClick={() => ejecutarAutorizacionEspecial(cot.id, false)}
                          className="px-2 py-1 text-xs font-bold rounded-md bg-green-600 text-white hover:bg-green-500 shadow-sm"
                        >
                          Aceptar
                        </button>
                        <button
                          type="button"
                          disabled={procesandoAutorizacion}
                          onClick={() => ejecutarAutorizacionEspecial(cot.id, true)}
                          className="px-2 py-1 text-xs font-bold rounded-md bg-red-600 text-white hover:bg-red-500 shadow-sm"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                    {cotizacionPendienteAutorizacion(cot) && !puedeAutorizarEspecial(usuarioLogueado) && (
                      <span className="block text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md mb-1 uppercase tracking-wider mx-auto w-max">Pendiente auth</span>
                    )}
                    
                    <div className="relative inline-block" data-menu-historial-cot>
                      <button
                        ref={menuHistorialId === cot.id ? menuHistorialTriggerRef : undefined}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuHistorialId(menuHistorialId === cot.id ? null : cot.id);
                        }}
                        className="p-1.5 rounded-md text-slate-400 hover:bg-primary/10 hover:text-primary transition-colors"
                        aria-label="Acciones de cotización"
                        aria-expanded={menuHistorialId === cot.id}
                      >
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {historial.length === 0 && (
                <tr>
                  <td colSpan={usuarioLogueado.rol !== 'agente' ? "8" : "7"} className="p-12 text-center text-slate-400 font-medium bg-slate-50/50">
                    Aún no hay cotizaciones guardadas en el sistema.
                  </td>
                </tr>
              )}
              {historial.length > 0 && historialFiltrado.length === 0 && (
                <tr>
                  <td colSpan={usuarioLogueado.rol !== 'agente' ? "8" : "7"} className="p-12 text-center text-slate-400 font-medium bg-slate-50/50">
                    No hay cotizaciones que coincidan con tu búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- Modales Inalterados --- */}
      {cotizacionMenuHistorialAbierta && menuHistorialPanelStyle && createPortal(
        <div
          ref={menuHistorialPanelRef}
          style={menuHistorialPanelStyle}
          className="bg-white rounded-xl shadow-xl border border-slate-100 py-1"
          data-menu-historial-cot-panel
        >
          <button
            type="button"
            onClick={() => {
              setMenuHistorialId(null);
              setDetalleCotizacion(cotizacionMenuHistorialAbierta);
            }}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors"
          >
            Detalles
          </button>
          {!cotizacionEspecialBloqueaAccionesHistorial(cotizacionMenuHistorialAbierta) && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenuHistorialId(null);
                  aplicarReplicacion(cotizacionMenuHistorialAbierta);
                }}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors"
              >
                Replicar cotización
              </button>
              <button
                type="button"
                onClick={() => solicitarDestinoHistorial(cotizacionMenuHistorialAbierta, 'elegir')}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors"
              >
                Nuevo lead
              </button>
              <button
                type="button"
                onClick={() => solicitarDestinoHistorial(cotizacionMenuHistorialAbierta, 'existente')}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors"
              >
                Vincular a lead existente
              </button>
            </>
          )}
          {esCotizacionEspecial(cotizacionMenuHistorialAbierta) && (
            <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border-t border-amber-100">
              Cotización especial: no se puede replicar ni reasignar.
            </p>
          )}
        </div>,
        document.body,
      )}

      <ModalDetalleCotizacion
        abierto={Boolean(detalleCotizacion)}
        onCerrar={() => setDetalleCotizacion(null)}
        cotizacionInicial={detalleCotizacion}
        cotizacionId={detalleCotizacion?.id}
        prospectoNombre={detalleCotizacion?.lead_nombre}
        agenteNombre={detalleCotizacion?.agente_nombre}
        onGenerarPdf={handleGenerarPdfDetalle}
        generandoPdf={generandoPdfDetalle}
      />

      {avisoPdfVivoAbierto && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="aviso-pdf-vivo-titulo"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
            <h2
              id="aviso-pdf-vivo-titulo"
              className="text-slate-900 font-bold text-lg mb-3"
            >
              PDF sin folio
            </h2>
            <p className="text-slate-700 text-sm leading-relaxed">
              Se generará un PDF <strong>sin folio</strong> y <strong>no se guardará</strong> en el historial.
              Si deseas conservar la cotización con folio oficial, guarda primero desde el cotizador.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setAvisoPdfVivoAbierto(false)}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarPdfVivo}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-bold bg-[#ea5533] hover:opacity-90 text-white transition-colors shadow-sm"
              >
                Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacionVinculoEspecial && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border-2 border-amber-500">
            <h2 className="text-slate-900 font-bold text-lg mb-3">Vinculación permanente</h2>
            <p className="text-slate-700 text-sm leading-relaxed">
              La cotización especial{' '}
              <strong className="text-primary">{folioHistorialTexto(confirmacionVinculoEspecial.cotizacion.folio)}</strong>{' '}
              quedará asignada de forma permanente al prospecto que elijas. No podrá vincularse a otro lead después.
              ¿Desea continuar?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmacionVinculoEspecial(null)}
                className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarVinculoEspecialPermanente}
                className="flex-1 px-4 py-3 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 shadow-sm transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacionHistorialDestino && (
        <div
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="aviso-historial-destino-titulo"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
            <h2
              id="aviso-historial-destino-titulo"
              className="text-slate-900 font-bold text-lg mb-3"
            >
              Cambiar prospecto de la cotización
            </h2>
            <p className="text-slate-700 text-sm leading-relaxed">
              {String(confirmacionHistorialDestino.cotizacion.lead_nombre || '').trim() ? (
                <>
                  La cotización{' '}
                  <strong className="text-primary">
                    {folioHistorialTexto(confirmacionHistorialDestino.cotizacion.folio)}
                  </strong>{' '}
                  se desvinculará del prospecto actual{' '}
                  <span className="font-semibold text-primary">
                    {confirmacionHistorialDestino.cotizacion.lead_nombre}
                  </span>{' '}
                  y se asignará{' '}
                  {confirmacionHistorialDestino.pasoInicial === 'elegir'
                    ? 'al nuevo prospecto que crees'
                    : 'al prospecto existente que selecciones'}
                  .
                </>
              ) : (
                <>
                  La cotización{' '}
                  <strong className="text-primary">
                    {folioHistorialTexto(confirmacionHistorialDestino.cotizacion.folio)}
                  </strong>{' '}
                  se asignará{' '}
                  {confirmacionHistorialDestino.pasoInicial === 'elegir'
                    ? 'al nuevo prospecto que crees'
                    : 'al prospecto existente que selecciones'}
                  . Si tenía otra vinculación previa, dejará de estar activa en ese prospecto.
                </>
              )}
              {' '}Solo puede haber un folio activo por lead. ¿Desea continuar?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmacionHistorialDestino(null)}
                className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarDestinoHistorial}
                className="flex-1 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:brightness-95 shadow-sm transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalDestinoProspecto
        abierto={Boolean(modalDestino)}
        titulo={modalDestino?.modo === 'historial' ? 'Vincular cotización a prospecto' : '¿Cómo guardar la cotización?'}
        subtitulo={
          modalDestino?.modo === 'historial'
            ? `Folio FL-${String(modalDestino?.cotizacion?.folio || 0).padStart(3, '0')}. Solo un folio activo por lead; los demás se liberan.`
            : `Cliente: ${formData.nombre_cliente}. Elige si creas un lead nuevo, vinculas a uno existente o solo guardas el folio.`
        }
        modo={modalDestino?.modo === 'historial' ? 'historial' : 'guardar'}
        nombreCliente={formData.nombre_cliente}
        nombreInicial={modalDestino?.nombreInicial || ''}
        pedirNombre={modalDestino?.modo === 'historial'}
        pasoInicial={modalDestino?.pasoInicial || 'elegir'}
        leads={leads}
        onCerrar={() => setModalDestino(null)}
        onConfirmar={resolverModalDestino}
      />

      {puedeAdministrarGps && (
        <AdminGpsCatalogoPanel
          abierto={panelGpsAbierto}
          onCerrar={() => setPanelGpsAbierto(false)}
          empresaId={empresaId}
          catalogo={gpsCatalogo}
          onCatalogoActualizado={setGpsCatalogo}
        />
      )}

    </div>
  );
};

export default CotizadorView;