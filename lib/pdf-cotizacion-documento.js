const fs = require('fs');
const path = require('path');
const pdfmake = require('pdfmake');
const {
  parseNumeroFormulario,
  archivoImagenActivoPdf,
  folioEtiqueta,
} = require('./cotizacion-formulario-pdf');
const { logoFlisingBase64, imagenActivoBase64 } = require('./pdf-cotizacion-assets');

const FUENTES_ROBOTO = {
  Roboto: {
    normal: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-Regular.ttf'),
    bold: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-Medium.ttf'),
    italics: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '..', 'node_modules', 'pdfmake', 'fonts', 'Roboto', 'Roboto-MediumItalic.ttf'),
  },
};

pdfmake.setFonts(FUENTES_ROBOTO);
pdfmake.setLocalAccessPolicy(() => true);

const MARGEN_H = 18;
const ANCHO_LOGO_PDF = 100;
const ALTURA_LOGO_PDF = Math.round(ANCHO_LOGO_PDF * (1337 / 2363));
const PADDING_BANDA_INFERIOR = 4;
const ALTURA_BANDA_INFERIOR = ALTURA_LOGO_PDF + PADDING_BANDA_INFERIOR * 2;
const COLOR_HEADER = '#2c2c2c';
const COLOR_ACENTO = '#ea5533';
const MARGEN_FILA_TABLA = [8, 2, 4, 2];
const MARGEN_VALOR_TABLA = [4, 2, 8, 2];
const MARGEN_ENCABEZADO_TABLA = [8, 3, 8, 3];
const TAMANO_FUENTE_TABLA = 7.5;
const MARGEN_FILA_CLIENTE = [0, 1, 0, 1];

const formatoMonedaPdf = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);

const armarNombreActivoAutomotriz = ({ marca, modelo, version, anio }) =>
  [marca, modelo, version, anio]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' - ');

/** Convierte data URI o ruta de archivo a nodo imagen pdfmake. */
const aNodoImagen = (src, ancho, alto) => {
  if (!src) return null;

  let dataUri = String(src);
  if (!dataUri.startsWith('data:')) {
    if (!fs.existsSync(dataUri)) return null;
    const buf = fs.readFileSync(dataUri);
    const ext = path.extname(dataUri).slice(1).toLowerCase();
    const mime = ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : 'application/octet-stream';
    dataUri = `data:${mime};base64,${buf.toString('base64')}`;
  }

  const nodo = { image: dataUri, width: ancho };
  if (alto != null) nodo.height = alto;
  return nodo;
};

const layoutTablaFinanciera = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

const filaMonto = (etiqueta, monto, alternado = false) => {
  const fondo = alternado ? '#f9f9f9' : null;
  const estiloCelda = {
    fillColor: fondo,
    border: [false, false, false, true],
    borderColor: ['#eeeeee'],
    margin: MARGEN_FILA_TABLA,
    fontSize: TAMANO_FUENTE_TABLA,
    lineHeight: 1,
  };
  const valorTexto = typeof monto === 'string' ? monto : formatoMonedaPdf(monto);

  return [
    { text: etiqueta, ...estiloCelda },
    {
      text: valorTexto,
      alignment: 'right',
      ...estiloCelda,
      margin: MARGEN_VALOR_TABLA,
      noWrap: true,
    },
  ];
};

