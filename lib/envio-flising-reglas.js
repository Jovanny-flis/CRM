'use strict';

const NOMBRE_CANAL_CORRETAJE = 'Corretaje GROUER';
const ROLES_AGENTE_FLISING = ['agente', 'supervisor', 'admin_empresa'];
const MOTIVO_CANCELACION_PORTAL = 'canceló en portal';
const MOTIVO_MAX = 255;

function truncar(valor, max) {
    if (valor == null) return null;
    const s = String(valor).trim();
    if (!s) return null;
    return s.slice(0, max);
}

function resolverMotivoCancelacion(motivo) {
    const limpio = truncar(motivo, MOTIVO_MAX);
    return limpio || MOTIVO_CANCELACION_PORTAL;
}

function agenteFlisingElegible(usuario, empresaFlisingIdNum) {
    if (!usuario || empresaFlisingIdNum == null) return false;
    if (Number(usuario.empresa_id) !== Number(empresaFlisingIdNum)) return false;
    return ROLES_AGENTE_FLISING.includes(usuario.rol);
}

/**
 * Misma regla que dashboard-kpis: created_at del mes + usuario_id + incluir_en_suma.
 * El clon FLISING alimenta la meta de 15; no dispara comisión en pesos (eso es COLOCADO).
 */
function kpiClonCuentaComoProspectoMes({ incluirEnSuma, usuarioId, createdAt, mesObjetivo }) {
    if (!incluirEnSuma || !usuarioId || !createdAt || !mesObjetivo) return false;
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}` === mesObjetivo;
}

module.exports = {
    NOMBRE_CANAL_CORRETAJE,
    ROLES_AGENTE_FLISING,
    MOTIVO_CANCELACION_PORTAL,
    truncar,
    resolverMotivoCancelacion,
    agenteFlisingElegible,
    kpiClonCuentaComoProspectoMes,
};
