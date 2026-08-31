import api from '../api';

const NOMBRE_POR_DEFECTO = 'informe-grouer.pdf';
const MENSAJE_NO_DISPONIBLE = 'El informe PDF no está disponible para este prospecto.';
const MENSAJE_NO_EXISTE = 'El informe PDF aún no está disponible. Intenta más tarde.';
const MENSAJE_GENERICO = 'No se pudo descargar el informe GROUER.';

const extraerNombreArchivo = (contentDisposition) => {
  if (!contentDisposition) return null;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
  const raw = match?.[1] || match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
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

const parsearCuerpoError = async (data) => {
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }
  if (data && typeof data === 'object') return data;
  if (typeof data === 'string' && data) {
    try {
      return JSON.parse(data);
    } catch {
      return { error: data };
    }
  }
  return {};
};

const errorDesdeRespuestaPdf = async (error) => {
  const status = error.response?.status;
  const cuerpo = await parsearCuerpoError(error.response?.data);
  const code = cuerpo.code;
  if (status === 409 || code === 'pdf_no_disponible') {
    return new Error(cuerpo.error || MENSAJE_NO_DISPONIBLE);
  }
  if (status === 404) {
    return new Error(cuerpo.error || MENSAJE_NO_EXISTE);
  }
  return new Error(cuerpo.error || error.message || MENSAJE_GENERICO);
};

/** GET /api/leads/:id/informe-grouer.pdf (Bearer vía interceptor). Nunca llama a GROUER ni a riesgos. */
export async function descargarInformeGrouer(leadId) {
  if (!leadId) {
    throw new Error('No se encontró el prospecto para descargar el informe.');
  }
  try {
    const response = await api.get(`/leads/${leadId}/informe-grouer.pdf`, {
      responseType: 'blob',
    });
    const nombre = extraerNombreArchivo(response.headers['content-disposition'])
      || NOMBRE_POR_DEFECTO;
    descargarBlobPdf(response.data, nombre);
  } catch (error) {
    throw await errorDesdeRespuestaPdf(error);
  }
}
