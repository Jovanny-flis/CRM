import { useState, useEffect } from 'react';
import api from '../api';

// --- TABLAS DE TOPES RESIDUALES (Directas de tu código) ---
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

const CotizadorView = () => {
  const [leads, setLeads] = useState([]);
  const [historial, setHistorial] = useState([]); 
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioCRM') || '{}');
  const empresaId = usuarioLogueado.empresa_id;

  // --- ESTADO DEL FORMULARIO CON TODOS TUS TOGGLES ---
  const [formData, setFormData] = useState({
    lead_id: '', 
    nombre_cliente: '', 
    tipoArrendamiento: 'Automotriz', 
    tipoVehiculo: 'Sedan',
    nombreActivo: '', 
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

  // --- ESTADOS DE RESULTADOS Y ERRORES ---
  const [res, setRes] = useState({});
  const [errores, setErrores] = useState({});

  // =========================================================
  // NUEVO: Ahora mandamos el id y el rol al servidor
  // =========================================================
  const cargarHistorial = () => {
    api.get(`/cotizaciones/empresa/${empresaId}?usuario_id=${usuarioLogueado.id}&rol=${usuarioLogueado.rol}`)
      .then(res => setHistorial(res.data))
      .catch(err => console.error("Error al cargar historial:", err));
  };

  const cargarLeads = () => {
    api.get(`/leads/${empresaId}`)
      .then(res => setLeads(res.data))
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
      nombre_cliente: leadSel ? leadSel.nombre : '' 
    }));
  };

  // --- EL CEREBRO MATEMÁTICO (Recalcula todo cada vez que escribes) ---
  useEffect(() => {
    let err = {};
    const valorActivo = parseFloat(formData.valorActivo) || 0;
    const plazo = parseInt(formData.plazo) || 36;
    const tasaAnual = parseFloat(formData.tasaAnual) || 0;

    if (tasaAnual < 16 || tasaAnual > 40) err.tasa = "La tasa debe estar entre 16% y 40%.";
    if (plazo < 12 || plazo > 72) err.plazo = "El plazo debe ser entre 12 y 72 meses.";

    const piInput = parseFloat(formData.pagoInicial) || 0;
    const inicialReal = formData.isPagoInicialPct ? valorActivo * (piInput / 100) : piInput;
    if (inicialReal > valorActivo * 0.5) err.pagoInicial = "El pago inicial no puede exceder el 50% del valor.";

    const resInput = parseFloat(formData.residual) || 0;
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

    const comInput = parseFloat(formData.comision) || 0;
    const comisionReal = formData.isComisionPct ? comInput * (valorActivo - inicialReal) / 100 : comInput;

    const gpsInput = parseFloat(formData.gps) || 0;
    const gpsContado = formData.isGpsContado ? gpsInput : 0;
    const serviciosReal = parseFloat(formData.servicios) || 0;

    const seguroInput = parseFloat(formData.seguro) || 0;
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


  // =========================================================================
  // FLUJO DE GUARDAR Y/O CREAR PROSPECTO EN UN SOLO PASO
  // =========================================================================
  const handleGuardarCotizacion = async () => {
    if (Object.keys(errores).length > 0 || !formData.valorActivo) return alert("Corrige los errores antes de guardar.");
    if (!formData.nombre_cliente) return alert("Escribe el nombre del cliente para poder guardar la cotización.");

    setGuardando(true);
    let finalLeadId = formData.lead_id || null;

    try {
      // 1. Si no hay un prospecto asignado, le preguntamos al usuario
      if (!finalLeadId) {
        const crearProspecto = window.confirm(`¿Deseas generar a "${formData.nombre_cliente}" como un prospecto en tu tablero del CRM? \n\n(Si le das a Cancelar, solo se guardará la cotización)`);
        
        if (crearProspecto) {
          const resPipe = await api.get(`/pipelines/${empresaId}`);
          let primeraEtapaId = null;
          if (resPipe.data.length > 0) {
            const resEtapas = await api.get(`/etapas/${resPipe.data[0].id}`);
            if (resEtapas.data.length > 0) primeraEtapaId = resEtapas.data[0].id;
          }

          // Creamos el prospecto
          await api.post('/leads', {
            empresa_id: empresaId,
            nombre: formData.nombre_cliente,
            correo: '', 
            telefono: '',
            valor: parseFloat(formData.valorActivo) || 0,
            medio: 'Cotizador',
            stage_id: primeraEtapaId,
            usuario_id: usuarioLogueado.id
          });

          // Buscamos el ID del prospecto recién creado
          const resLeads = await api.get(`/leads/${empresaId}`);
          setLeads(resLeads.data);
          const leadNuevo = resLeads.data.find(l => l.nombre === formData.nombre_cliente);
          if (leadNuevo) finalLeadId = leadNuevo.id;
        }
      }

      // 2. Guardamos la cotización (con o sin lead_id)
      await api.post('/cotizaciones', {
        empresa_id: empresaId, 
        lead_id: finalLeadId, 
        usuario_id: usuarioLogueado.id,
        tipo_activo: formData.tipoArrendamiento === 'Automotriz' ? formData.tipoVehiculo : formData.tipoArrendamiento,
        valor_activo: parseFloat(formData.valorActivo), 
        plazo: parseInt(formData.plazo), 
        tipo_renta: 'Vencida',
        porcentaje_vr: formData.isResidualPct ? parseFloat(formData.residual) : 0, 
        vr_calculado: res.residualReal, 
        pago_inicial: res.pagoInicialTotal,
        renta_mensual_sin_iva: res.rentaMensualSubtotal, 
        renta_mensual_con_iva: res.rentaMensualTotal
      });

      alert("✅ Cotización guardada con éxito.");
      cargarHistorial(); // Refrescamos la tabla
    } catch (error) {
      alert("❌ Error al guardar: " + error.message);
    } finally {
      setGuardando(false);
    }
  };


  // =========================================================================
  // FUNCIÓN PARA EL BOTÓN "CREAR PROSPECTO" DE LA TABLA (HISTORIAL)
  // =========================================================================
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

  const imprimirPDF = () => {
    if (Object.keys(errores).length > 0 || !formData.valorActivo) return alert("Completa la cotización sin errores.");
    const htmlContent = `
      <div style="background-color: #2c2c2c; color: white; font-family: 'Lato', sans-serif; font-size: 0.7rem; padding: 20px; border-radius: 10px; max-width: 900px; display: flex; justify-content: space-between; align-items: flex-start; margin: auto;">
        <div style="flex: 1;">
          <div style="display: flex; margin-bottom: 10px;"><div style="width: 250px;"><strong>NOMBRE DEL CLIENTE</strong></div><div>${formData.nombre_cliente || 'A quien corresponda'}</div></div>
          <div style="display: flex; margin-bottom: 10px;"><div style="width: 250px;"><strong>PRODUCTO/VEHÍCULO</strong></div><div>${formData.nombreActivo}</div></div>
          <div style="display: flex; margin-bottom: 10px;"><div style="width: 250px;"><strong>PRECIO (IVA INCLUIDO)</strong></div><div>${formatoMoneda(formData.valorActivo)} MXN</div></div>
          <div style="display: flex;"><div style="width: 250px;"><strong>PLAZO (MESES)</strong></div><div>${formData.plazo}</div></div>
        </div>
        <div style="margin-right: 25px;">
          <img src="https://assets.zyrosite.com/dWxvqeKx2lHMaZl8/flisingr_itm_blanco-Y4LvM3Mor4sKaZq5.png" alt="Logo" style="height: 60px; object-fit: contain;">
        </div>
      </div>
      <br/>
      <div style="color:black; font-family:Lato, sans-serif; padding:10px; max-width:900px; margin:auto; font-size: 0.75rem;">
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
          
          <div style="flex:1; border: 1px solid #ddd; border-radius:15px; padding:20px; min-width:300px;">
            <div style="background-color:#ea5533; color:white; padding:10px; text-align:center; border-radius:5px; margin-bottom:15px;"><strong>DESEMBOLSO INICIAL</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span><strong>Renta Extraordinaria:</strong></span><span>${formatoMoneda(res.pagoInicialSub)}</span></div>
            <div style="display: flex; justify-content: space-between; background-color: #e9e9e9; padding: 4px;"><span><strong>Comisión por apertura:</strong></span><span>${formatoMoneda(res.comisionSub)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span><strong>GPS:</strong></span><span>${formatoMoneda(res.gpsSub)}</span></div>
            <div style="display: flex; justify-content: space-between; background-color: #e9e9e9; padding: 4px;"><span><strong>Seguro:</strong></span><span>${formatoMoneda(res.seguroSub)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span><strong>Trámites e impuestos:</strong></span><span>${formatoMoneda(res.serviciosSub)}</span></div>
            <hr style="border-color:#dddddd; margin:15px 0;">
            <div style="display: flex; justify-content: space-between;"><span><strong>Subtotal:</strong></span><span>${formatoMoneda(res.pagoInicialSubtotal)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span><strong>IVA:</strong></span><span>${formatoMoneda(res.pagoInicialIVA)}</span></div>
            <div style="display:flex; justify-content:space-between; background-color:#ea5533; color:white; padding:10px; border-radius:5px; margin-top:15px; font-weight:bold; font-size:1rem;">
              <span><strong>Total inicial:</strong></span><span>${formatoMoneda(res.pagoInicialTotal)}</span>
            </div>
          </div>

          <div style="flex:1; border: 1px solid #ddd; border-radius:15px; padding:20px; min-width:300px;">
            <div style="background-color:black; color:white; padding:10px; text-align:center; border-radius:5px; margin-bottom:15px;"><strong>RENTA MENSUAL</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span><strong>Renta:</strong></span><span>${formatoMoneda(res.rentaSoloActivo / 1.16)}</span></div>
            <div style="display: flex; justify-content: space-between; background-color: #e9e9e9; padding: 4px;"><span><strong>GPS:</strong></span><span>${formatoMoneda(res.gpsFinMensual / 1.16)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span><strong>Seguro:</strong></span><span>${formatoMoneda(res.seguroFinMensual / 1.16)}</span></div>
            <br/><br/>
            <hr style="border-color:#dddddd; margin:15px 0;">
            <div style="display: flex; justify-content: space-between;"><span><strong>Subtotal:</strong></span><span>${formatoMoneda(res.rentaMensualSubtotal)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span><strong>IVA:</strong></span><span>${formatoMoneda(res.rentaMensualIVA)}</span></div>
            <div style="display:flex; justify-content:space-between; background-color:black; color:white; padding:10px; border-radius:5px; margin-top:15px; font-weight:bold; font-size:1rem;">
              <span><strong>Total renta mensual:</strong></span><span>${formatoMoneda(res.rentaMensualTotal)}</span>
            </div>
          </div>

        </div>
        <div style="margin-top: 20px;"><p><strong>Valor residual estimado:</strong> ${formatoMoneda(res.residualReal)}</p></div>
      </div>
    `;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`<html><head><title>Cotización</title><style>body{font-family: Arial, sans-serif; padding: 30px;} *{-webkit-print-color-adjust: exact;}</style></head><body onload="window.print();">${htmlContent}</body></html>`);
    printWindow.document.close();
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
          onClick={() => setFormData({...formData, valorActivo:'', pagoInicial:'', residual:'', comision:'', seguro:'', gps:'', servicios:''})} 
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

            {formData.tipoArrendamiento === 'Automotriz' && (
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
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Nombre del activo
              </label>
              <input 
                type="text" 
                value={formData.nombreActivo} 
                onChange={e => setFormData({...formData, nombreActivo: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-blue-600 uppercase mb-2">
                Valor del Activo
              </label>
              <input 
                type="number" 
                value={formData.valorActivo} 
                onChange={e => setFormData({...formData, valorActivo: e.target.value})} 
                className="w-full bg-blue-50 border border-blue-200 text-blue-800 font-bold rounded-xl px-4 py-3 outline-none focus:border-blue-500" 
                placeholder="Ej. 350000" 
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
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2 outline-none" 
                />
                <ToggleBtn flag={formData.isPagoInicialPct} onClick={() => setFormData({...formData, isPagoInicialPct: true})} label="%" />
                <ToggleBtn flag={!formData.isPagoInicialPct} onClick={() => setFormData({...formData, isPagoInicialPct: false})} label="$" />
              </div>
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

          <div className="flex gap-3">
            <button 
              onClick={handleGuardarCotizacion} 
              disabled={guardando || Object.keys(errores).length > 0} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${guardando || Object.keys(errores).length > 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg'}`}
            >
              {guardando ? 'Guardando...' : '💾 Guardar DB'}
            </button>
            <button 
              onClick={imprimirPDF} 
              disabled={Object.keys(errores).length > 0} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${Object.keys(errores).length > 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#ea5533] hover:opacity-90 text-white shadow-lg shadow-[#ea5533]/30'}`}
            >
              📄 Generar PDF
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
                <th className="p-4 rounded-tl-xl">Fecha</th>
                <th className="p-4">Prospecto</th>
                
                {/* LA COLUMNA DE AGENTE SOLO SE VE SI ERES JEFE O ADMIN */}
                {usuarioLogueado.rol !== 'agente' && (
                  <th className="p-4 text-blue-600">Agente Creador</th>
                )}

                <th className="p-4">Tipo de Activo</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Renta Mensual</th>
                <th className="p-4 rounded-tr-xl">Acción</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(cot => (
                <tr key={cot.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
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

                  {/* EL NOMBRE DEL AGENTE SOLO SE VE SI ERES JEFE O ADMIN */}
                  {usuarioLogueado.rol !== 'agente' && (
                    <td className="p-4 text-sm font-medium text-slate-500 bg-blue-50/30">
                      {cot.agente_nombre || 'Desconocido'}
                    </td>
                  )}

                  <td className="p-4 text-sm text-slate-600">{cot.tipo_activo}</td>
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
                  <td colSpan={usuarioLogueado.rol !== 'agente' ? "7" : "6"} className="p-8 text-center text-slate-400 font-medium">
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