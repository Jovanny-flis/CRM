/** Tipos de vehículo cuando tipo_arrendamiento = Automotriz (coincide con tipo_activo guardado) */
export const TIPOS_VEHICULO = ['Sedan', 'SUV', 'Camionetas', 'Lujo', 'Tractocamion', 'Autobus'];

/** Variante de PNG en public/cotizacion-activos/ para la banda gris del PDF. */
export const VARIANTE_IMAGEN_ACTIVO_PDF = 'blanco'; // 'naranja' | 'blanco'

const SLUG_IMAGEN_ACTIVO_PDF = {
  Sedan: 'sedan',
  SUV: 'suv',
  Camionetas: 'camionetas',
  Lujo: 'lujo',
  Tractocamion: 'tractocamion',
  Autobus: 'autobus',
  Otro: 'otro',
};

export const archivoImagenActivoPdf = ({ tipoArrendamiento, tipoVehiculo }) => {
  const tipo = tipoArrendamiento === 'Automotriz' ? tipoVehiculo : 'Otro';
  const slug = SLUG_IMAGEN_ACTIVO_PDF[tipo] || SLUG_IMAGEN_ACTIVO_PDF.Sedan;
  return `${slug}_${VARIANTE_IMAGEN_ACTIVO_PDF}.png`;
};

/** GPS y trámites solo aplican en arrendamiento Automotriz. */
export const limpiarCamposSoloAutomotriz = () => ({
  gps: '',
  servicios: '',
  isGpsContado: true,
});

export const esArrendamientoAutomotriz = (tipoArrendamiento) => tipoArrendamiento === 'Automotriz';

const boolDesdeBd = (v, defecto = true) => {
  if (v === null || v === undefined) return defecto;
  return v === true || v === 1 || v === '1';
};

const numeroAString = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
};

/**
 * Formato de montos en el cotizador: punto = decimales, coma = miles (ej. 1,500.50).
 * Solo dígitos y un punto; las comas de miles se reinsertan al formatear.
 */
export const formatMontoEnFormulario = (val) => {
  if (!val) return '';
  let rawValue = val.toString().replace(/[^0-9.]/g, '');
  const parts = rawValue.split('.');
  if (parts.length > 2) rawValue = parts[0] + '.' + parts.slice(1).join('');
  const [enteros, decimales] = rawValue.split('.');
  const enterosFormateados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimales !== undefined ? `${enterosFormateados}.${decimales}` : enterosFormateados;
};

