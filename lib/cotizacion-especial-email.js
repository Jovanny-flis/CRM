/**
 * Correo de solicitud de cotización especial (tras guardar, con folio).
 */

const { formatearFolio } = require('./cotizacion-especial');

const construirHtmlSolicitudEspecial = ({
    nombreAgente,
    folioTexto,
    enlaceCrm,
}) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #1e293b; padding: 20px; text-align: center;">
    <h2 style="color: #fef08a; margin: 0;">Solicitud de cotización especial</h2>
  </div>
  <div style="padding: 20px; color: #333;">
    <p><strong>${nombreAgente}</strong> ha solicitado una cotización especial (${folioTexto}).</p>
    <p>Puedes autorizar o rechazar la solicitud desde el CRM.</p>
    <p style="text-align: center; margin: 28px 0;">
      <a href="${enlaceCrm}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
        Abrir CRM — Prospectos
      </a>
    </p>
  </div>
</div>`;

const enviarCorreoSolicitudEspecial = async (transporter, {
    destinatarios,
    nombreAgente,
    folio,
    empresaId,
}) => {
    if (!destinatarios?.length) {
        console.warn('⚠️ Cotización especial: sin destinatarios de correo para empresa', empresaId);
        return;
    }

    const baseUrl = (process.env.FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    const enlaceCrm = `${baseUrl}/leads`;
    const folioTexto = formatearFolio(folio);

    await transporter.sendMail({
        from: `"Flising CRM" <${process.env.EMAIL_USER}>`,
        to: destinatarios.join(', '),
        subject: `Solicitud de ${nombreAgente} para cotización especial`,
        html: construirHtmlSolicitudEspecial({ nombreAgente, folioTexto, enlaceCrm }),
    });
};

module.exports = { enviarCorreoSolicitudEspecial };
