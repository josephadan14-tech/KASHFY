import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarAmortizacion,
  fechaCuota,
  lempirasACentavos,
  type ParametrosCredito,
} from '../src/modules/amortizacion/index.js';

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function base(over: Partial<ParametrosCredito>): ParametrosCredito {
  return {
    montoCentavos: lempirasACentavos(10000),
    tasa: 0.01,
    numeroCuotas: 12,
    metodo: 'FRANCES',
    frecuencia: 'MENSUAL',
    fechaDesembolso: '2026-01-15',
    ...over,
  };
}

test('Francés: cuota fija conocida (10,000 al 1% mensual, 12 cuotas = 888.49)', () => {
  const c = generarAmortizacion(base({}));
  assert.equal(c.length, 12);
  assert.equal(c[0].totalCentavos, 88849);
  assert.equal(c[0].interesCentavos, 10000);
  assert.equal(c[11].saldoCentavos, 0);
  assert.equal(suma(c.map((x) => x.capitalCentavos)), 1000000);
});

test('Francés con tasa 0: capital repartido sin interés', () => {
  const c = generarAmortizacion(base({ tasa: 0, numeroCuotas: 3, montoCentavos: 1000 }));
  assert.equal(suma(c.map((x) => x.interesCentavos)), 0);
  assert.equal(suma(c.map((x) => x.capitalCentavos)), 1000);
});

test('Alemán: capital constante y cuotas decrecientes', () => {
  const c = generarAmortizacion(base({ metodo: 'ALEMAN' }));
  assert.equal(c[0].capitalCentavos, c[1].capitalCentavos);
  assert.ok(c[0].totalCentavos > c[10].totalCentavos);
  assert.equal(c[0].interesCentavos, 10000);
  assert.equal(c[11].saldoCentavos, 0);
});

test('Flat: 1,000 al 10% total en 30 cuotas diarias suma 1,100', () => {
  const c = generarAmortizacion(
    base({
      montoCentavos: 100000,
      tasa: 0.1,
      numeroCuotas: 30,
      metodo: 'FLAT',
      frecuencia: 'DIARIA',
    }),
  );
  assert.equal(suma(c.map((x) => x.totalCentavos)), 110000);
  assert.equal(suma(c.map((x) => x.interesCentavos)), 10000);
  assert.equal(c[0].totalCentavos, 3666); // ~36.67
  assert.equal(c[29].saldoCentavos, 0);
});

test('Invariante: capital siempre suma el monto y el saldo termina en 0', () => {
  for (const metodo of ['FRANCES', 'ALEMAN', 'FLAT'] as const) {
    for (const n of [1, 7, 13, 52]) {
      for (const monto of [99999, 1234567, 100]) {
        const c = generarAmortizacion(base({ metodo, numeroCuotas: n, montoCentavos: monto, tasa: 0.037 }));
        assert.equal(suma(c.map((x) => x.capitalCentavos)), monto, `${metodo} n=${n} m=${monto}`);
        assert.equal(c[c.length - 1].saldoCentavos, 0);
      }
    }
  }
});

test('Fechas: mensual respeta fin de mes y semanal suma 7 días', () => {
  assert.equal(fechaCuota('2026-01-31', 'MENSUAL', 1), '2026-02-28');
  assert.equal(fechaCuota('2026-01-31', 'MENSUAL', 2), '2026-03-31');
  assert.equal(fechaCuota('2026-12-15', 'MENSUAL', 2), '2027-02-15');
  assert.equal(fechaCuota('2026-01-01', 'SEMANAL', 2), '2026-01-15');
  assert.equal(fechaCuota('2026-01-01', 'QUINCENAL', 1), '2026-01-16');
});

test('Validaciones', () => {
  assert.throws(() => generarAmortizacion(base({ montoCentavos: 0 })));
  assert.throws(() => generarAmortizacion(base({ numeroCuotas: 0 })));
  assert.throws(() => generarAmortizacion(base({ tasa: -1 })));
  assert.throws(() => generarAmortizacion(base({ montoCentavos: 10.5 })));
});
