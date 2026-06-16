const TIPOS_VEHICULO = ['Sedan', 'SUV', 'Camionetas', 'Lujo', 'Tractocamion', 'Autobus'];
const VARIANTE_IMAGEN_ACTIVO_PDF = 'blanco';

const SLUG_IMAGEN_ACTIVO_PDF = {
  Sedan: 'sedan',
  SUV: 'suv',
  Camionetas: 'camionetas',
  Lujo: 'lujo',
  Tractocamion: 'tractocamion',
  Autobus: 'autobus',
  Otro: 'otro',
};

const parseNumeroFormulario = (val) => {
  const s = String(val ?? '').trim().replace(/,/g, '');
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const formatMontoEnFormulario = (val) => {
  if (!val) return '';
  let rawValue = val.toString().replace(/[^0-9.]/g, '');
  const parts = rawValue.split('.');
  if (parts.length > 2) rawValue = parts[0] + '.' + parts.slice(1).join('');
  const [enteros, decimales] = rawValue.split('.');
  const enterosFormateados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimales !== undefined ? `${enterosFormateados}.${decimales}` : enterosFormateados;
};

const boolDesdeBd = (v, defecto = true) => {
  if (v === null || v === undefined) return defecto;
  return v === true || v === 1 || v === '1';
};

const numeroAString = (v) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
};

const inferirTipoArrendamiento = (cot) => {
  if (cot.tipo_arrendamiento) return cot.tipo_arrendamiento;
  if (cot.marca || cot.modelo || cot.version || cot.anio) return 'Automotriz';
  if (TIPOS_VEHICULO.includes(cot.tipo_activo)) return 'Automotriz';
  if (cot.tipo_activo === 'Otro') return 'Otro';
  return 'Automotriz';
};

const archivoImagenActivoPdf = ({ tipoArrendamiento, tipoVehiculo }) => {
  const tipo = tipoArrendamiento === 'Automotriz' ? tipoVehiculo : 'Otro';
  const slug = SLUG_IMAGEN_ACTIVO_PDF[tipo] || SLUG_IMAGEN_ACTIVO_PDF.Sedan;
  return `${slug}_${VARIANTE_IMAGEN_ACTIVO_PDF}.png`;
};

const cotizacionAFormData = (cot) => {
  const base = {
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
  };

  if (!cot) return base;

  const tipoArrendamiento = inferirTipoArrendamiento(cot);
  const tipoVehiculo = TIPOS_VEHICULO.includes(cot.tipo_activo) ? cot.tipo_activo : 'Sedan';
  const automotriz = tipoArrendamiento === 'Automotriz';
  const tieneParametros = cot.tasa_anual != null;

  return {
    ...base,
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

const normalizarFormDataPdf = (formData) => ({
  ...formData,
  isPagoInicialPct: boolDesdeBd(formData.isPagoInicialPct, true),
  isResidualPct: boolDesdeBd(formData.isResidualPct, true),
  isComisionPct: boolDesdeBd(formData.isComisionPct, true),
  isSeguroContado: boolDesdeBd(formData.isSeguroContado, true),
  isSeguroAnual: boolDesdeBd(formData.isSeguroAnual, true),
  isGpsContado: boolDesdeBd(formData.isGpsContado, true),
  isRentasDeposito: formData.isRentasDeposito === true,
});

const folioEtiqueta = (folio) =>
  (folio != null && folio !== '' ? `FL-${String(folio).padStart(3, '0')}` : null);

const folioCodigoArchivo = (folio) => {
  if (folio == null || folio === '') return null;
  return `FL${String(folio).padStart(3, '0')}`;
};

const sanitizarNombreArchivo = (texto) =>
  String(texto || 'Prospecto')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\u00C0-\u024F-]/g, '')
    .slice(0, 80) || 'Prospecto';

const nombreArchivoPdfCotizacion = (folio, nombreProspecto) => {
  const codigo = folioCodigoArchivo(folio);
  const nombre = sanitizarNombreArchivo(nombreProspecto);
  return codigo ? `${codigo}_${nombre}.pdf` : `Cotizacion_${nombre}.pdf`;
};

const validarCotizacionParaPdf = (cot) => {
  if (!cot?.lead_id) {
    return 'Esta cotización debe estar vinculada a un prospecto para generar el PDF.';
  }
  if (cot.tasa_anual == null) {
    return 'Esta cotización no tiene parámetros financieros guardados (registro antiguo). Crea una cotización nueva desde el cotizador para poder generar el PDF.';
  }
  return null;
};

const validarFormularioVivoParaPdf = (formData, nombreProspecto) => {
  const nombre = String(nombreProspecto || formData?.nombre_cliente || '').trim();
  if (!nombre) {
    return 'Indica el nombre del cliente antes de generar el PDF.';
  }
  const valor = parseNumeroFormulario(formData.valorActivo);
  if (!valor || valor <= 0) {
    return 'Indica un valor de activo válido antes de generar el PDF.';
  }
  return null;
};

module.exports = {
  TIPOS_VEHICULO,
  parseNumeroFormulario,
  archivoImagenActivoPdf,
  cotizacionAFormData,
  normalizarFormDataPdf,
  folioEtiqueta,
  nombreArchivoPdfCotizacion,
  validarCotizacionParaPdf,
  validarFormularioVivoParaPdf,
};
