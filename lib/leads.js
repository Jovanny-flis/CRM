/** Valores permitidos para leads.tipo_persona (opcional). */
const TIPOS_PERSONA_VALIDOS = ['PM', 'PF', 'PFAE'];

/**
 * Normaliza tipo_persona del body: vacío → null; válido → mayúsculas.
 * @returns {string|null|{ error: string }}
 */
function normalizarTipoPersona(valor) {
    if (valor == null || String(valor).trim() === '') {
        return null;
    }
    const normalizado = String(valor).trim().toUpperCase();
    if (!TIPOS_PERSONA_VALIDOS.includes(normalizado)) {
        return { error: 'tipo_persona inválido. Use PM, PF o PFAE.' };
    }
    return normalizado;
}

module.exports = {
    TIPOS_PERSONA_VALIDOS,
    normalizarTipoPersona,
};
