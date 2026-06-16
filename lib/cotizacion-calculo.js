const { parseNumeroFormulario } = require('./cotizacion-formulario-pdf');

const tablaResidual = [
  { min: 12, max: 12, valores: { Sedan: 67, SUV: 70, Camionetas: 68, Lujo: 60, Tractocamion: 65, Autobus: 65 } },
  { min: 13, max: 24, valores: { Sedan: 58, SUV: 63, Camionetas: 60, Lujo: 48, Tractocamion: 52, Autobus: 52 } },
  { min: 25, max: 36, valores: { Sedan: 47, SUV: 55, Camionetas: 52, Lujo: 38, Tractocamion: 42, Autobus: 42 } },
  { min: 37, max: 48, valores: { Sedan: 38, SUV: 47, Camionetas: 45, Lujo: 30, Tractocamion: 34, Autobus: 34 } },
  { min: 49, max: 60, valores: { Sedan: 30, SUV: 40, Camionetas: 38, Lujo: 23, Tractocamion: 28, Autobus: 28 } },
  { min: 61, max: 72, valores: { Sedan: 25, SUV: 35, Camionetas: 33, Lujo: 18, Tractocamion: 23, Autobus: 23 } },
];

const tablaResidualOtro = [
  { min: 12, max: 12, valores: 70 },
  { min: 13, max: 24, valores: 60 },
  { min: 25, max: 36, valores: 51 },
  { min: 37, max: 48, valores: 43 },
  { min: 49, max: 60, valores: 36 },
  { min: 61, max: 72, valores: 31 },
];

function calcularPMT(tasaAnual, n, pv, fv) {
  const r = (tasaAnual * 1.16) / 12 / 100;
  const factor = Math.pow(1 + r, n);
  const numerador = (pv * r * factor) - (fv * r);
  const denominador = factor - 1;
  if (denominador === 0) return 0;
  return numerador / denominador;
}

/** Misma lógica que el cotizador frontend (totales para PDF y guardado). */
function calcularResultadosCotizacion(formData, opciones = {}) {
  const modoEspecial = opciones.modoEspecial === true;
  const err = {};
  const valorActivo = parseNumeroFormulario(formData.valorActivo);
  const plazo = parseInt(formData.plazo, 10) || 36;
  const tasaAnual = parseFloat(formData.tasaAnual) || 0;

  if (!modoEspecial) {
    if (tasaAnual < 16 || tasaAnual > 40) err.tasa = 'La tasa debe estar entre 16% y 40%.';
    if (plazo < 12 || plazo > 72) err.plazo = 'El plazo debe ser entre 12 y 72 meses.';
  }

  const piInput = parseNumeroFormulario(formData.pagoInicial);
  const inicialReal = formData.isPagoInicialPct ? valorActivo * (piInput / 100) : piInput;
  if (!modoEspecial && inicialReal > valorActivo * 0.5) {
    err.pagoInicial = 'El pago inicial no puede exceder el 50% del valor.';
  }

  const resInput = parseNumeroFormulario(formData.residual);
  const residualReal = formData.isResidualPct ? valorActivo * (resInput / 100) : resInput;

  if (!modoEspecial) {
    let maxResidualPermitido = 0;
    if (formData.tipoArrendamiento === 'Automotriz') {
      const rango = tablaResidual.find((r) => plazo >= r.min && plazo <= r.max);
      maxResidualPermitido = valorActivo * ((rango ? (rango.valores[formData.tipoVehiculo] || 20) : 20) / 100);
    } else {
      const rango = tablaResidualOtro.find((r) => plazo >= r.min && plazo <= r.max);
      maxResidualPermitido = valorActivo * ((rango ? rango.valores : 20) / 100);
    }

    if (residualReal > maxResidualPermitido && valorActivo > 0) err.residual = 'Excede el tope permitido.';
    if ((residualReal + inicialReal) > valorActivo && valorActivo > 0) {
      err.general = 'Suma inicial + residual excede 100%.';
    }
  }

  const comInput = parseNumeroFormulario(formData.comision);
  const comisionReal = formData.isComisionPct ? comInput * (valorActivo - inicialReal) / 100 : comInput;

  const esAutomotriz = formData.tipoArrendamiento === 'Automotriz';
  const gpsInput = esAutomotriz ? parseNumeroFormulario(formData.gps) : 0;
  const gpsContado = esAutomotriz && formData.isGpsContado ? gpsInput : 0;
  const serviciosReal = esAutomotriz ? parseNumeroFormulario(formData.servicios) : 0;

  const seguroInput = parseNumeroFormulario(formData.seguro);
  const seguroContado = formData.isSeguroContado ? seguroInput : 0;
  const seguroFinanciadoBase = !formData.isSeguroContado ? seguroInput : 0;

  const seguroSub = seguroContado / 1.16;
  const gpsSub = gpsContado / 1.16;
  const serviciosSub = serviciosReal / 1.16;
  const pagoInicialSub = inicialReal / 1.16;
  const comisionSub = comisionReal / 1.16;

  const seguroFinMensual = !formData.isSeguroContado
    ? calcularPMT(tasaAnual, (formData.isSeguroAnual ? 12 : plazo), seguroFinanciadoBase, 0)
    : 0;
  const gpsFinMensual = esAutomotriz && !formData.isGpsContado
    ? calcularPMT(tasaAnual, plazo, gpsInput, 0)
    : 0;

  const pvActivo = valorActivo - inicialReal;
  const r = (tasaAnual * 1.16) / 12 / 100;
  const factor = Math.pow(1 + r, plazo);
  const rentaSoloActivo = (factor - 1) !== 0
    ? ((pvActivo * r * factor) - (residualReal * r)) / (factor - 1)
    : 0;

  const rentaTotalCruda = rentaSoloActivo + seguroFinMensual + gpsFinMensual;
  const rentaMensualSubtotal = rentaTotalCruda / 1.16;
  const rentaMensualIVA = rentaMensualSubtotal * 0.16;
  const rentaMensualTotal = rentaMensualSubtotal + rentaMensualIVA;

  const isRentas = formData.isRentasDeposito === true;
  const cantidadRentas = parseInt(formData.rentasDepositoCantidad, 10) || 0;
  const rentasDepositoSubtotal = isRentas ? (rentaMensualSubtotal * cantidadRentas) : 0;
  const rentasDepositoValor = isRentas ? (rentaMensualTotal * cantidadRentas) : 0;

  const pagoInicialSubtotal = pagoInicialSub + comisionSub + seguroSub + gpsSub + serviciosSub + rentasDepositoSubtotal;
  const pagoInicialIVA = pagoInicialSubtotal * 0.16;
  const pagoInicialTotal = pagoInicialSubtotal + pagoInicialIVA;

  return {
    errores: err,
    res: {
      residualReal,
      pagoInicialSub,
      comisionSub,
      gpsSub,
      seguroSub,
      serviciosSub,
      rentasDepositoSubtotal,
      rentasDepositoValor,
      pagoInicialSubtotal,
      pagoInicialIVA,
      pagoInicialTotal,
      rentaSoloActivo,
      gpsFinMensual,
      seguroFinMensual,
      rentaMensualSubtotal,
      rentaMensualIVA,
      rentaMensualTotal,
    },
  };
}

module.exports = { calcularResultadosCotizacion };
