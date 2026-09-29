'use strict';

/**
 * Atribución del agente GROUER en el alta inbound.
 * La llave entre sistemas es el correo. El UUID de GROUER no se usa.
 * Si no hay correo o no hay usuario de la empresa GROUER, el lead queda
 * en el robot «Sistema GROUER» y el origen queda vacío.
 */

/**
 * @param {unknown} body
 * @returns {string|null}
 */
function emailAgenteDesdePayload(body) {
    const ag = body && typeof body === 'object' ? body.agente : null;
    if (!ag || typeof ag !== 'object' || Array.isArray(ag)) return null;
    if (ag.email == null) return null;
    const s = String(ag.email).trim().toLowerCase();
    if (!s || s.length > 150 || /\s/.test(s)) return null;
    const at = s.indexOf('@');
    if (at <= 0 || at !== s.lastIndexOf('@') || at === s.length - 1) return null;
    return s;
}

/**
 * `usuarioMismaEmpresa` ya viene filtrado a la empresa GROUER.
 * Un correo de otra empresa no debe llegar aquí.
 *
 * @param {{
 *   email: string|null,
 *   usuarioMismaEmpresa: { id: string }|null,
 *   robotUsuarioId: string,
 * }} args
 * @returns {{ usuarioId: string, origenUsuarioId: string|null, agenteEmail: string|null }}
 */
function resolverAsignacionOrigen({ email, usuarioMismaEmpresa, robotUsuarioId }) {
    const agenteEmail = email || null;
    const id = usuarioMismaEmpresa && usuarioMismaEmpresa.id
        ? String(usuarioMismaEmpresa.id)
        : null;
    if (agenteEmail && id) {
        return {
            usuarioId: id,
            origenUsuarioId: id,
            agenteEmail,
        };
    }
    return {
        usuarioId: String(robotUsuarioId),
        origenUsuarioId: null,
        agenteEmail,
    };
}

module.exports = {
    emailAgenteDesdePayload,
    resolverAsignacionOrigen,
};