const construirTablaFinanciera = ({
  titulo,
  tituloColor,
  filas,
  subtotalValor,
  ivaValor,
  pieLabel,
  pieValor,
}) => {
  const body = [
    [{
      text: titulo,
      colSpan: 2,
      fillColor: tituloColor,
      color: '#ffffff',
      bold: true,
      fontSize: 8,
      margin: MARGEN_ENCABEZADO_TABLA,
      lineHeight: 1,
    }, {}],
  ];

  filas.forEach(({ etiqueta, monto }, indice) => {
    body.push(filaMonto(etiqueta, monto, indice % 2 === 1));
  });

  body.push(
    [{
      text: 'Subtotal',
      bold: true,
      border: [false, false, false, 2],
      borderColor: ['#cccccc'],
      margin: MARGEN_FILA_TABLA,
      fontSize: TAMANO_FUENTE_TABLA,
      lineHeight: 1,
    }, {
      text: formatoMonedaPdf(subtotalValor),
      bold: true,
      alignment: 'right',
      border: [false, false, false, 2],
      borderColor: ['#cccccc'],
      margin: MARGEN_VALOR_TABLA,
      fontSize: TAMANO_FUENTE_TABLA,
      lineHeight: 1,
      noWrap: true,
    }],
    [{
      text: 'IVA',
      fillColor: '#f9f9f9',
      margin: MARGEN_FILA_TABLA,
      fontSize: TAMANO_FUENTE_TABLA,
      lineHeight: 1,
    }, {
      text: formatoMonedaPdf(ivaValor),
      alignment: 'right',
      fillColor: '#f9f9f9',
      margin: MARGEN_VALOR_TABLA,
      fontSize: TAMANO_FUENTE_TABLA,
      lineHeight: 1,
      noWrap: true,
    }],
    [{
      colSpan: 2,
      columns: [
        { text: pieLabel, color: '#ffffff', bold: true, fontSize: TAMANO_FUENTE_TABLA, width: '*' },
        {
          text: `${formatoMonedaPdf(pieValor)} MXN`,
          color: '#ffffff',
          bold: true,
          fontSize: TAMANO_FUENTE_TABLA,
          alignment: 'right',
          width: 'auto',
          noWrap: true,
        },
      ],
      fillColor: tituloColor,
      margin: MARGEN_ENCABEZADO_TABLA,
      lineHeight: 1,
    }, {}],
  );

  return {
    table: { widths: ['*', 'auto'], body },
    layout: layoutTablaFinanciera,
  };
};

