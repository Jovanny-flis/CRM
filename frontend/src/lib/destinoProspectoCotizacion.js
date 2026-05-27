/**
 * Alta de oportunidades y vinculación de cotización activa (un folio por lead).
 */

/** Etiqueta para elegir oportunidad existente en listas. */
export const etiquetaLeadOpcion = (lead) => {
  const folio = lead.cotizacion_folio
    ? `FL-${String(lead.cotizacion_folio).padStart(3, '0')}`
    : 'Sin folio activo';
  const etapa = lead.nombre_etapa || 'Sin etapa';
  const estatus = lead.estatus_nombre || '';
  const estatusTxt = estatus ? ` · ${estatus}` : '';
  return `${lead.nombre} — ${folio} — ${etapa}${estatusTxt}`;
};

export const leadsMismoNombre = (leads, nombre) => {
  const clave = String(nombre || '').trim().toLowerCase();
  if (!clave) return [];
  return leads.filter((l) => String(l.nombre || '').trim().toLowerCase() === clave);
};

export const obtenerPrimeraEtapaPipeline = async (api, empresaId) => {
  const resPipe = await api.get(`/pipelines/${empresaId}`);
  if (!resPipe.data?.length) return null;
  const resEtapas = await api.get(`/etapas/${resPipe.data[0].id}`);
  return resEtapas.data?.length ? resEtapas.data[0].id : null;
};

/**
 * Crea un lead (oportunidad) en el tablero.
 * @returns {Promise<string>} id del lead
 */
export const crearLeadOportunidad = async (api, {
  empresaId,
  usuarioId,
  nombre,
  tipoPersona = null,
  valorActivo = 0,
  medio = 'Cotizador',
}) => {
  const stageId = await obtenerPrimeraEtapaPipeline(api, empresaId);
  const resLead = await api.post('/leads', {
    empresa_id: empresaId,
    nombre: String(nombre || '').trim(),
    correo: '',
    telefono: '',
    valor: Number(valorActivo) || 0,
    medio,
    tipo_persona: tipoPersona || null,
    stage_id: stageId,
    usuario_id: usuarioId,
  });
  const id = resLead.data?.id;
  if (!id) throw new Error('El prospecto se creó pero no se recibió su identificador.');
  return id;
};

/** Deja un solo folio activo en el lead; libera los demás. */
export const vincularCotizacionActiva = async (api, cotizacionId, leadId) => {
  await api.put(`/cotizaciones/${cotizacionId}/vincular-lead`, { lead_id: leadId });
};
