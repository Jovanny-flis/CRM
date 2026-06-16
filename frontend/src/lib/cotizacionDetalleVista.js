import {
  cotizacionAFormData,
  derivarPorcentajeYVr,
  esArrendamientoAutomotriz,
} from './cotizacionFormulario';

export const formatoMonedaCotizacion = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto ?? 0);

export const folioEtiqueta = (folio) =>
  folio != null && folio !== '' ? `FL-${String(folio).padStart(3, '0')}` : '—';

const boolDesdeBd = (v, defecto = false) => {
  if (v === null || v === undefined) return defecto;
  return v === true || v === 1 || v === '1';
};

const valorOGuion = (valor, formatear = (n) => String(n)) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return formatear(n);
};

const valorConModoPct = (valor, esPct) => {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return esPct ? `${n}%` : formatoMonedaCotizacion(n);
};

const formatPorcentajeVr = (n) => {
  if (!Number.isFinite(n)) return '—';
  const redondeado = Math.round(n * 100) / 100;
  return `${redondeado}%`;
};

const etiquetaModoSeguro = (cot) => {
  const partes = [];
  if (boolDesdeBd(cot.is_seguro_contado, true)) partes.push('Contado');
  else partes.push('Financiado');
  if (boolDesdeBd(cot.is_seguro_anual, true)) partes.push('anual');
  else partes.push('al plazo');
  return partes.join(', ');
};

const etiquetaModoGps = (cot) =>
  (boolDesdeBd(cot.is_gps_contado, true) ? 'Contado' : 'Financiado');

/**
 * Filas de solo lectura para el panel de detalle (datos persistidos en BD).
 */
