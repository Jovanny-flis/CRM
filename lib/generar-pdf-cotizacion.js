const puppeteer = require('puppeteer');
const { calcularResultadosCotizacion } = require('./cotizacion-calculo');
const { opcionesLanzamientoPuppeteer } = require('./puppeteer-config');
const {
  cotizacionAFormData,
  normalizarFormDataPdf,
  nombreArchivoPdfCotizacion,
  validarCotizacionParaPdf,
  validarFormularioVivoParaPdf,
} = require('./cotizacion-formulario-pdf');
const { PDF_ANCHO_PX, construirHtmlPdfCotizacion } = require('./pdf-cotizacion-html');

let browserPromise = null;

const lanzarNavegador = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const opciones = await opcionesLanzamientoPuppeteer();
      return puppeteer.launch(opciones);
    })().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

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

  const html = construirHtmlPdfCotizacion({
    formData: normalizado,
    res,
    folio,
    nombreProspecto: nombreCliente,
  });

  const nombreArchivo = nombreArchivoPdfCotizacion(folio, nombreCliente);

  return { html, nombreArchivo };
};

const htmlAPdfBuffer = async (html) => {
  const browser = await lanzarNavegador();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: PDF_ANCHO_PX, height: 1122, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await page.close();
  }
};

const generarPdfDesdeFormulario = async ({ formData, folio = null, nombreProspecto }) => {
  const { html, nombreArchivo } = prepararDatosPdf({ formData, folio, nombreProspecto });
  const buffer = await htmlAPdfBuffer(html);
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

const cerrarNavegadorPdf = async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    browserPromise = null;
    await browser.close();
  }
};

module.exports = {
  generarPdfDesdeFormulario,
  generarPdfDesdeCotizacion,
  cerrarNavegadorPdf,
};
