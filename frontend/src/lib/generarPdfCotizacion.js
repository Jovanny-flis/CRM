import api from '../api';

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

/** Misma convención que el backend: FL001_NombreCliente.pdf */
export const nombreArchivoPdfCotizacion = (folio, nombreProspecto) => {
  const codigo = folioCodigoArchivo(folio);
  const nombre = sanitizarNombreArchivo(nombreProspecto);
  return codigo ? `${codigo}_${nombre}.pdf` : `Cotizacion_${nombre}.pdf`;
};

const extraerNombreArchivo = (contentDisposition) => {
  if (!contentDisposition) return null;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
  const raw = match?.[1] || match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const resolverNombreArchivoPdf = (contentDisposition, { folio, nombreProspecto } = {}) => {
  const nombre = String(nombreProspecto ?? '').trim();
  if (nombre) {
    return nombreArchivoPdfCotizacion(folio ?? null, nombre);
  }
  return extraerNombreArchivo(contentDisposition) || 'Cotizacion.pdf';
};

const extraerErrorBlob = async (blob) => {
  const text = await blob.text();
  try {
    const json = JSON.parse(text);
    return json.error || text;
  } catch {
    return text || 'Error al generar el PDF.';
  }
};

const manejarErrorPdf = async (error) => {
  if (error.response?.data instanceof Blob) {
    throw new Error(await extraerErrorBlob(error.response.data));
  }
  if (error.response?.data?.error) {
    throw new Error(error.response.data.error);
  }
  throw error;
};

const descargarBlobPdf = (blob, nombreArchivo) => {
  const url = window.URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.URL.revokeObjectURL(url);
};

/** PDF desde registro guardado (historial, leads, modal detalle). */
export async function descargarPdfPorCotizacionId(
  cotizacionId,
  { nombreProspecto, folio } = {},
) {
  try {
    const params = nombreProspecto ? { nombre_prospecto: nombreProspecto } : {};
    const response = await api.get(`/cotizaciones/${cotizacionId}/pdf`, {
      params,
      responseType: 'blob',
    });
    const nombre = resolverNombreArchivoPdf(response.headers['content-disposition'], {
      folio,
      nombreProspecto,
    });
    descargarBlobPdf(response.data, nombre);
  } catch (error) {
    throw await manejarErrorPdf(error);
  }
}

/** PDF en vivo desde el cotizador (sin folio; no persiste). */
export async function descargarPdfPreview(formData, { modoCotizacionEspecial = false, sufijoUnidad = null } = {}) {
  try {
    const response = await api.post(
      '/cotizaciones/pdf',
      {
        formData,
        nombre_prospecto: formData.nombre_cliente,
        modo_cotizacion_especial: modoCotizacionEspecial,
      },
      { responseType: 'blob' },
    );
    let nombre = resolverNombreArchivoPdf(response.headers['content-disposition'], {
      folio: null,
      nombreProspecto: formData.nombre_cliente,
    });
    if (sufijoUnidad != null) {
      nombre = nombre.replace(/\.pdf$/i, `_U${sufijoUnidad}.pdf`);
    }
    descargarBlobPdf(response.data, nombre);
  } catch (error) {
    throw await manejarErrorPdf(error);
  }
}

/** Atajo cuando ya tienes el objeto cotización (id + lead_nombre). */
export async function generarPdfDesdeCotizacion(cot, nombreProspecto) {
  if (!cot?.id) {
    throw new Error('No se encontró la cotización para generar el PDF.');
  }
  await descargarPdfPorCotizacionId(cot.id, {
    nombreProspecto: nombreProspecto || cot.lead_nombre,
    folio: cot.folio,
  });
}
