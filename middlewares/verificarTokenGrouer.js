'use strict';

const crypto = require('crypto');

function tokensCoinciden(recibido, esperado) {
    const a = Buffer.from(String(recibido), 'utf8');
    const b = Buffer.from(String(esperado), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * Auth máquina CRM ↔ GROUER. Header X-Grouer-Token vs GROUER_CRM_SHARED_TOKEN.
 * No usa Firebase ni RIESGOS_INTERNAL_TOKEN.
 */
function verificarTokenGrouer(req, res, next) {
    const esperado = (process.env.GROUER_CRM_SHARED_TOKEN || '').trim();
    if (!esperado) {
        return res.status(503).json({ error: 'Integración GROUER no configurada.' });
    }

    const recibido = req.get('X-Grouer-Token');
    if (recibido == null || recibido === '') {
        return res.status(401).json({ error: 'Token inválido.' });
    }

    if (!tokensCoinciden(recibido, esperado)) {
        return res.status(401).json({ error: 'Token inválido.' });
    }

    return next();
}

module.exports = { verificarTokenGrouer };
