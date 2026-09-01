/** Mapper de snapshot GROUER → grupos de filas para el panel de solo lectura. */

export const MEDIO_PORTAL_GROUER = 'Portal GROUER';
export const ORIGEN_GROUER = 'grouer';
export const CODIGO_ENVIADO_A_FLISING = 'enviado_a_flising';
export const SIN_DATO = 'sin dato';

export const esLeadGrouerHeuristica = (lead) =>
  Boolean(lead && (lead.origen_grouer === 1 || lead.origen_grouer === true || lead.medio === MEDIO_PORTAL_GROUER));

/** Confirmado por GET detalle (`origen`); si aún no llega, usa el canal del tablero. */
export const esLeadOrigenGrouer = (lead, detalle) => {
  if (detalle && Object.prototype.hasOwnProperty.call(detalle, 'origen')) {
    return detalle.origen === ORIGEN_GROUER;
  }
  return esLeadGrouerHeuristica(lead);
};

export const leadYaEnviadoAFlising = (lead, detalle) => {
  const src = detalle && lead && detalle.id === lead.id ? detalle : lead;
  if (!src) return false;
  if (src.flising_lead_id) return true;
  if (src.estatus_codigo === CODIGO_ENVIADO_A_FLISING) return true;
  return false;
};

export const nombreAgenteFlisingAsignado = (lead, detalle) => {
  const src = detalle && lead && detalle.id === lead.id ? detalle : lead;
  return src?.agente_flising_nombre || '';
};

export const formatoMonedaGrouer = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);

const formatearNumero = (n, { enteros = false } = {}) =>
  new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: enteros ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(n);

const esVacio = (valor) => valor === null || valor === undefined || valor === '';

const numeroFinito = (valor) => {
  if (esVacio(valor)) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

const textoOSinDato = (valor) => {
  if (esVacio(valor)) return SIN_DATO;
  const texto = String(valor).trim();
  return texto === '' ? SIN_DATO : texto;
};

const monedaOSinDato = (valor) => {
  const n = numeroFinito(valor);
  return n === null ? SIN_DATO : formatoMonedaGrouer(n);
};

const enteroOSinDato = (valor) => {
  const n = numeroFinito(valor);
  return n === null ? SIN_DATO : formatearNumero(n, { enteros: true });
};

const numeroOSinDato = (valor) => {
  const n = numeroFinito(valor);
  return n === null ? SIN_DATO : formatearNumero(n);
};

/** Fracción 0–1 (a veces > 1): UI × 100 con %. No reconvierte si ya viniera en otra unidad. */
const fraccionAPct = (valor) => {
  const n = numeroFinito(valor);
  if (n === null) return SIN_DATO;
  return `${formatearNumero(n * 100)}%`;
};

const pareceFraccion = (n) => Number.isFinite(n) && Math.abs(n) <= 1;

/** `tasa_promedio`: ×100 % si parece fracción; si no, el número tal cual con %. */
const tasaReferencia = (valor) => {
  const n = numeroFinito(valor);
  if (n === null) return SIN_DATO;
  const pct = pareceFraccion(n) ? n * 100 : n;
  return `${formatearNumero(pct)}%`;
};

/** Renta / flujo mínimo: múltiplo (`1.4×`), no porcentaje. */
const multiploOSinDato = (valor) => {
  const n = numeroFinito(valor);
  if (n === null) return SIN_DATO;
  return `${formatearNumero(n)}×`;
};

const plazoOSinDato = (valor) => {
  const n = numeroFinito(valor);
  if (n === null) return SIN_DATO;
  const entero = formatearNumero(n, { enteros: true });
  return `${entero} ${n === 1 ? 'mes' : 'meses'}`;
};

const objetoOVacio = (valor) =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};

const fila = (etiqueta, valor, extras = {}) => ({ etiqueta, valor, ...extras });

const boolSiNo = (valor) => {
  if (esVacio(valor)) return SIN_DATO;
  if (valor === true || valor === 1 || valor === '1') return 'Sí';
  if (valor === false || valor === 0 || valor === '0') return 'No';
  return textoOSinDato(valor);
};

/**
 * Feature missing → gris «sin dato», no rojo.
 * `ok: true` → ok; `ok: false` → rojo.
 */
export const estadoSemaforo = (item) => {
  if (!item || typeof item !== 'object') return 'sin_dato';
  if (item.ok === true || item.ok === 1 || item.ok === '1') return 'ok';
  if (item.ok === false || item.ok === 0 || item.ok === '0') return 'rojo';
  return 'sin_dato';
};

const textoSemaforo = (clave, item) => {
  if (!item || typeof item !== 'object') return SIN_DATO;
  if (clave === 'inactividad_cfdi') {
    const n = numeroFinito(item.valor_meses);
    if (n === null) return SIN_DATO;
    return `${formatearNumero(n, { enteros: true })} ${n === 1 ? 'mes' : 'meses'}`;
  }
  if (clave === 'insolvencia_contable') return boolSiNo(item.valor);
  return textoOSinDato(item.valor);
};

const SEMAFOROS_UI = [
  { clave: 'estatus_sat', etiqueta: 'Estatus SAT' },
  { clave: 'opinion_sat', etiqueta: 'Opinión SAT' },
  { clave: 'lista_69b', etiqueta: '69-B' },
  { clave: 'insolvencia_contable', etiqueta: 'Insolvencia' },
  { clave: 'inactividad_cfdi', etiqueta: 'Inactividad CFDI' },
];

