'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularResultadosCotizacion } = require('./cotizacion-calculo');

function formDataBase(overrides = {}) {
    return {
        valorActivo: '500000',
        plazo: '36',
        tasaAnual: '20',
        tipoArrendamiento: 'Automotriz',
        tipoVehiculo: 'Sedan',
        pagoInicial: '10',
        isPagoInicialPct: true,
        residual: '30',
        isResidualPct: true,
        comision: '5',
        isComisionPct: true,
        seguro: '15000',
        isSeguroContado: false,
        isSeguroAnual: true,
        gps: '8000',
        isGpsContado: false,
        servicios: '0',
        ...overrides,
    };
}

test('sin tasaGps/tasaSeguro, ambos usan la tasa general (compatibilidad)', () => {
    const { res } = calcularResultadosCotizacion(formDataBase());
    assert.equal(res.tasaGpsAnual, 20);
    assert.equal(res.tasaSeguroAnual, 20);
});

test('tasaGps distinta cambia solo el financiamiento del GPS', () => {
    const base = calcularResultadosCotizacion(formDataBase());
    const conTasaGpsAlta = calcularResultadosCotizacion(formDataBase({ tasaGps: '35' }));

    assert.equal(conTasaGpsAlta.res.tasaGpsAnual, 35);
    assert.notEqual(conTasaGpsAlta.res.gpsFinMensual, base.res.gpsFinMensual);
    // El financiamiento del seguro no debe cambiar al mover solo la tasa del GPS.
    assert.equal(conTasaGpsAlta.res.seguroFinMensual, base.res.seguroFinMensual);
});

test('tasaSeguro distinta cambia solo el financiamiento del seguro', () => {
    const base = calcularResultadosCotizacion(formDataBase());
    const conTasaSeguroAlta = calcularResultadosCotizacion(formDataBase({ tasaSeguro: '35' }));

    assert.equal(conTasaSeguroAlta.res.tasaSeguroAnual, 35);
    assert.notEqual(conTasaSeguroAlta.res.seguroFinMensual, base.res.seguroFinMensual);
    assert.equal(conTasaSeguroAlta.res.gpsFinMensual, base.res.gpsFinMensual);
});

test('tasaGps fuera de rango marca error solo si el GPS esta financiado', () => {
    const financiado = calcularResultadosCotizacion(formDataBase({ tasaGps: '5' }));
    assert.equal(financiado.errores.tasaGps, 'La tasa del GPS debe estar entre 16% y 40%.');

    const contado = calcularResultadosCotizacion(formDataBase({ tasaGps: '5', isGpsContado: true }));
    assert.equal(contado.errores.tasaGps, undefined);
});

test('tasaSeguro fuera de rango marca error solo si el seguro esta financiado', () => {
    const financiado = calcularResultadosCotizacion(formDataBase({ tasaSeguro: '50' }));
    assert.equal(financiado.errores.tasaSeguro, 'La tasa del seguro debe estar entre 16% y 40%.');

    const contado = calcularResultadosCotizacion(formDataBase({ tasaSeguro: '50', isSeguroContado: true }));
    assert.equal(contado.errores.tasaSeguro, undefined);
});

test('modo especial no valida rango de tasaGps/tasaSeguro', () => {
    const { errores } = calcularResultadosCotizacion(
        formDataBase({ tasaGps: '5', tasaSeguro: '50' }),
        { modoEspecial: true },
    );
    assert.equal(errores.tasaGps, undefined);
    assert.equal(errores.tasaSeguro, undefined);
});
