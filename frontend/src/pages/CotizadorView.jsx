import { useState, useEffect } from 'react';
import api from '../api';
import html2pdf from 'html2pdf.js';
import { OPCIONES_TIPO_PERSONA } from '../constants/tipoPersona';

/** A4 @ 96dpi — dimensiones fijas para PDF consistente entre navegadores */
const PDF_ANCHO_PX = 794;
const PDF_ALTO_A4_PX = 1122;
const PDF_ESCALA_CANVAS = 2;

/** Automotriz: marca - modelo - version - año */
const armarNombreActivoAutomotriz = ({ marca, modelo, version, anio }) =>
  [marca, modelo, version, anio]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' - ');

const camposActivoCompletos = (data) => {
  if (data.tipoArrendamiento === 'Automotriz') {
    return ['marca', 'modelo', 'version', 'anio'].every((k) => String(data[k] || '').trim() !== '');
  }
  return String(data.nombreActivo || '').trim() !== '';
};

const cotizacionListaParaAccion = (data, erroresCalculo) => {
  if (Object.keys(erroresCalculo).length > 0) return false;
  if (!String(data.nombre_cliente || '').trim()) return false;
  const valor = parseFloat(String(data.valorActivo || '').replace(/,/g, ''));
  if (!valor || valor <= 0) return false;
  return camposActivoCompletos(data);
};

const esperarRecursosPdf = (elemento) => {
  const promesas = [];
  if (document.fonts?.ready) promesas.push(document.fonts.ready);
  elemento.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    promesas.push(
      new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      })
    );
  });
  return Promise.all(promesas);
};