/**
 * Filas de solo lectura a partir del snapshot curado (GET /leads/:id/detalle).
 * Null/undefined → «sin dato». No pinta buró, tasa_de ni version_features.
 */
export function construirFilasDetalleProspectoGrouer(snapshot) {
  const snap = objetoOVacio(snapshot);
  const contacto = objetoOVacio(snap.contacto);
  const identidad = objetoOVacio(snap.identidad);
  const domicilio = objetoOVacio(identidad.domicilio);
  const semaforos = objetoOVacio(snap.semaforos);
  const activo = objetoOVacio(snap.activo);
  const deal = objetoOVacio(snap.deal);
  const viabilidad = objetoOVacio(snap.viabilidad);

  const grupos = [
    {
      id: 'contacto',
      titulo: 'Contacto',
      filas: [
        fila('Nombre portal', textoOSinDato(contacto.nombre_portal), { ancho: 'full' }),
        fila('Email', textoOSinDato(contacto.email)),
        fila('Teléfono', textoOSinDato(contacto.telefono)),
      ],
    },
    {
      id: 'identidad',
      titulo: 'Identidad',
      filas: [
        fila('Razón social', textoOSinDato(identidad.razon_social), { ancho: 'full' }),
        fila('Tipo de persona', textoOSinDato(identidad.tipo_persona)),
        fila('Régimen fiscal', textoOSinDato(identidad.regimen_fiscal)),
        fila('Estatus contribuyente', textoOSinDato(identidad.estatus_contribuyente), { ancho: 'full' }),
      ],
    },
    {
      id: 'domicilio',
      titulo: 'Domicilio',
      filas: [
        fila('Calle', textoOSinDato(domicilio.calle), { ancho: 'full' }),
        fila('Colonia', textoOSinDato(domicilio.colonia)),
        fila('Municipio', textoOSinDato(domicilio.municipio)),
        fila('Estado', textoOSinDato(domicilio.estado)),
        fila('CP', textoOSinDato(domicilio.cp)),
      ],
    },
    {
      id: 'semaforos',
      titulo: 'Semáforos SAT',
      tipo: 'semaforos',
      filas: SEMAFOROS_UI.map(({ clave, etiqueta }) =>
        fila(etiqueta, textoSemaforo(clave, semaforos[clave]), {
          estado: estadoSemaforo(semaforos[clave]),
        }),
      ),
    },
    {
      id: 'activo',
      titulo: 'Activo',
      filas: [
        fila('Tipo', textoOSinDato(activo.tipo_activo)),
        fila('Nombre', textoOSinDato(activo.nombre_activo)),
        fila('Marca', textoOSinDato(activo.marca)),
        fila('Modelo', textoOSinDato(activo.modelo)),
        fila('Versión', textoOSinDato(activo.version)),
        fila('Año', enteroOSinDato(activo.anio)),
        fila('Color', textoOSinDato(activo.color)),
        fila('Condición', textoOSinDato(activo.condicion)),
      ],
    },
    {
      id: 'deal',
      titulo: 'Deal',
      filas: [
        fila('Valor activo', monedaOSinDato(deal.valor_activo), { destacado: true, ancho: 'full' }),
        fila('Pago inicial', monedaOSinDato(deal.pago_inicial)),
        fila('Enganche', fraccionAPct(deal.enganche_pct)),
        fila('Monto financiado', monedaOSinDato(deal.monto_financiado), { ancho: 'full' }),
        fila('Plazo', plazoOSinDato(deal.plazo)),
        fila('Renta mín.', monedaOSinDato(deal.renta_min)),
        fila('Renta máx.', monedaOSinDato(deal.renta_max)),
        fila('Tasa de referencia', tasaReferencia(deal.tasa_promedio), { ancho: 'full' }),
      ],
    },
    {
      id: 'viabilidad',
      titulo: 'Viabilidad',
      tipo: 'viabilidad',
      filas: [
        fila('Facturación neta 12 meses', monedaOSinDato(viabilidad.facturacion_neta_12m), { ancho: 'full' }),
        fila('Meses con flujo menor a la renta', enteroOSinDato(viabilidad.meses_flujo_menor_renta_12m), { ancho: 'full' }),
        fila('Renta / flujo mínimo 12m', multiploOSinDato(viabilidad.renta_sobre_flujo_min_12m)),
        fila('Renta / egresos promedio 12m', fraccionAPct(viabilidad.ratio_renta_sobre_outflow_12m)),
        fila('Meses con flujo negativo (12m)', enteroOSinDato(viabilidad.meses_flujo_negativo_12m), { ancho: 'full' }),
        fila('LTV', fraccionAPct(viabilidad.ltv)),
        fila('Razón circulante', numeroOSinDato(viabilidad.current_ratio)),
        fila('Apalancamiento', numeroOSinDato(viabilidad.apalancamiento)),
        fila('Cobertura fiscal', fraccionAPct(viabilidad.cobertura_fiscal)),
        fila('Cliente principal', fraccionAPct(viabilidad.concentracion_top_cliente_pct)),
        fila('Margen CFDI', fraccionAPct(viabilidad.margen_cfdi)),
        fila('Antigüedad (meses)', enteroOSinDato(viabilidad.antiguedad_empresa_meses)),
      ],
    },
  ];

  return { grupos };
}
