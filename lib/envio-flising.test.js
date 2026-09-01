'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseEmpresaId, esEmpresaGrouer } = require('./empresas-env');
const {
    agenteFlisingElegible,
    resolverMotivoCancelacion,
    kpiClonCuentaComoProspectoMes,
    MOTIVO_CANCELACION_PORTAL,
} = require('./envio-flising-reglas');

describe('parseEmpresaId / esEmpresaGrouer', () => {
    it('acepta enteros positivos', () => {
        assert.equal(parseEmpresaId('7'), 7);
        assert.equal(parseEmpresaId(12), 12);
    });

    it('rechaza vacío, cero y basura', () => {
        assert.equal(parseEmpresaId(''), null);
        assert.equal(parseEmpresaId('0'), null);
        assert.equal(parseEmpresaId('abc'), null);
        assert.equal(parseEmpresaId(undefined), null);
    });

    it('solo marca GROUER cuando el env coincide', () => {
        const prev = process.env.GROUER_EMPRESA_ID;
        process.env.GROUER_EMPRESA_ID = '3';
        try {
            assert.equal(esEmpresaGrouer(3), true);
            assert.equal(esEmpresaGrouer('3'), true);
            assert.equal(esEmpresaGrouer(1), false);
        } finally {
            if (prev === undefined) delete process.env.GROUER_EMPRESA_ID;
            else process.env.GROUER_EMPRESA_ID = prev;
        }
    });
});

describe('agenteFlisingElegible', () => {
    const flisingId = 1;

    it('acepta agente, supervisor y admin de FLISING', () => {
        assert.equal(agenteFlisingElegible({ empresa_id: 1, rol: 'agente' }, flisingId), true);
        assert.equal(agenteFlisingElegible({ empresa_id: 1, rol: 'supervisor' }, flisingId), true);
        assert.equal(agenteFlisingElegible({ empresa_id: 1, rol: 'admin_empresa' }, flisingId), true);
    });

    it('rechaza cotizador, robot de otra empresa y super_admin', () => {
        assert.equal(agenteFlisingElegible({ empresa_id: 1, rol: 'agente_cotizador' }, flisingId), false);
        assert.equal(agenteFlisingElegible({ empresa_id: 3, rol: 'agente' }, flisingId), false);
        assert.equal(agenteFlisingElegible({ empresa_id: 1, rol: 'super_admin' }, flisingId), false);
        assert.equal(agenteFlisingElegible(null, flisingId), false);
    });
});

describe('resolverMotivoCancelacion', () => {
    it('usa el motivo del cliente si viene', () => {
        assert.equal(resolverMotivoCancelacion('Ya no me interesa'), 'Ya no me interesa');
    });

    it('cae al motivo de portal si falta', () => {
        assert.equal(resolverMotivoCancelacion(null), MOTIVO_CANCELACION_PORTAL);
        assert.equal(resolverMotivoCancelacion('  '), MOTIVO_CANCELACION_PORTAL);
    });
});

describe('kpiClonCuentaComoProspectoMes', () => {
    it('cuenta un clon activo asignado a un agente en el mes del created_at', () => {
        assert.equal(
            kpiClonCuentaComoProspectoMes({
                incluirEnSuma: true,
                usuarioId: 'agente-1',
                createdAt: new Date('2026-08-31T18:00:00Z'),
                mesObjetivo: '2026-08',
            }),
            true,
        );
    });

    it('no cuenta si el estatus no suma, falta agente o es otro mes', () => {
        assert.equal(
            kpiClonCuentaComoProspectoMes({
                incluirEnSuma: false,
                usuarioId: 'agente-1',
                createdAt: new Date('2026-08-31T18:00:00Z'),
                mesObjetivo: '2026-08',
            }),
            false,
        );
        assert.equal(
            kpiClonCuentaComoProspectoMes({
                incluirEnSuma: true,
                usuarioId: null,
                createdAt: new Date('2026-08-31T18:00:00Z'),
                mesObjetivo: '2026-08',
            }),
            false,
        );
        assert.equal(
            kpiClonCuentaComoProspectoMes({
                incluirEnSuma: true,
                usuarioId: 'agente-1',
                createdAt: new Date('2026-07-01T12:00:00Z'),
                mesObjetivo: '2026-08',
            }),
            false,
        );
    });
});
