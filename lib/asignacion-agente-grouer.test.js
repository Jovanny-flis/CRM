'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    emailAgenteDesdePayload,
    resolverAsignacionOrigen,
} = require('./asignacion-agente-grouer');

const ROBOT = 'robot-uuid';

describe('emailAgenteDesdePayload', () => {
    it('normaliza el correo y descarta el resto del objeto', () => {
        assert.equal(
            emailAgenteDesdePayload({
                agente: { email: '  Agente@Grouer.com ', id: 'uuid-grouer' },
            }),
            'agente@grouer.com',
        );
    });

    it('sin agente, correo vacío o inválido → null', () => {
        assert.equal(emailAgenteDesdePayload({}), null);
        assert.equal(emailAgenteDesdePayload({ agente: null }), null);
        assert.equal(emailAgenteDesdePayload({ agente: { email: '   ' } }), null);
        assert.equal(emailAgenteDesdePayload({ agente: { email: 'no-es-correo' } }), null);
        assert.equal(emailAgenteDesdePayload({ agente: { email: 'a@b c.com' } }), null);
        assert.equal(
            emailAgenteDesdePayload({ agente: { email: `${'a'.repeat(150)}@x.com` } }),
            null,
        );
    });
});

describe('resolverAsignacionOrigen', () => {
    it('asigna al usuario de la empresa GROUER y fija el origen', () => {
        const r = resolverAsignacionOrigen({
            email: 'agente@grouer.com',
            usuarioMismaEmpresa: { id: 'user-1' },
            robotUsuarioId: ROBOT,
        });
        assert.deepEqual(r, {
            usuarioId: 'user-1',
            origenUsuarioId: 'user-1',
            agenteEmail: 'agente@grouer.com',
        });
    });

    it('sin coincidencia deja el lead en Sistema GROUER y no inventa origen', () => {
        const r = resolverAsignacionOrigen({
            email: 'agente@grouer.com',
            usuarioMismaEmpresa: null,
            robotUsuarioId: ROBOT,
        });
        assert.equal(r.usuarioId, ROBOT);
        assert.equal(r.origenUsuarioId, null);
        assert.equal(r.agenteEmail, 'agente@grouer.com');
    });

    it('sin agente repite el alta actual', () => {
        const r = resolverAsignacionOrigen({
            email: null,
            usuarioMismaEmpresa: null,
            robotUsuarioId: ROBOT,
        });
        assert.equal(r.usuarioId, ROBOT);
        assert.equal(r.origenUsuarioId, null);
        assert.equal(r.agenteEmail, null);
    });
});
