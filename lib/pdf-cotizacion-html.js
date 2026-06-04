const {
  parseNumeroFormulario,
  archivoImagenActivoPdf,
  folioEtiqueta,
} = require('./cotizacion-formulario-pdf');
const { logoFlisingBase64, imagenActivoBase64 } = require('./pdf-cotizacion-assets');

const PDF_ANCHO_PX = 794;
const PDF_ALTO_A4_PX = 1122;

const escapeHtml = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatoMonedaPdf = (monto) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto || 0);

const armarNombreActivoAutomotriz = ({ marca, modelo, version, anio }) =>
  [marca, modelo, version, anio]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' - ');

const imgTag = (src, alt, style) => {
  if (!src) return '';
  return `<img src="${src}" alt="${escapeHtml(alt)}" style="${style}" />`;
};

const construirHtmlPdfCotizacion = ({ formData, res, folio, nombreProspecto }) => {
  const nombreCliente = String(nombreProspecto || '').trim() || 'A quien corresponda';
  const nombreCombinado = formData.tipoArrendamiento === 'Automotriz'
    ? armarNombreActivoAutomotriz(formData)
    : String(formData.nombreActivo || '').trim();

  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const logoSrc = logoFlisingBase64();
  const imagenActivoSrc = imagenActivoBase64(archivoImagenActivoPdf(formData));
  const etiquetaImagenActivo = formData.tipoArrendamiento === 'Automotriz'
    ? formData.tipoVehiculo
    : 'Otro';

  const etiquetaFolio = folioEtiqueta(folio);
  const tituloCotizacion = etiquetaFolio ? `COTIZACIÓN - ${etiquetaFolio}` : 'COTIZACIÓN';

  const logoHeader = imgTag(
    logoSrc,
    'Flising',
    'height: 110px; object-fit: contain; display: block; margin-bottom: 2px;',
  );
  const imagenActivo = imgTag(
    imagenActivoSrc,
    etiquetaImagenActivo,
    'height: 200px; max-width: 270px; object-fit: contain; flex-shrink: 0;',
  );
  const logoFooter = imgTag(
    logoSrc,
    'Flising',
    'height: 70px; object-fit: contain;',
  );

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: white; }
  </style>