export function construirFilasDetalleCotizacion(cot) {
  if (!cot) {
    return {
      parametrosGrupos: [],
      totales: [],
      kpis: [],
      tieneParametros: false,
      automotriz: true,
      productoResumen: '',
    };
  }

  const fd = cotizacionAFormData(cot);
  const automotriz = esArrendamientoAutomotriz(fd.tipoArrendamiento);
  const tieneParametros = cot.tasa_anual != null;
  const productoResumen = cot.nombre_activo || cot.tipo_activo || '—';
  const { porcentajeVr, vrCalculado } = derivarPorcentajeYVr(cot);

  const grupoActivo = [
    { etiqueta: 'Tipo de arrendamiento', valor: fd.tipoArrendamiento, ancho: 'full' },
    ...(automotriz
      ? [{ etiqueta: 'Tipo de vehículo', valor: fd.tipoVehiculo || '—' }]
      : [{ etiqueta: 'Nombre del activo', valor: fd.nombreActivo || cot.nombre_activo || '—', ancho: 'full' }]),
    { etiqueta: 'Producto / activo', valor: productoResumen, ancho: 'full' },
    ...(automotriz
      ? [
          { etiqueta: 'Marca', valor: fd.marca || '—' },
          { etiqueta: 'Modelo', valor: fd.modelo || '—' },
          { etiqueta: 'Versión', valor: fd.version || '—' },
          { etiqueta: 'Año', valor: fd.anio || '—' },
        ]
      : []),
    {
      etiqueta: 'Valor del bien',
      valor: valorOGuion(cot.valor_activo, formatoMonedaCotizacion),
      destacado: true,
    },
  ];

  const grupoCondiciones = [
    { etiqueta: 'Plazo', valor: cot.plazo != null ? `${cot.plazo} meses` : '—' },
    {
      etiqueta: 'Tasa anual',
      valor: tieneParametros ? valorOGuion(cot.tasa_anual, (n) => `${n}%`) : 'No registrado',
    },
    { etiqueta: 'Tipo de renta', valor: cot.tipo_renta || 'Vencida' },
    {
      etiqueta: 'Pago inicial (parámetro)',
      valor: tieneParametros
        ? valorConModoPct(cot.pago_inicial_valor, boolDesdeBd(cot.is_pago_inicial_pct, true))
        : 'No registrado',
    },
    {
      etiqueta: 'Residual (parámetro)',
      valor: tieneParametros
        ? valorConModoPct(cot.residual_valor, boolDesdeBd(cot.is_residual_pct, true))
        : valorOGuion(cot.porcentaje_vr, (n) => `${n}%`),
    },
  ];

  const grupoExtras = [
    {
      etiqueta: 'Comisión',
      valor: cot.comision_valor != null
        ? valorConModoPct(cot.comision_valor, boolDesdeBd(cot.is_comision_pct, true))
        : '—',
    },
    {
      etiqueta: 'Seguro',
      valor: cot.seguro_valor != null
        ? `${formatoMonedaCotizacion(cot.seguro_valor)} (${etiquetaModoSeguro(cot)})`
        : '—',
      ancho: 'full',
    },
  ];

  if (automotriz) {
    grupoExtras.push(
      {
        etiqueta: 'GPS',
        valor: cot.gps_valor != null && Number(cot.gps_valor) !== 0
          ? `${formatoMonedaCotizacion(cot.gps_valor)} (${etiquetaModoGps(cot)})`
          : '—',
      },
      {
        etiqueta: 'Trámites y servicios',
        valor: cot.servicios_valor != null
          ? formatoMonedaCotizacion(cot.servicios_valor)
          : '—',
      },
    );
  }

  grupoExtras.push({
    etiqueta: 'Rentas en depósito',
    valor: boolDesdeBd(cot.is_rentas_deposito, false)
      ? `Sí (${cot.rentas_deposito_cantidad ?? 0} renta(s))`
      : 'No',
  });

  const parametrosGrupos = [
    { id: 'activo', titulo: 'Activo', filas: grupoActivo },
    { id: 'condiciones', titulo: 'Condiciones', filas: grupoCondiciones },
    { id: 'extras', titulo: 'Extras', filas: grupoExtras },
  ];

  const rentaSinIva = Number(cot.renta_mensual_sin_iva);
  const rentaConIva = Number(cot.renta_mensual_con_iva);
  const ivaRenta = Number.isFinite(rentaConIva) && Number.isFinite(rentaSinIva)
    ? rentaConIva - rentaSinIva
    : null;

  const pagoInicialTotal = Number(cot.pago_inicial);
  const pagoInicialSinIva = Number.isFinite(pagoInicialTotal)
    ? pagoInicialTotal / 1.16
    : null;
  const ivaPagoInicial = Number.isFinite(pagoInicialTotal) && Number.isFinite(pagoInicialSinIva)
    ? pagoInicialTotal - pagoInicialSinIva
    : null;

  const kpis = [
    {
      id: 'renta',
      etiqueta: 'Renta mensual',
      valor: valorOGuion(cot.renta_mensual_con_iva, formatoMonedaCotizacion),
      acento: 'blue',
    },
    {
      id: 'inicial',
      etiqueta: 'Pago inicial',
      valor: valorOGuion(cot.pago_inicial, formatoMonedaCotizacion),
      acento: 'emerald',
    },
    {
      id: 'valor',
      etiqueta: 'Valor del bien',
      valor: valorOGuion(cot.valor_activo, formatoMonedaCotizacion),
      acento: 'slate',
    },
  ];

  const totales = [
    {
      id: 'desembolso',
      grupo: 'Desembolso inicial',
      subtitulo: 'Totales guardados',
      tema: 'naranja',
      filas: [
        ...(boolDesdeBd(cot.is_rentas_deposito, false) && cot.rentas_deposito_valor != null
          ? [{
              etiqueta: 'Rentas en depósito',
              valor: formatoMonedaCotizacion(cot.rentas_deposito_valor),
              destacado: false,
            }]
          : []),
        {
          etiqueta: 'Subtotal (sin IVA)',
          valor: valorOGuion(pagoInicialSinIva, formatoMonedaCotizacion),
          destacado: false,
        },
        {
          etiqueta: 'IVA',
          valor: valorOGuion(ivaPagoInicial, formatoMonedaCotizacion),
          destacado: false,
        },
        {
          etiqueta: 'Total inicial',
          valor: valorOGuion(cot.pago_inicial, formatoMonedaCotizacion),
          destacado: true,
        },
      ],
    },
    {
      id: 'renta',
      grupo: 'Renta mensual',
      subtitulo: 'Totales guardados',
      tema: 'azul',
      filas: [
        {
          etiqueta: 'Subtotal (sin IVA)',
          valor: valorOGuion(cot.renta_mensual_sin_iva, formatoMonedaCotizacion),
          destacado: false,
        },
        {
          etiqueta: 'IVA',
          valor: valorOGuion(ivaRenta, formatoMonedaCotizacion),
          destacado: false,
        },
        {
          etiqueta: 'Renta mensual',
          valor: valorOGuion(cot.renta_mensual_con_iva, formatoMonedaCotizacion),
          destacado: true,
          claseValor: 'text-blue-400',
        },
      ],
    },
    {
      id: 'residual',
      grupo: 'Valor residual',
      subtitulo: 'Al término del plazo',
      tema: 'slate',
      filas: [
        {
          etiqueta: 'Porcentaje VR',
          valor: valorOGuion(porcentajeVr, formatPorcentajeVr),
          destacado: false,
        },
        {
          etiqueta: 'VR calculado',
          valor: valorOGuion(vrCalculado, formatoMonedaCotizacion),
          destacado: true,
        },
      ],
    },
  ];

  return {
    parametrosGrupos,
    totales,
    kpis,
    tieneParametros,
    automotriz,
    plazo: cot.plazo,
    folio: cot.folio,
    productoResumen,
  };
}
