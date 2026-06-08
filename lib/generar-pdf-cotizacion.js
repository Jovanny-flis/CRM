const { calcularResultadosCotizacion } = require('./cotizacion-calculo');
const {
  cotizacionAFormData,
  normalizarFormDataPdf,
  nombreArchivoPdfCotizacion,
  validarCotizacionParaPdf,
  validarFormularioVivoParaPdf,
} = require('./cotizacion-formulario-pdf');
const {
  construirDocumentoPdfCotizacion,
  documentoPdfCotizacionABuffer,
} = require('./pdf-cotizacion-documento');

const prepararDatosPdf = ({ formData, folio, nombreProspecto }) => {
  const normalizado = normalizarFormDataPdf(formData);
  const nombreCliente = String(nombreProspecto || normalizado.nombre_cliente || '').trim();

  const validacionBasica = validarFormularioVivoParaPdf(normalizado, nombreCliente);
  if (validacionBasica) {
    const err = new Error(validacionBasica);
    err.status = 400;
    throw err;
  }

  const { res, errores } = calcularResultadosCotizacion(normalizado);
  if (Object.keys(errores).length > 0) {
    const err = new Error('Corrige los errores del cotizador antes de generar el PDF.');
    err.status = 400;
    err.detalle = errores;
    throw err;
  }

  const docDefinition = construirDocumentoPdfCotizacion({
    formData: normalizado,
    res,
    folio,
    nombreProspecto: nombreCliente,
  });

  const nombreArchivo = nombreArchivoPdfCotizacion(folio, nombreCliente);

  return { docDefinition, nombreArchivo };
};

const generarPdfDesdeFormulario = async ({ formData, folio = null, nombreProspecto }) => {
  const { docDefinition, nombreArchivo } = prepararDatosPdf({ formData, folio, nombreProspecto });
  const buffer = await documentoPdfCotizacionABuffer(docDefinition);
  return { buffer, nombreArchivo };
};

const generarPdfDesdeCotizacion = async (cot, nombreProspecto) => {
  const validacion = validarCotizacionParaPdf(cot);
  if (validacion) {
    const err = new Error(validacion);
    err.status = 400;
    throw err;
  }

  const formData = cotizacionAFormData(cot);
  const nombre = String(nombreProspecto || cot.lead_nombre || '').trim();
  if (!nombre) {
    const err = new Error('Esta cotización debe estar vinculada a un prospecto para generar el PDF.');
    err.status = 400;
    throw err;
  }
  return generarPdfDesdeFormulario({
    formData,
    folio: cot.folio,
    nombreProspecto: nombre,
  });
};

module.exports = {
  generarPdfDesdeFormulario,
  generarPdfDesdeCotizacion,
};
