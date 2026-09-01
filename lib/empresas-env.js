'use strict';

/**
 * Ids numéricos de tenant en el CRM multiempresa.
 * Valores reales solo en CRM/.env (no en git).
 */

function parseEmpresaId(raw) {
    const n = Number(String(raw == null ? '' : raw).trim());
    return Number.isFinite(n) && n > 0 ? n : null;
}

function empresaGrouerId() {
    return parseEmpresaId(process.env.GROUER_EMPRESA_ID);
}

function empresaFlisingId() {
    return parseEmpresaId(process.env.FLISING_EMPRESA_ID);
}

function esEmpresaGrouer(empresaId) {
    const grouer = empresaGrouerId();
    if (grouer == null || empresaId == null || empresaId === '') return false;
    return Number(empresaId) === grouer;
}

module.exports = {
    parseEmpresaId,
    empresaGrouerId,
    empresaFlisingId,
    esEmpresaGrouer,
};