const montarContenedorPdf = (htmlContent) => {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${PDF_ANCHO_PX}px`,
    'overflow:hidden',
    'background:#fff',
    'z-index:-1',
  ].join(';');

  const host = document.createElement('div');
  host.innerHTML = htmlContent;
  wrapper.appendChild(host);
  document.body.appendChild(wrapper);

  const root = host.firstElementChild;
  return { wrapper, root };
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

// NUEVO: Función para formatear el número con comas mientras escribes
const formatMontoFormulario = (val) => {
  if (!val) return '';
  // Quitamos todo lo que no sea número o punto
  let rawValue = val.toString().replace(/[^0-9.]/g, '');
  // Evitamos que pongan más de un punto
  const parts = rawValue.split('.');
  if (parts.length > 2) rawValue = parts[0] + '.' + parts.slice(1).join('');
  // Separamos enteros de decimales y ponemos comas
  const [enteros, decimales] = rawValue.split('.');
  const enterosFormateados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimales !== undefined ? `${enterosFormateados}.${decimales}` : enterosFormateados;
};

const CotizadorView = () => {
  const [leads, setLeads] = useState([]);
  const [historial, setHistorial] = useState([]); 
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id;

  const [formData, setFormData] = useState({
    lead_id: '', 
    nombre_cliente: '',
    tipo_persona: '',
    tipoArrendamiento: 'Automotriz', 
    tipoVehiculo: 'Sedan',
    nombreActivo: '', 
    marca: '', 
    modelo: '',
    version: '',
    anio: '', 
    valorActivo: '', 
    plazo: '36', 
    tasaAnual: '18',
    pagoInicial: '', 
    isPagoInicialPct: true, 
    residual: '', 
    isResidualPct: true,
    comision: '', 
    isComisionPct: true, 
    seguro: '', 
    isSeguroContado: true, 
    isSeguroAnual: true,
    gps: '', 
    isGpsContado: true, 
    servicios: ''
  });

  const [res, setRes] = useState({});
  const [errores, setErrores] = useState({});

  const puedeGuardarOPdf = cotizacionListaParaAccion(formData, errores);

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

  const handleLeadChange = (e) => {
    const id = e.target.value;
    const leadSel = leads.find(l => l.id === id);
    setFormData(prev => ({ 
      ...prev, 
      lead_id: id, 
      nombre_cliente: leadSel ? leadSel.nombre : '',
      tipo_persona: leadSel ? (leadSel.tipo_persona || '') : '',
    }));
  };

  const sincronizarTipoPersonaLead = async (leadId) => {
    const leadRef = leads.find(l => l.id === leadId);
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

  useEffect(() => {
    let err = {};
    // MODIFICADO: Removemos las comas antes de convertir a número para el cálculo
    const valorActivo = parseFloat(String(formData.valorActivo).replace(/,/g, '')) || 0;
    const plazo = parseInt(formData.plazo) || 36;
    const tasaAnual = parseFloat(formData.tasaAnual) || 0;

    if (tasaAnual < 16 || tasaAnual > 40) err.tasa = "La tasa debe estar entre 16% y 40%.";
    if (plazo < 12 || plazo > 72) err.plazo = "El plazo debe ser entre 12 y 72 meses.";

    const piInput = parseFloat(String(formData.pagoInicial).replace(/,/g, '')) || 0;
    const inicialReal = formData.isPagoInicialPct ? valorActivo * (piInput / 100) : piInput;
    if (inicialReal > valorActivo * 0.5) err.pagoInicial = "El pago inicial no puede exceder el 50% del valor.";

    const resInput = parseFloat(String(formData.residual).replace(/,/g, '')) || 0;
    const residualReal = formData.isResidualPct ? valorActivo * (resInput / 100) : resInput;
    
    let maxResidualPermitido = 0;
    if (formData.tipoArrendamiento === "Automotriz") {
      const rango = tablaResidual.find(r => plazo >= r.min && plazo <= r.max);
      maxResidualPermitido = valorActivo * ((rango ? (rango.valores[formData.tipoVehiculo] || 20) : 20) / 100);
    } else {
      const rango = tablaResidualOtro.find(r => plazo >= r.min && plazo <= r.max);
      maxResidualPermitido = valorActivo * ((rango ? rango.valores : 20) / 100);
    }

    if (residualReal > maxResidualPermitido && valorActivo > 0) err.residual = "Excede el tope permitido.";
    if ((residualReal + inicialReal) > valorActivo && valorActivo > 0) err.general = "Suma inicial + residual excede 100%.";

    const comInput = parseFloat(String(formData.comision).replace(/,/g, '')) || 0;
    const comisionReal = formData.isComisionPct ? comInput * (valorActivo - inicialReal) / 100 : comInput;

    const gpsInput = parseFloat(String(formData.gps).replace(/,/g, '')) || 0;
    const gpsContado = formData.isGpsContado ? gpsInput : 0;
    const serviciosReal = parseFloat(String(formData.servicios).replace(/,/g, '')) || 0;

    const seguroInput = parseFloat(String(formData.seguro).replace(/,/g, '')) || 0;
    let seguroContado = formData.isSeguroContado ? seguroInput : 0;
    let seguroFinanciadoBase = !formData.isSeguroContado ? seguroInput : 0;

    const seguroSub = seguroContado / 1.16;
    const gpsSub = gpsContado / 1.16;
    const serviciosSub = serviciosReal / 1.16;
    const pagoInicialSub = inicialReal / 1.16;
    const comisionSub = comisionReal / 1.16;

    const seguroFinMensual = !formData.isSeguroContado ? calcularPMT(tasaAnual, (formData.isSeguroAnual ? 12 : plazo), seguroFinanciadoBase, 0) : 0;
    const gpsFinMensual = !formData.isGpsContado ? calcularPMT(tasaAnual, plazo, gpsInput, 0) : 0;

    const pvActivo = valorActivo - inicialReal;
    const r = (tasaAnual * 1.16) / 12 / 100;
    const factor = Math.pow(1 + r, plazo);
    const rentaSoloActivo = (factor - 1) !== 0 ? ((pvActivo * r * factor) - (residualReal * r)) / (factor - 1) : 0;
    
    const rentaTotalCruda = rentaSoloActivo + seguroFinMensual + gpsFinMensual;
    const rentaMensualSubtotal = rentaTotalCruda / 1.16;
    const rentaMensualIVA = rentaMensualSubtotal * 0.16;
    const rentaMensualTotal = rentaMensualSubtotal + rentaMensualIVA;

    const pagoInicialSubtotal = pagoInicialSub + comisionSub + seguroSub + gpsSub + serviciosSub;
    const pagoInicialIVA = pagoInicialSubtotal * 0.16;
    const pagoInicialTotal = pagoInicialSubtotal + pagoInicialIVA;

    setErrores(err);
    setRes({ 
      residualReal, pagoInicialSub, comisionSub, gpsSub, seguroSub, serviciosSub, 
      pagoInicialSubtotal, pagoInicialIVA, pagoInicialTotal, rentaSoloActivo, 
      gpsFinMensual, seguroFinMensual, rentaMensualSubtotal, rentaMensualIVA, rentaMensualTotal 
    });
  }, [formData]);

  const handleGuardarCotizacion = async () => {
    if (!puedeGuardarOPdf) return;

    setGuardando(true);
    let finalLeadId = formData.lead_id || null;

    const nombreCombinado = formData.tipoArrendamiento === 'Automotriz'
      ? armarNombreActivoAutomotriz(formData)
      : formData.nombreActivo.trim();

    try {
      if (!finalLeadId) {
        const crearProspecto = window.confirm(`¿Deseas generar a "${formData.nombre_cliente}" como un prospecto en tu tablero del CRM? \n\n(Si le das a Cancelar, solo se guardará la cotización)`);
        
        if (crearProspecto) {
          const resPipe = await api.get(`/pipelines/${empresaId}`);
          let primeraEtapaId = null;
          if (resPipe.data.length > 0) {
            const resEtapas = await api.get(`/etapas/${resPipe.data[0].id}`);
            if (resEtapas.data.length > 0) primeraEtapaId = resEtapas.data[0].id;
          }

          await api.post('/leads', {
            empresa_id: empresaId,
            nombre: formData.nombre_cliente,
            correo: '', 
            telefono: '',
            valor: parseFloat(String(formData.valorActivo).replace(/,/g, '')) || 0,
            medio: 'Cotizador',
            tipo_persona: formData.tipo_persona || null,
            stage_id: primeraEtapaId,
            usuario_id: usuarioLogueado.id
          });

          const resLeads = await api.get(`/leads/${empresaId}`);
          setLeads(resLeads.data);
          const leadNuevo = resLeads.data.find(l => l.nombre === formData.nombre_cliente);
          if (leadNuevo) finalLeadId = leadNuevo.id;
        }
      }

      await api.post('/cotizaciones', {
        empresa_id: empresaId, 
        lead_id: finalLeadId, 
        usuario_id: usuarioLogueado.id,
        tipo_activo: formData.tipoArrendamiento === 'Automotriz' ? formData.tipoVehiculo : formData.tipoArrendamiento,
        marca: formData.tipoArrendamiento === 'Automotriz' ? formData.marca : '',
        modelo: formData.tipoArrendamiento === 'Automotriz' ? formData.modelo : '',
        version: formData.tipoArrendamiento === 'Automotriz' ? formData.version : '',
        anio: formData.tipoArrendamiento === 'Automotriz' ? formData.anio : '',
        nombre_activo: nombreCombinado,
        // MODIFICADO: Guardar sin comas en la BD
        valor_activo: parseFloat(String(formData.valorActivo).replace(/,/g, '')), 
        plazo: parseInt(formData.plazo), 
        tipo_renta: 'Vencida',
        porcentaje_vr: formData.isResidualPct ? parseFloat(String(formData.residual).replace(/,/g, '')) : 0, 
        vr_calculado: res.residualReal, 
        pago_inicial: res.pagoInicialTotal,
        renta_mensual_sin_iva: res.rentaMensualSubtotal, 
        renta_mensual_con_iva: res.rentaMensualTotal
      });

      if (finalLeadId && formData.lead_id) {
        await sincronizarTipoPersonaLead(finalLeadId);
        cargarLeads();
      }

      alert("✅ Cotización guardada con éxito.");
      cargarHistorial(); 
    } catch (error) {
      alert("❌ Error al guardar: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const convertirDesdeHistorial = async (cotizacion) => {
    const nombreLead = window.prompt("Nombre del cliente para el nuevo prospecto:", "Cliente Cotización");
    if (!nombreLead) return; 

    try {
      const resPipe = await api.get(`/pipelines/${empresaId}`);
      let primeraEtapaId = null;
      if (resPipe.data.length > 0) {
        const resEtapas = await api.get(`/etapas/${resPipe.data[0].id}`);
        if (resEtapas.data.length > 0) primeraEtapaId = resEtapas.data[0].id;
      }

      await api.post('/leads', {
        empresa_id: empresaId,
        nombre: nombreLead,
        correo: '', 
        telefono: '',
        valor: cotizacion.valor_activo || 0,
        medio: 'Cotizador (Historial)',
        stage_id: primeraEtapaId,
        usuario_id: usuarioLogueado.id
      });

      const resLeads = await api.get(`/leads/${empresaId}`);
      setLeads(resLeads.data);
      const leadNuevo = resLeads.data.find(l => l.nombre === nombreLead);

      if (leadNuevo) {
        await api.put(`/cotizaciones/${cotizacion.id}/vincular-lead`, { lead_id: leadNuevo.id });
        alert("🎉 Prospecto creado y vinculado a la cotización exitosamente.");
        cargarHistorial(); 
      }

    } catch (error) {
      alert("Error al convertir a prospecto: " + error.message);
    }
  };

  const imprimirPDF = async () => {
    if (!puedeGuardarOPdf || generandoPdf) return;

    setGenerandoPdf(true);
    let wrapper = null;

    const nombreCombinado = formData.tipoArrendamiento === 'Automotriz'
      ? armarNombreActivoAutomotriz(formData)
      : formData.nombreActivo.trim();

    const fechaHoy = new Date().toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    const logoUrl = `${window.location.origin}/branding/flising-logo-blanco.png`;

    const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif; font-size: 10px; background: white; width: ${PDF_ANCHO_PX}px; min-height: ${PDF_ALTO_A4_PX}px; margin: 0; padding: 0; display: flex; flex-direction: column; box-sizing: border-box;">

      <!-- BANDA SUPERIOR GRIS: sin border-radius, ocupa todo el ancho -->
      <div style="background-color: #2c2c2c; padding: 5px 24px 20px 24px; margin: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <img
            src="${logoUrl}"
            alt="Flising"
            style="height: 110px; object-fit: contain;"
            onerror="this.style.display='none'"
          />
          <div style="text-align: right; color: #cccccc; font-size: 10px; line-height: 1.8;">
            <div><strong style="color: white;">Fecha de expedición</strong>&nbsp;&nbsp;${fechaHoy}</div>
          </div>
        </div>
        <div style="color: white;">
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">COTIZACIÓN</div>
          <div style="font-size: 10px; color: #cccccc; line-height: 1.5;">
            Agradecemos tu confianza en Flising, es un gusto atenderte.<br/>
            A continuación, te presentamos los detalles específicos de tu cotización solicitada.
          </div>
        </div>
      </div>

      <!-- DATOS DEL CLIENTE: fuera de la banda gris, sobre fondo blanco -->
      <div style="background-color: white; padding: 12px 24px 10px 24px; border-bottom: 2px solid #e0e0e0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr>
            <td style="padding: 3px 0; width: 180px; font-weight: 700; color: #222;">NOMBRE DEL CLIENTE</td>
            <td style="padding: 3px 0; color: #444;">${formData.nombre_cliente || 'A quien corresponda'}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; font-weight: 700; color: #222;">PRODUCTO/VEHÍCULO</td>
            <!-- AQUÍ IMPRIMIMOS EL NOMBRE QUE ELEGIMOS ARRIBA EN EL PDF -->
            <td style="padding: 3px 0; color: #444;">${nombreCombinado || 'No especificado'}</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; font-weight: 700; color: #222;">PRECIO (IVA INCLUIDO)</td>
            <td style="padding: 3px 0; color: #444;">${formatoMoneda(parseFloat(String(formData.valorActivo).replace(/,/g, '')))} MXN</td>
          </tr>
          <tr>
            <td style="padding: 3px 0; font-weight: 700; color: #222;">PLAZO (MESES)</td>
            <td style="padding: 3px 0; color: #444;">${formData.plazo}</td>
          </tr>
        </table>
      </div>

      <!-- TABLAS DE PAGO INICIAL Y RENTA MENSUAL -->
      <div style="padding: 14px 24px; background: white;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="vertical-align: top;">

            <!-- PAGO INICIAL -->
            <td style="width: 49%; padding-right: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                <tr>
                  <td colspan="2" style="background-color: #ea5533; color: white; padding: 6px 10px; font-weight: 700; font-size: 11px;">
                    PAGO INICIAL
                  </td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Renta Extraordinaria</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.pagoInicialSub)}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Comisión por apertura</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.comisionSub)}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">GPS</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.gpsSub)}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Seguro</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.seguroSub)}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Gestoría trámites vehiculares</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.serviciosSub)}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Servicio y/o mantenimiento</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 2px solid #ccc;"><strong>Subtotal</strong></td>
                  <td style="padding: 5px 8px; border-bottom: 2px solid #ccc; text-align: right; white-space: nowrap;"><strong>${formatoMoneda(res.pagoInicialSubtotal)}</strong></td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px;">IVA</td>
                  <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">${formatoMoneda(res.pagoInicialIVA)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="background-color: #ea5533; color: white; padding: 6px 10px; font-weight: 700;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="font-size: 10.5px;">PAGO TOTAL INICIAL</td>
                        <td style="text-align: right; white-space: nowrap;">${formatoMoneda(res.pagoInicialTotal)} MXN</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>

            <!-- RENTA MENSUAL -->
            <td style="width: 49%; padding-left: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                <tr>
                  <td colspan="2" style="background-color: #2c2c2c; color: white; padding: 6px 10px; font-weight: 700; font-size: 11px;">
                    RENTA MENSUAL &nbsp;|&nbsp; PLAZO ${formData.plazo} MESES
                  </td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Renta</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.rentaSoloActivo / 1.16)}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">GPS</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.gpsFinMensual / 1.16)}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Seguro</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${formatoMoneda(res.seguroFinMensual / 1.16)}</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Gestoría trámites vehiculares</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Servicio y/o mantenimiento</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Otros</td>
                  <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
                </tr>
                <tr>
                  <td style="padding: 5px 8px; border-bottom: 2px solid #ccc;"><strong>Subtotal</strong></td>
                  <td style="padding: 5px 8px; border-bottom: 2px solid #ccc; text-align: right; white-space: nowrap;"><strong>${formatoMoneda(res.rentaMensualSubtotal)}</strong></td>
                </tr>
                <tr style="background:#f9f9f9;">
                  <td style="padding: 5px 8px;">IVA</td>
                  <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">${formatoMoneda(res.rentaMensualIVA)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="background-color: #2c2c2c; color: white; padding: 6px 10px; font-weight: 700;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="font-size: 10.5px;">PAGO TOTAL RENTA MENSUAL</td>
                        <td style="text-align: right; white-space: nowrap;">${formatoMoneda(res.rentaMensualTotal)} MXN</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- VALOR RESIDUAL -->
              <div style="margin-top: 8px; background-color: transparent; color: black; padding: 8px 10px; font-weight: 700; font-size: 10.5px; text-align: right;">
                VALOR RESIDUAL ESTIMADO<br/>
                <span style="font-weight: 400;">${formatoMoneda(res.residualReal)}</span>
              </div>
            </td>

          </tr>
        </table>
      </div>

      <!-- OBSERVACIONES Y NOTAS -->
      <div style="padding: 0px 24px 8px 24px; background: white; font-size: 9.5px; color: #333; line-height: 1.5;">
        <p style="font-weight: 700; margin: 6px 0 3px 0;">OBSERVACIONES</p>
        <ul style="margin: 0; padding-left: 14px;">
          <li>- Sujeto a aprobación de crédito.</li>
          <li>- Cotización sujeta a cambios sin previo aviso.</li>
          <li>- Seguro y GPS obligatorio a cargo del cliente con renovaciones anuales (en caso de aplicar) cobertura amplia.</li>
          <li>- El valor de la tenencia y/o impuestos gubernamentales es estimado, sujeto a la fórmula gubernamental vigente y a la fecha de entrega de la unidad.</li>
          <li>- Sujeto a disponibilidad del activo en sus variantes y/o colores, así como su valor.</li>
        </ul>
        <p style="font-weight: 700; margin: 8px 0 3px 0;">NOTAS</p>
        <ul style="margin: 0; padding-left: 14px;">
          <li>- Oferta preliminar sujeta a modificación según evaluación crediticia. Las condiciones definitivas se establecerán después de concluir satisfactoriamente el proceso de precalificación.</li>
          <li>- Al pago inicial se le suma el pago del seguro anual una vez que se confirme el precio de este o en caso de ser financiado, la parte que corresponda.</li>
          <li>- 1er renta deberá ser pagada antes o a la entrega del bien arrendado.</li>
          <li>- El Arrendatario pagará las rentas proporcionales que se generen entre el día de entrega del vehículo y la fecha de inicio del arrendamiento.</li>
          <li>- El pago mensual es domiciliado el día 1 de cada mes.</li>
        </ul>
      </div>

      <!-- FIRMA / CIERRE -->
      <div style="padding: 6px 24px 14px 24px; background: white; font-size: 9.5px; color: #333; line-height: 1.6;">
        <p style="font-weight: 700; color: #ea5533; margin: 0 0 4px 0; text-align: center; font-size: 10px;">
          ¡Estamos encantados de resolver cualquier duda o comentario que tengas!
        </p>
        <p style="margin: 0;">
          He leído y entiendo plenamente las condiciones y disposiciones contenidas en la presente cotización, estoy de acuerdo.
        </p>
        <p style="margin: 5px 0 0 0;">
          <strong>${formData.nombre_cliente || 'A quien corresponda'}</strong>&nbsp;&nbsp;
          Metepec, Edo. de México, a ${fechaHoy}
        </p>
        <p style="margin: 6px 0 0 0; font-size: 9px; color: #555;">
          Estimado cliente, te invitamos a leer nuestro
          <span style="color: #ea5533;">Aviso de privacidad y transferencia de datos personales</span>;
          y <span style="color: #ea5533;">Términos y condiciones generales del arrendamiento puro</span>.
        </p>
      </div>

      <!-- FRANJA INFERIOR GRIS -->
      <div style="margin-top: auto; background-color: #2c2c2c; box-sizing: border-box; padding: 2px 24px; display: flex; align-items: center; justify-content: center;">
        <img
          src="${logoUrl}"
          alt="Flising"
          style="height: 70px; object-fit: contain;"
          onerror="this.style.display='none'"
        />
        <span style="color: #aaa; font-size: 10px; margin-left: 16px;">www.flising.com</span>
      </div>

    </div>
  `;

    const nombreArchivo = formData.nombre_cliente
      ? `Cotizacion_${formData.nombre_cliente.replace(/\s+/g, '_')}.pdf`
      : 'Cotizacion_Flising.pdf';

    try {
      const montado = montarContenedorPdf(htmlContent);
      wrapper = montado.wrapper;
      const { root } = montado;

      await esperarRecursosPdf(root);
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      const altoPx = Math.ceil(root.scrollHeight);
      root.style.width = `${PDF_ANCHO_PX}px`;
      root.style.height = `${altoPx}px`;

      const opciones = {
        margin: 0,
        filename: nombreArchivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: PDF_ESCALA_CANVAS,
          useCORS: true,
          allowTaint: false,
          width: PDF_ANCHO_PX,
          height: altoPx,
          windowWidth: PDF_ANCHO_PX,
          windowHeight: altoPx,
          scrollX: 0,
          scrollY: 0,
        },
        pagebreak: { mode: ['css', 'legacy'] },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };

      await html2pdf().set(opciones).from(root).save();
    } catch (error) {
      console.error('Error al generar PDF:', error);
      alert('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      wrapper?.remove();
      setGenerandoPdf(false);
    }
  };

  const formatoMoneda = (monto) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);
  
  const ToggleBtn = ({ flag, onClick, label }) => (
    <button type="button" onClick={onClick} className={`px-3 py-2 text-xs font-bold rounded-md transition-colors ${flag ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
      {label}
    </button>
  );

  if (cargando) return <div className="p-10 text-center font-medium text-slate-500">Cargando cotizador...</div>;
  if (!empresaId) return <div className="p-10 text-center text-slate-500 bg-slate-50 rounded-2xl m-8"><h2 className="text-xl font-bold">Vista Global</h2><p>Inicia sesión como Agente o Admin para cotizar.</p></div>;

  return (
    <div className="font-sans max-w-7xl mx-auto pb-20">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Cotizador de Arrendamiento</h1>
          <p className="text-slate-500 mt-1">Flising.</p>
        </div>
        <button 
          onClick={() => setFormData({...formData, valorActivo:'', pagoInicial:'', residual:'', comision:'', seguro:'', gps:'', servicios:'', marca:'', modelo:'', version:'', anio:'', nombreActivo:''})} 
          className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300"
        >
          Limpiar Campos
        </button>
      </header>

      {errores.general && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 font-bold text-sm">
          {errores.general}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* EL FORMULARIO EXPANDIDO */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Prospecto CRM (Opcional)
              </label>
              <select 
                value={formData.lead_id} 
                onChange={handleLeadChange} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="">-- Escribir datos a mano --</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Nombre del Cliente
              </label>
              <input 
                type="text" 
                value={formData.nombre_cliente} 
                onChange={e => setFormData({...formData, nombre_cliente: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
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
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
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
                onChange={e => setFormData({...formData, tipoArrendamiento: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
                  placeholder="Ej. Maquinaria Industrial Modelo X"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-blue-600 uppercase mb-2">
                Valor del Activo
              </label>
              <input 
                type="text" 
                inputMode="decimal"
                value={formData.valorActivo} 
                onChange={e => setFormData({...formData, valorActivo: formatMontoFormulario(e.target.value)})} 
                className="w-full bg-blue-50 border border-blue-200 text-blue-800 font-bold rounded-xl px-4 py-3 outline-none focus:border-blue-500" 
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
                className={`w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none ${errores.plazo ? 'border-red-500' : 'border-slate-200'}`} 
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
                className={`w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none ${errores.tasa ? 'border-red-500' : 'border-slate-200'}`} 
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
                  className={`flex-1 border rounded-xl px-4 py-2 outline-none ${errores.pagoInicial ? 'border-red-500' : 'border-slate-200'}`} 
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
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2 outline-none" 
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
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2 outline-none" 
                />
                <ToggleBtn flag={formData.isComisionPct} onClick={() => setFormData({...formData, isComisionPct: true})} label="%" />
                <ToggleBtn flag={!formData.isComisionPct} onClick={() => setFormData({...formData, isComisionPct: false})} label="$" />
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Trámites e impuestos
              </label>
              <input 
                type="number" 
                value={formData.servicios} 
                onChange={e => setFormData({...formData, servicios: e.target.value})} 
                className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none" 
                disabled={formData.tipoArrendamiento !== 'Automotriz'} 
              />
            </div>

            <div className="md:col-span-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  Seguro
                </label>
                <input 
                  type="number" 
                  value={formData.seguro} 
                  onChange={e => setFormData({...formData, seguro: e.target.value})} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none mb-2" 
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
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                  GPS
                </label>
                <input 
                  type="number" 
                  value={formData.gps} 
                  onChange={e => setFormData({...formData, gps: e.target.value})} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 outline-none mb-2" 
                  disabled={formData.tipoArrendamiento !== 'Automotriz'} 
                />
                <div className="flex gap-2">
                  <ToggleBtn flag={formData.isGpsContado} onClick={() => setFormData({...formData, isGpsContado: true})} label="Contado" />
                  <ToggleBtn flag={!formData.isGpsContado} onClick={() => setFormData({...formData, isGpsContado: false})} label="Financiado" />
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
              <span className="font-black text-2xl text-blue-400">{formatoMoneda(res.rentaMensualTotal)}</span>
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
              disabled={guardando || !puedeGuardarOPdf} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${guardando || !puedeGuardarOPdf ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'}`}
            >
              {guardando ? 'Guardando...' : '💾 Guardar DB'}
            </button>
            <button 
              onClick={imprimirPDF} 
              disabled={!puedeGuardarOPdf || generandoPdf} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${!puedeGuardarOPdf || generandoPdf ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#ea5533] hover:opacity-90 text-white shadow-lg shadow-[#ea5533]/30'}`}
            >
              {generandoPdf ? 'Generando PDF…' : '📄 Generar PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* HISTORIAL DE COTIZACIONES CON BOTÓN DE CONVERSIÓN Y AGENTE*/}
      {/* ========================================================= */}
      <div className="mt-12 bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">
          Historial de Cotizaciones Guardadas
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="p-4 rounded-tl-xl">Folio</th>
                <th className="p-4 rounded-tl-xl">Fecha</th>
                <th className="p-4">Prospecto</th>
                
                {usuarioLogueado.rol !== 'agente' && (
                  <th className="p-4 text-blue-600">Agente Creador</th>
                )}

                {/* ENCABEZADO ACTUALIZADO */}
                <th className="p-4">Vehículo / Activo</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Renta Mensual</th>
                <th className="p-4 rounded-tr-xl">Acción</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(cot => (
  <tr key={cot.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
    
    <td className="p-4 text-sm font-black text-slate-800">
      {cot.folio ? `FL-${String(cot.folio).padStart(3, '0')}` : '---'}
    </td>

    <td className="p-4 text-sm font-medium text-slate-700">
      {new Date(cot.fecha_creacion).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
    </td>

    <td className="p-4 text-sm font-bold text-slate-900">
      {cot.lead_nombre ? (
        <span className="text-blue-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
          {cot.lead_nombre}
        </span>
      ) : (
        <span className="text-slate-400 font-normal italic">Sin prospecto</span>
      )}
    </td>

    {usuarioLogueado.rol !== 'agente' && (
      <td className="p-4 text-sm font-medium text-slate-500 bg-blue-50/30">
        {cot.agente_nombre || 'Desconocido'}
      </td>
    )}

    {/* AQUÍ COMBINAMOS EL NOMBRE DEL ACTIVO Y EL TIPO DE ACTIVO */}
    <td className="p-4">
      <div className="text-sm font-bold text-slate-800">{cot.nombre_activo || '-'}</div>
      <div className="text-xs text-slate-500 font-medium">{cot.tipo_activo}</div>
    </td>

    <td className="p-4 text-sm font-bold text-blue-600">{formatoMoneda(cot.valor_activo)}</td>

    <td className="p-4 text-sm font-black text-slate-800">{formatoMoneda(cot.renta_mensual_con_iva)}</td>

    <td className="p-4 text-sm">
      {!cot.lead_nombre && (
        <button 
          onClick={() => convertirDesdeHistorial(cot)}
          className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
        >
          ➕ Hacer Prospecto
        </button>
      )}
    </td>
  </tr>
))}
{historial.length === 0 && (
  <tr>
    <td colSpan={usuarioLogueado.rol !== 'agente' ? "8" : "7"} className="p-8 text-center text-slate-400 font-medium">
      Aún no hay cotizaciones guardadas en el sistema.
    </td>
  </tr>
)}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default CotizadorView;