import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { construirFilasDetalleProspectoGrouer } from './prospectoGrouerDetalleVista.js';

const moneda = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

function filaDeal(snapshot, etiqueta) {
  const { grupos } = construirFilasDetalleProspectoGrouer(snapshot);
  const deal = grupos.find((g) => g.id === 'deal');
  return deal.filas.find((f) => f.etiqueta === etiqueta);
}

describe('detalle Deal GROUER', () => {
  it('muestra unidades, valor unitario y el total que mandó GROUER', () => {
    const snapshot = {
      activo: { num_unidades: 9, marca: 'Toyota' },
      deal: { num_unidades: 3, valor_unitario: 500000, valor_activo: 1500000 },
    };
    assert.equal(filaDeal(snapshot, 'Número de unidades').valor, '3');
    assert.equal(filaDeal(snapshot, 'Valor unitario').valor, moneda(500000));
    const total = filaDeal(snapshot, 'Valor total');
    assert.equal(total.valor, moneda(1500000));
    assert.equal(total.destacado, true);
    assert.equal(filaDeal(snapshot, 'Valor activo'), undefined);
  });

  it('si deal no trae unidades, usa las del activo', () => {
    const snapshot = {
      activo: { num_unidades: 3 },
      deal: { num_unidades: null, valor_unitario: null, valor_activo: 1500000 },
    };
    assert.equal(filaDeal(snapshot, 'Número de unidades').valor, '3');
    assert.equal(filaDeal(snapshot, 'Valor unitario').valor, moneda(1500000));
    assert.equal(filaDeal(snapshot, 'Valor total').valor, moneda(1500000));
  });

  it('sin unidades ni valor unitario asume 1 y usa el valor total como unitario', () => {
    const snapshot = { deal: { valor_activo: 800000 }, activo: {} };
    assert.equal(filaDeal(snapshot, 'Número de unidades').valor, '1');
    assert.equal(filaDeal(snapshot, 'Valor unitario').valor, moneda(800000));
    assert.equal(filaDeal(snapshot, 'Valor total').valor, moneda(800000));
  });

  it('sin montos deja el valor en sin dato y las unidades en 1', () => {
    const snapshot = {};
    assert.equal(filaDeal(snapshot, 'Número de unidades').valor, '1');
    assert.equal(filaDeal(snapshot, 'Valor unitario').valor, 'sin dato');
    assert.equal(filaDeal(snapshot, 'Valor total').valor, 'sin dato');
  });
});