/** Quita comas de miles y parsea; el punto es el único separador decimal. */
export const parseNumeroFormulario = (val) => {
  const s = String(val ?? '').trim().replace(/,/g, '');
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export const formDataCotizadorVacio = () => ({
  numUnidades: '1',
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
  servicios: '',
  isRentasDeposito: false,
  rentasDepositoCantidad: '',
});

const inferirTipoArrendamiento = (cot) => {
  if (cot.tipo_arrendamiento) return cot.tipo_arrendamiento;
  if (cot.marca || cot.modelo || cot.version || cot.anio) return 'Automotriz';
  if (TIPOS_VEHICULO.includes(cot.tipo_activo)) return 'Automotriz';
  if (cot.tipo_activo === 'Otro') return 'Otro';
  return 'Automotriz';
};

/**
 * Mapea registro de BD → estado del formulario del cotizador.
 * @param {object} cot — fila de cotizaciones
 * @param {{ paraReplicar?: boolean }} opciones — sin prospecto ni nombre de cliente
 */
export const cotizacionAFormData = (cot, { paraReplicar = false } = {}) => {
  const base = formDataCotizadorVacio();
  if (!cot) return base;

  const tipoArrendamiento = inferirTipoArrendamiento(cot);
  const tipoVehiculo = TIPOS_VEHICULO.includes(cot.tipo_activo) ? cot.tipo_activo : 'Sedan';
  const automotriz = esArrendamientoAutomotriz(tipoArrendamiento);

  const tieneParametros = cot.tasa_anual != null;

  return {
    ...base,
    lead_id: paraReplicar ? '' : (cot.lead_id || ''),
    nombre_cliente: paraReplicar ? '' : '',
    tipo_persona: paraReplicar ? '' : '',
    tipoArrendamiento,
    tipoVehiculo,
    nombreActivo: tipoArrendamiento === 'Otro' ? (cot.nombre_activo || '') : '',
    marca: cot.marca || '',
    modelo: cot.modelo || '',
    version: cot.version || '',
    anio: cot.anio != null ? String(cot.anio) : '',
    valorActivo: cot.valor_activo != null ? formatMontoEnFormulario(String(cot.valor_activo)) : '',
    plazo: cot.plazo != null ? String(cot.plazo) : base.plazo,
    tasaAnual: tieneParametros ? numeroAString(cot.tasa_anual) : base.tasaAnual,
    pagoInicial: tieneParametros && cot.pago_inicial_valor != null
      ? numeroAString(cot.pago_inicial_valor)
      : '',
    isPagoInicialPct: boolDesdeBd(cot.is_pago_inicial_pct, true),
    residual: tieneParametros && cot.residual_valor != null
      ? numeroAString(cot.residual_valor)
      : (cot.porcentaje_vr != null ? numeroAString(cot.porcentaje_vr) : ''),
    isResidualPct: boolDesdeBd(cot.is_residual_pct, true),
    comision: cot.comision_valor != null ? numeroAString(cot.comision_valor) : '',
    isComisionPct: boolDesdeBd(cot.is_comision_pct, true),
    seguro: cot.seguro_valor != null ? formatMontoEnFormulario(String(cot.seguro_valor)) : '',
    isSeguroContado: boolDesdeBd(cot.is_seguro_contado, true),
    isSeguroAnual: boolDesdeBd(cot.is_seguro_anual, true),
    gps: automotriz && cot.gps_valor != null ? formatMontoEnFormulario(String(cot.gps_valor)) : '',
    isGpsContado: boolDesdeBd(cot.is_gps_contado, true),
    servicios: automotriz && cot.servicios_valor != null
      ? formatMontoEnFormulario(String(cot.servicios_valor))
      : '',
    isRentasDeposito: boolDesdeBd(cot.is_rentas_deposito, false),
    rentasDepositoCantidad: cot.rentas_deposito_cantidad != null ? String(cot.rentas_deposito_cantidad) : '',
  };
};

/**
 * Deriva porcentaje VR y monto VR a partir de parámetros guardados o totales persistidos.
 * Si el residual se capturó en monto nominal, calcula el porcentaje equivalente.
 */
export const derivarPorcentajeYVr = (cot) => {
  if (!cot) return { porcentajeVr: 0, vrCalculado: 0 };

  const valorActivo = Number(cot.valor_activo);
  const esPct = boolDesdeBd(cot.is_residual_pct, true);
  let porcentajeVr = Number(cot.porcentaje_vr);
  let vrCalculado = Number(cot.vr_calculado);

  const tieneParametros = cot.tasa_anual != null && cot.residual_valor != null;

  if (tieneParametros) {
    const residualInput = Number(cot.residual_valor);
    if (esPct) {
      if (!Number.isFinite(porcentajeVr) || porcentajeVr === 0) porcentajeVr = residualInput;
      if ((!Number.isFinite(vrCalculado) || vrCalculado === 0) && valorActivo > 0) {
        vrCalculado = valorActivo * (residualInput / 100);
      }
    } else {
      if (!Number.isFinite(vrCalculado) || vrCalculado === 0) vrCalculado = residualInput;
      if ((!Number.isFinite(porcentajeVr) || porcentajeVr === 0) && valorActivo > 0) {
        porcentajeVr = (residualInput / valorActivo) * 100;
      }
    }
  } else if (
    (!Number.isFinite(porcentajeVr) || porcentajeVr === 0)
    && Number.isFinite(vrCalculado) && vrCalculado > 0
    && valorActivo > 0
  ) {
    porcentajeVr = (vrCalculado / valorActivo) * 100;
  }

  return {
    porcentajeVr: Number.isFinite(porcentajeVr) ? porcentajeVr : 0,
    vrCalculado: Number.isFinite(vrCalculado) ? vrCalculado : 0,
  };
};

/** Payload para POST /cotizaciones (totales calculados + parámetros del formulario). */
export const formDataAPayloadCotizacion = (formData, res, { empresaId, usuarioId, leadId, esEspecial = false }) => {
  const valorActivo = parseNumeroFormulario(formData.valorActivo);
  const residualInput = parseNumeroFormulario(formData.residual);
  const porcentajeVr = formData.isResidualPct
    ? residualInput
    : (valorActivo > 0 ? (residualInput / valorActivo) * 100 : 0);

  const nombreCombinado = formData.tipoArrendamiento === 'Automotriz'
    ? [formData.marca, formData.modelo, formData.version, formData.anio]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' - ')
    : formData.nombreActivo.trim();

  return {
    empresa_id: empresaId,
    lead_id: leadId || null,
    usuario_id: usuarioId,
    tipo_arrendamiento: formData.tipoArrendamiento,
    tipo_activo: formData.tipoArrendamiento === 'Automotriz' ? formData.tipoVehiculo : formData.tipoArrendamiento,
    marca: formData.tipoArrendamiento === 'Automotriz' ? formData.marca : null,
    modelo: formData.tipoArrendamiento === 'Automotriz' ? formData.modelo : null,
    version: formData.tipoArrendamiento === 'Automotriz' ? formData.version : null,
    anio: formData.tipoArrendamiento === 'Automotriz' && String(formData.anio || '').trim()
      ? parseInt(String(formData.anio).trim(), 10)
      : null,
    nombre_activo: nombreCombinado,
    valor_activo: parseNumeroFormulario(formData.valorActivo),
    plazo: parseInt(formData.plazo, 10),
    tipo_renta: 'Vencida',
    tasa_anual: parseFloat(formData.tasaAnual) || 0,
    pago_inicial_valor: parseNumeroFormulario(formData.pagoInicial),
    is_pago_inicial_pct: formData.isPagoInicialPct ? 1 : 0,
    residual_valor: parseNumeroFormulario(formData.residual),
    is_residual_pct: formData.isResidualPct ? 1 : 0,
    comision_valor: parseNumeroFormulario(formData.comision),
    is_comision_pct: formData.isComisionPct ? 1 : 0,
    seguro_valor: parseNumeroFormulario(formData.seguro),
    is_seguro_contado: formData.isSeguroContado ? 1 : 0,
    is_seguro_anual: formData.isSeguroAnual ? 1 : 0,
    gps_valor: esArrendamientoAutomotriz(formData.tipoArrendamiento)
      ? parseNumeroFormulario(formData.gps)
      : 0,
    is_gps_contado: esArrendamientoAutomotriz(formData.tipoArrendamiento) && formData.isGpsContado ? 1 : 0,
    servicios_valor: esArrendamientoAutomotriz(formData.tipoArrendamiento)
      ? parseNumeroFormulario(formData.servicios)
      : 0,
      is_rentas_deposito: formData.isRentasDeposito ? 1 : 0,
    rentas_deposito_cantidad: parseInt(formData.rentasDepositoCantidad, 10) || 0,
    rentas_deposito_valor: res.rentasDepositoValor || 0,
    porcentaje_vr: porcentajeVr,
    vr_calculado: res.residualReal,
    pago_inicial: res.pagoInicialTotal,
    renta_mensual_sin_iva: res.rentaMensualSubtotal,
    renta_mensual_con_iva: res.rentaMensualTotal,
    es_especial: esEspecial ? 1 : 0,
    num_unidades: Math.max(1, parseInt(String(formData.numUnidades || '1'), 10) || 1),
  };
};
