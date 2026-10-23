import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarPago,
  calcularMora,
  diasAtraso,
  estadoCuota,
  cuotaDesdeAmortizacion,
  type ConfigMora,
  type CuotaPago,
} from '../src/modules/pagos/index.js';
import { generarAmortizacion } from '../src/modules/amortizacion/index.js';

const sinMora: ConfigMora = { diasGracia: 0, porcentajeDia: 0, montoFijoCentavos: 0 };
const mora1pct: ConfigMora = { diasGracia: 2, porcentajeDia: 0.01, montoFijoCentavos: 0 };

function cuota(over: Partial<CuotaPago> = {}): CuotaPago {
  return {
    numero: 1,
    fechaVencimiento: '2026-01-10',
    capitalCentavos: 8000,
    interesCentavos: 2000,
    capitalPagadoCentavos: 0,
    interesPagadoCentavos: 0,
    moraPagadaCentavos: 0,
    moraDevengadaCentavos: 0,
    ...over,
  };
}

test('Días de atraso: nunca negativos', () => {
  assert.equal(diasAtraso('2026-01-10', '2026-01-20'), 10);
  assert.equal(diasAtraso('2026-01-10', '2026-01-05'), 0);
});

test('Pago puntual exacto deja la cuota PAGADA', () => {
  const r = aplicarPago([cuota()], 10000, '2026-01-10', sinMora);
  assert.equal(r.sobranteCentavos, 0);
  assert.equal(estadoCuota(r.cuotas[0], '2026-01-10', sinMora), 'PAGADO');
});

test('Días de gracia: dentro de la gracia no hay mora', () => {
  assert.equal(calcularMora(cuota(), '2026-01-12', mora1pct), 0);
});

test('Mora porcentual: 1% diario x 10 días sobre 100.00 = 10.00', () => {
  assert.equal(calcularMora(cuota(), '2026-01-20', mora1pct), 1000);
});

test('Mora con monto fijo al pasar la gracia', () => {
  const cfg: ConfigMora = { diasGracia: 0, porcentajeDia: 0, montoFijoCentavos: 500 };
  assert.equal(calcularMora(cuota(), '2026-01-11', cfg), 500);
  assert.equal(calcularMora(cuota(), '2026-01-10', cfg), 0);
});

test('Prelación: mora primero, luego interés, luego capital', () => {
  const r = aplicarPago([cuota()], 1500, '2026-01-20', mora1pct);
  assert.deepEqual(r.detalle, [
    { numero: 1, moraCentavos: 1000, interesCentavos: 500, capitalCentavos: 0 },
  ]);
  assert.equal(estadoCuota(r.cuotas[0], '2026-01-20', mora1pct), 'PARCIAL');

  // Segundo pago: termina interés y capital; la mora ya devengada no baja
  const r2 = aplicarPago(r.cuotas, 2500, '2026-01-20', mora1pct);
  assert.deepEqual(r2.detalle, [
    { numero: 1, moraCentavos: 0, interesCentavos: 1500, capitalCentavos: 1000 },
  ]);
  assert.equal(r2.sobranteCentavos, 0);
});

test('Un pago grande cubre varias cuotas en orden y adelanta las siguientes', () => {
  const am = generarAmortizacion({
    montoCentavos: 300000, tasa: 0.02, numeroCuotas: 3, metodo: 'FRANCES',
    frecuencia: 'MENSUAL', fechaDesembolso: '2026-01-01',
  });
  const cuotas = am.map(cuotaDesdeAmortizacion);
  const cuotaMensual = am[0].totalCentavos;
  const r = aplicarPago(cuotas, cuotaMensual + 500, '2026-02-01', sinMora);
  assert.equal(estadoCuota(r.cuotas[0], '2026-02-01', sinMora), 'PAGADO');
  assert.equal(r.detalle.length, 2);
  assert.equal(r.detalle[1].numero, 2);
  assert.equal(r.detalle[1].interesCentavos, 500);
});

test('Pago mayor a la deuda total devuelve sobrante', () => {
  const am = generarAmortizacion({
    montoCentavos: 100000, tasa: 0.1, numeroCuotas: 5, metodo: 'FLAT',
    frecuencia: 'SEMANAL', fechaDesembolso: '2026-01-01',
  });
  const r = aplicarPago(am.map(cuotaDesdeAmortizacion), 110100, '2026-01-02', sinMora);
  assert.equal(r.sobranteCentavos, 100);
  assert.ok(r.cuotas.every((c) => estadoCuota(c, '2026-01-02', sinMora) === 'PAGADO'));
});

test('Invariante: detalle + sobrante = monto pagado', () => {
  const am = generarAmortizacion({
    montoCentavos: 500000, tasa: 0.03, numeroCuotas: 6, metodo: 'ALEMAN',
    frecuencia: 'QUINCENAL', fechaDesembolso: '2026-01-01',
  });
  for (const monto of [1, 999, 54321, 250000, 900000]) {
    const r = aplicarPago(am.map(cuotaDesdeAmortizacion), monto, '2026-03-01', mora1pct);
    const aplicado = r.detalle.reduce((s, d) => s + d.moraCentavos + d.interesCentavos + d.capitalCentavos, 0);
    assert.equal(aplicado + r.sobranteCentavos, monto);
  }
});

test('Validación: pago inválido', () => {
  assert.throws(() => aplicarPago([cuota()], 0, '2026-01-10', sinMora));
  assert.throws(() => aplicarPago([cuota()], 10.5, '2026-01-10', sinMora));
});