const construirDocumentoPdfCotizacion = ({ formData, res, folio, nombreProspecto }) => {
  const nombreCliente = String(nombreProspecto || '').trim() || 'A quien corresponda';
  const nombreCombinado = formData.tipoArrendamiento === 'Automotriz'
    ? armarNombreActivoAutomotriz(formData)
    : String(formData.nombreActivo || '').trim();

  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const logoSrc = logoFlisingBase64();
  const imagenActivoSrc = imagenActivoBase64(archivoImagenActivoPdf(formData));

  const logoHeader = aNodoImagen(logoSrc, ANCHO_LOGO_PDF);
  const logoFooter = aNodoImagen(logoSrc, ANCHO_LOGO_PDF, ALTURA_LOGO_PDF);
  const imagenActivo = aNodoImagen(imagenActivoSrc, 150);

  const etiquetaFolio = folioEtiqueta(folio);
  const tituloCotizacion = etiquetaFolio ? `COTIZACIÓN - ${etiquetaFolio}` : 'COTIZACIÓN';

  const tablaPagoInicial = construirTablaFinanciera({
    titulo: 'PAGO INICIAL',
    tituloColor: COLOR_ACENTO,
    filas: [
      { etiqueta: 'Renta Extraordinaria', monto: res.pagoInicialSub },
      { etiqueta: 'Comisión por apertura', monto: res.comisionSub },
      { etiqueta: 'GPS', monto: res.gpsSub },
      { etiqueta: 'Seguro', monto: res.seguroSub },
      { etiqueta: 'Gestoría trámites vehiculares', monto: res.serviciosSub },
      { etiqueta: 'Rentas en depósito', monto: res.rentasDepositoSubtotal || 0 },
      { etiqueta: 'Servicio y/o mantenimiento', monto: '$0.00' },
    ],
    subtotalValor: res.pagoInicialSubtotal,
    ivaValor: res.pagoInicialIVA,
    pieLabel: 'PAGO TOTAL INICIAL',
    pieValor: res.pagoInicialTotal,
  });

  const tablaRentaMensual = construirTablaFinanciera({
    titulo: `RENTA MENSUAL  |  PLAZO ${formData.plazo} MESES`,
    tituloColor: COLOR_HEADER,
    filas: [
      { etiqueta: 'Renta', monto: res.rentaSoloActivo / 1.16 },
      { etiqueta: 'GPS', monto: res.gpsFinMensual / 1.16 },
      { etiqueta: 'Seguro', monto: res.seguroFinMensual / 1.16 },
      { etiqueta: 'Gestoría trámites vehiculares', monto: '$0.00' },
      { etiqueta: 'Servicio y/o mantenimiento', monto: '$0.00' },
      { etiqueta: 'Otros', monto: '$0.00' },
    ],
    subtotalValor: res.rentaMensualSubtotal,
    ivaValor: res.rentaMensualIVA,
    pieLabel: 'PAGO TOTAL RENTA MENSUAL',
    pieValor: res.rentaMensualTotal,
  });

  const contenidoHeaderIzq = [
    ...(logoHeader ? [logoHeader] : []),
    { text: tituloCotizacion, fontSize: 10, bold: true, color: '#ffffff', margin: [0, 0, 0, 4] },
    {
      text: [
        { text: 'Fecha de expedición', bold: true, color: '#ffffff' },
        { text: `  ${fechaHoy}`, color: '#cccccc' },
      ],
      fontSize: 8,
      margin: [0, 0, 0, 4],
    },
    {
      text: 'Agradecemos tu confianza en Flising, es un gusto atenderte.\nA continuación, te presentamos los detalles específicos de tu cotización solicitada.',
      color: '#cccccc',
      fontSize: 8,
      lineHeight: 1.2,
      margin: [0, 4, 0, 0],
    },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [0, 0, 0, ALTURA_BANDA_INFERIOR],
    footer: () => ({
      table: {
        widths: ['*'],
        body: [[{
          stack: logoFooter ? [logoFooter] : [{ text: '' }],
          fillColor: COLOR_HEADER,
          border: [false, false, false, false],
          alignment: 'center',
          margin: [0, PADDING_BANDA_INFERIOR, 0, PADDING_BANDA_INFERIOR],
        }]],
      },
      layout: 'noBorders',
    }),
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8,
      color: '#333333',
    },
    content: [
      {
        table: {
          widths: ['*', 'auto'],
          body: [[
            {
              stack: contenidoHeaderIzq,
              fillColor: COLOR_HEADER,
              border: [false, false, false, false],
              margin: [MARGEN_H, 5, 8, 12],
            },
            {
              stack: imagenActivo ? [imagenActivo] : [{ text: '' }],
              fillColor: COLOR_HEADER,
              border: [false, false, false, false],
              margin: [8, 5, MARGEN_H, 12],
              alignment: 'right',
            },
          ]],
        },
        layout: 'noBorders',
      },
      {
        stack: [
          {
            table: {
              widths: [140, '*'],
              body: [
                [
                  { text: 'NOMBRE DEL CLIENTE', bold: true, color: '#222222', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                  { text: nombreCliente, color: '#444444', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                ],
                [
                  { text: 'PRODUCTO/VEHÍCULO', bold: true, color: '#222222', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                  { text: nombreCombinado || 'No especificado', color: '#444444', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                ],
                [
                  { text: 'PRECIO (IVA INCLUIDO)', bold: true, color: '#222222', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                  {
                    text: `${formatoMonedaPdf(parseNumeroFormulario(formData.valorActivo))} MXN`,
                    color: '#444444',
                    margin: MARGEN_FILA_CLIENTE,
                    fontSize: 9,
                    lineHeight: 1,
                  },
                ],
                [
                  { text: 'PLAZO (MESES)', bold: true, color: '#222222', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                  { text: String(formData.plazo), color: '#444444', margin: MARGEN_FILA_CLIENTE, fontSize: 9, lineHeight: 1 },
                ],
              ],
            },
            layout: 'noBorders',
          },
          {
            canvas: [{
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 559,
              y2: 0,
              lineWidth: 2,
              lineColor: '#e0e0e0',
            }],
            margin: [0, 2, 0, 0],
          },
        ],
        margin: [MARGEN_H, 12, MARGEN_H, 2],
      },
      {
        columns: [
          { width: '49%', stack: [tablaPagoInicial] },
          { width: '2%', text: '' },
          {
            width: '49%',
            stack: [
              tablaRentaMensual,
              {
                text: [
                  { text: 'VALOR RESIDUAL ESTIMADO\n', bold: true },
                  { text: formatoMonedaPdf(res.residualReal), bold: false },
                ],
                alignment: 'right',
                fontSize: TAMANO_FUENTE_TABLA,
                margin: [0, 4, 10, 0],
                lineHeight: 1.1,
              },
            ],
          },
        ],
        margin: [MARGEN_H, 2, MARGEN_H, 2],
      },
      {
        stack: [
          { text: 'OBSERVACIONES', bold: true, fontSize: 7.5, margin: [0, 6, 0, 3] },
          {
            ul: [
              'Sujeto a aprobación de crédito.',
              'Cotización sujeta a cambios sin previo aviso.',
              'Seguro y GPS obligatorio a cargo del cliente con renovaciones anuales (en caso de aplicar) cobertura amplia.',
              'El valor de la tenencia y/o impuestos gubernamentales es estimado, sujeto a la fórmula gubernamental vigente y a la fecha de entrega de la unidad.',
              'Sujeto a disponibilidad del activo en sus variantes y/o colores, así como su valor.',
            ],
            fontSize: 7.5,
            margin: [4, 0, 0, 0],
            lineHeight: 1.3,
          },
          { text: 'NOTAS', bold: true, fontSize: 7.5, margin: [0, 8, 0, 3] },
          {
            ul: [
              'Oferta preliminar sujeta a modificación según evaluación crediticia. Las condiciones definitivas se establecerán después de concluir satisfactoriamente el proceso de precalificación.',
              'Al pago inicial se le suma el pago del seguro anual una vez que se confirme el precio de este o en caso de ser financiado, la parte que corresponda.',
              '1er renta deberá ser pagada antes o a la entrega del bien arrendado.',
              'El Arrendatario pagará las rentas proporcionales que se generen entre el día de entrega del vehículo y la fecha de inicio del arrendamiento.',
              'El pago mensual es domiciliado el día 1 de cada mes.',
              'La arrendadora se reserva el derecho de adquirir los activos objeto del arrendamiento con el proveedor, distribuidor o canal comercial que más convenga a sus intereses, condiciones operativas y financieras.',
            ],
            fontSize: 7.5,
            margin: [4, 0, 0, 0],
            lineHeight: 1.3,
          },
        ],
        margin: [MARGEN_H, 0, MARGEN_H, 8],
      },
      {
        stack: [
          {
            text: '¡Estamos encantados de resolver cualquier duda o comentario que tengas!',
            bold: true,
            color: COLOR_ACENTO,
            alignment: 'center',
            fontSize: 8,
            margin: [0, 0, 0, 4],
          },
          {
            text: 'He leído y entiendo plenamente las condiciones y disposiciones contenidas en la presente cotización, estoy de acuerdo.',
            fontSize: 7.5,
            margin: [0, 0, 0, 5],
          },
          {
            text: [
              { text: nombreCliente, bold: true },
              { text: `.  Metepec, Edo. de México, a ${fechaHoy}` },
            ],
            fontSize: 7.5,
            margin: [0, 0, 0, 6],
          },
          {
            text: [
              { text: 'Estimado cliente, te invitamos a leer nuestro ', color: '#555555', fontSize: 7 },
              { text: 'Aviso de privacidad y transferencia de datos personales', color: COLOR_ACENTO, fontSize: 7 },
              { text: '; y ', color: '#555555', fontSize: 7 },
              { text: 'Términos y condiciones generales del arrendamiento puro', color: COLOR_ACENTO, fontSize: 7 },
              { text: '.', color: '#555555', fontSize: 7 },
            ],
          },
        ],
        margin: [MARGEN_H, 6, MARGEN_H, 8],
      },
    ],
  };
};

const documentoPdfCotizacionABuffer = (docDefinition) =>
  pdfmake.createPdf(docDefinition).getBuffer();

module.exports = {
  formatoMonedaPdf,
  aNodoImagen,
  construirDocumentoPdfCotizacion,
  documentoPdfCotizacionABuffer,
};