</head>
<body>
  <div style="font-family: 'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif; font-size: 10px; background: white; width: ${PDF_ANCHO_PX}px; min-height: ${PDF_ALTO_A4_PX}px; margin: 0; padding: 0; display: flex; flex-direction: column;">

    <div style="background-color: #2c2c2c; padding: 5px 24px 12px 24px; margin: 0;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;">
        <div style="color: white; flex: 1; min-width: 0;">
          ${logoHeader}
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(tituloCotizacion)}</div>
          <div style="color: #cccccc; font-size: 10px; line-height: 1.8;">
            <div><strong style="color: white;">Fecha de expedición</strong>&nbsp;&nbsp;${escapeHtml(fechaHoy)}</div>
          </div>
          <div style="font-size: 10px; color: #cccccc; line-height: 1.5; margin-top: 4px;">
            Agradecemos tu confianza en Flising, es un gusto atenderte.<br/>
            A continuación, te presentamos los detalles específicos de tu cotización solicitada.
          </div>
        </div>
        ${imagenActivo}
      </div>
    </div>

    <div style="background-color: white; padding: 12px 24px 10px 24px; border-bottom: 2px solid #e0e0e0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tr>
          <td style="padding: 3px 0; width: 180px; font-weight: 700; color: #222;">NOMBRE DEL CLIENTE</td>
          <td style="padding: 3px 0; color: #444;">${escapeHtml(nombreCliente)}</td>
        </tr>
        <tr>
          <td style="padding: 3px 0; font-weight: 700; color: #222;">PRODUCTO/VEHÍCULO</td>
          <td style="padding: 3px 0; color: #444;">${escapeHtml(nombreCombinado || 'No especificado')}</td>
        </tr>
        <tr>
          <td style="padding: 3px 0; font-weight: 700; color: #222;">PRECIO (IVA INCLUIDO)</td>
          <td style="padding: 3px 0; color: #444;">${escapeHtml(formatoMonedaPdf(parseNumeroFormulario(formData.valorActivo)))} MXN</td>
        </tr>
        <tr>
          <td style="padding: 3px 0; font-weight: 700; color: #222;">PLAZO (MESES)</td>
          <td style="padding: 3px 0; color: #444;">${escapeHtml(formData.plazo)}</td>
        </tr>
      </table>
    </div>

    <div style="padding: 14px 24px 2px 24px; background: white;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="vertical-align: top;">
          <td style="width: 49%; padding-right: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
              <tr>
                <td colspan="2" style="background-color: #ea5533; color: white; padding: 6px 10px; font-weight: 700; font-size: 11px;">PAGO INICIAL</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Renta Extraordinaria</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.pagoInicialSub))}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Comisión por apertura</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.comisionSub))}</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">GPS</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.gpsSub))}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Seguro</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.seguroSub))}</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Gestoría trámites vehiculares</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.serviciosSub))}</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Rentas en depósito</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.rentasDepositoSubtotal || 0))}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Servicio y/o mantenimiento</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 2px solid #ccc;"><strong>Subtotal</strong></td>
                <td style="padding: 5px 8px; border-bottom: 2px solid #ccc; text-align: right; white-space: nowrap;"><strong>${escapeHtml(formatoMonedaPdf(res.pagoInicialSubtotal))}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px;">IVA</td>
                <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.pagoInicialIVA))}</td>
              </tr>
              <tr>
                <td colspan="2" style="background-color: #ea5533; color: white; padding: 6px 10px; font-weight: 700;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="font-size: 10.5px;">PAGO TOTAL INICIAL</td>
                      <td style="text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.pagoInicialTotal))} MXN</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>

          <td style="width: 49%; padding-left: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
              <tr>
                <td colspan="2" style="background-color: #2c2c2c; color: white; padding: 6px 10px; font-weight: 700; font-size: 11px;">
                  RENTA MENSUAL &nbsp;|&nbsp; PLAZO ${escapeHtml(formData.plazo)} MESES
                </td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Renta</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.rentaSoloActivo / 1.16))}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">GPS</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.gpsFinMensual / 1.16))}</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Seguro</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.seguroFinMensual / 1.16))}</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Gestoría trámites vehiculares</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Servicio y/o mantenimiento</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee;">Otros</td>
                <td style="padding: 5px 8px; border-bottom: 1px solid #eee; text-align: right; white-space: nowrap;">$0.00</td>
              </tr>
              <tr>
                <td style="padding: 5px 8px; border-bottom: 2px solid #ccc;"><strong>Subtotal</strong></td>
                <td style="padding: 5px 8px; border-bottom: 2px solid #ccc; text-align: right; white-space: nowrap;"><strong>${escapeHtml(formatoMonedaPdf(res.rentaMensualSubtotal))}</strong></td>
              </tr>
              <tr style="background:#f9f9f9;">
                <td style="padding: 5px 8px;">IVA</td>
                <td style="padding: 5px 8px; text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.rentaMensualIVA))}</td>
              </tr>
              <tr>
                <td colspan="2" style="background-color: #2c2c2c; color: white; padding: 6px 10px; font-weight: 700;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="font-size: 10.5px;">PAGO TOTAL RENTA MENSUAL</td>
                      <td style="text-align: right; white-space: nowrap;">${escapeHtml(formatoMonedaPdf(res.rentaMensualTotal))} MXN</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <div style="margin-top: 8px; background-color: transparent; color: black; padding: 8px 10px; font-weight: 700; font-size: 10.5px; text-align: right;">
              VALOR RESIDUAL ESTIMADO<br/>
              <span style="font-weight: 400;">${escapeHtml(formatoMonedaPdf(res.residualReal))}</span>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding: 0px 24px 8px 24px; background: white; font-size: 9.5px; color: #333; line-height: 1.5;">
      <p style="font-weight: 700; margin: 6px 0 3px 0;">OBSERVACIONES</p>
      <ul style="margin: 0; padding-left: 14px;">
        <li> Sujeto a aprobación de crédito.</li>
        <li> Cotización sujeta a cambios sin previo aviso.</li>
        <li> Seguro y GPS obligatorio a cargo del cliente con renovaciones anuales (en caso de aplicar) cobertura amplia.</li>
        <li> El valor de la tenencia y/o impuestos gubernamentales es estimado, sujeto a la fórmula gubernamental vigente y a la fecha de entrega de la unidad.</li>
        <li> Sujeto a disponibilidad del activo en sus variantes y/o colores, así como su valor.</li>
      </ul>
      <p style="font-weight: 700; margin: 8px 0 3px 0;">NOTAS</p>
      <ul style="margin: 0; padding-left: 14px;">
        <li> Oferta preliminar sujeta a modificación según evaluación crediticia. Las condiciones definitivas se establecerán después de concluir satisfactoriamente el proceso de precalificación.</li>
        <li> Al pago inicial se le suma el pago del seguro anual una vez que se confirme el precio de este o en caso de ser financiado, la parte que corresponda.</li>
        <li> 1er renta deberá ser pagada antes o a la entrega del bien arrendado.</li>
        <li> El Arrendatario pagará las rentas proporcionales que se generen entre el día de entrega del vehículo y la fecha de inicio del arrendamiento.</li>
        <li> El pago mensual es domiciliado el día 1 de cada mes.</li>
        <li> La arrendadora se reserva el derecho de adquirir los activos objeto del arrendamiento con el proveedor, distribuidor o canal comercial que más convenga a sus intereses, condiciones operativas y financieras.</li>
      </ul>
    </div>

    <div style="padding: 6px 24px 14px 24px; background: white; font-size: 9.5px; color: #333; line-height: 1.6;">
      <p style="font-weight: 700; color: #ea5533; margin: 0 0 4px 0; text-align: center; font-size: 10px;">
        ¡Estamos encantados de resolver cualquier duda o comentario que tengas!
      </p>
      <p style="margin: 0;">
        He leído y entiendo plenamente las condiciones y disposiciones contenidas en la presente cotización, estoy de acuerdo.
      </p>
      <p style="margin: 5px 0 0 0;">
        <strong>${escapeHtml(nombreCliente)}</strong>.&nbsp;&nbsp;
        Metepec, Edo. de México, a ${escapeHtml(fechaHoy)}
      </p>
      <p style="margin: 6px 0 0 0; font-size: 9px; color: #555;">
        Estimado cliente, te invitamos a leer nuestro
        <span style="color: #ea5533;">Aviso de privacidad y transferencia de datos personales</span>;
        y <span style="color: #ea5533;">Términos y condiciones generales del arrendamiento puro</span>.
      </p>
    </div>

    <div style="margin-top: auto; background-color: #2c2c2c; box-sizing: border-box; padding: 2px 24px; display: flex; align-items: center; justify-content: center;">
      ${logoFooter}
      <span style="color: #aaa; font-size: 10px; margin-left: 16px;">www.flising.com</span>
    </div>

  </div>
</body>
</html>`;
};

module.exports = {
  PDF_ANCHO_PX,
  construirHtmlPdfCotizacion,
};
