/**
 * Módulo de pagos: mora y aplicación de abonos.
 * Montos en CENTAVOS (enteros), igual que el motor de amortización.
 *
 * Reglas:
 *  - Prelación dentro de cada cuota: MORA -> INTERÉS -> CAPITAL.
 *  - Los pagos se aplican a las cuotas en orden (la más antigua primero).
 *    Si sobra dinero, adelanta las cuotas siguientes; si todo está pagado, queda como sobrante.
 *  - Mora: pasados los días de gracia, se cobra monto fijo (una vez) + porcentaje diario
 *    sobre el capital+interés pendiente de la cuota, por cada día de atraso contado
 *    desde la fecha de vencimiento.
 *  - La mora devengada nunca baja: si un pago parcial reduce la base, se conserva lo ya devengado.
 */

import type { Cuota } from '../amortizacion/index.js';

export interface ConfigMora {
  diasGracia: number;
  porcentajeDia: number; // 0.01 = 1% diario
  montoFijoCentavos: number;
}

export interface CuotaPago {
  numero: number;
  fechaVencimiento: string; // YYYY-MM-DD
  capitalCentavos: number;
  interesCentavos: number;
  capitalPagadoCentavos: number;
  interesPagadoCentavos: number;
  moraPagadaCentavos: number;
  moraDevengadaCentavos: number;
}

export type EstadoCuota = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';

export interface DetallePago {
  numero: number;
  moraCentavos: number;
  interesCentavos: number;
  capitalCentavos: number;
}

export interface ResultadoPago {
  cuotas: CuotaPago[];
  detalle: DetallePago[];
  sobranteCentavos: number;
}

export function cuotaDesdeAmortizacion(c: Cuota): CuotaPago {
  return {
    numero: c.numero,
    fechaVencimiento: c.fechaVencimiento,
    capitalCentavos: c.capitalCentavos,
    interesCentavos: c.interesCentavos,
    capitalPagadoCentavos: 0,
    interesPagadoCentavos: 0,
    moraPagadaCentavos: 0,
    moraDevengadaCentavos: 0,
  };
}

function aMs(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diasAtraso(fechaVencimiento: string, fechaCorte: string): number {
  const dias = Math.floor((aMs(fechaCorte) - aMs(fechaVencimiento)) / 86_400_000);
  return Math.max(0, dias);
}

export function calcularMora(c: CuotaPago, fechaCorte: string, cfg: ConfigMora): number {
  const dias = diasAtraso(c.fechaVencimiento, fechaCorte);
  if (dias <= cfg.diasGracia) return c.moraDevengadaCentavos;

  const base =
    c.capitalCentavos - c.capitalPagadoCentavos + (c.interesCentavos - c.interesPagadoCentavos);
  if (base <= 0) return c.moraDevengadaCentavos;

  const nueva = cfg.montoFijoCentavos + Math.round(base * cfg.porcentajeDia * dias);
  return Math.max(c.moraDevengadaCentavos, nueva);
}

export function moraPendiente(c: CuotaPago, fechaCorte: string, cfg: ConfigMora): number {
  return calcularMora(c, fechaCorte, cfg) - c.moraPagadaCentavos;
}

export function estadoCuota(c: CuotaPago, fechaCorte: string, cfg: ConfigMora): EstadoCuota {
  const pendiente =
    moraPendiente(c, fechaCorte, cfg) +
    (c.interesCentavos - c.interesPagadoCentavos) +
    (c.capitalCentavos - c.capitalPagadoCentavos);
  if (pendiente === 0) return 'PAGADO';
  const algoPagado =
    c.moraPagadaCentavos > 0 || c.interesPagadoCentavos > 0 || c.capitalPagadoCentavos > 0;
  return algoPagado ? 'PARCIAL' : 'PENDIENTE';
}

export function aplicarPago(
  cuotas: CuotaPago[],
  montoCentavos: number,
  fechaPago: string,
  cfg: ConfigMora,
): ResultadoPago {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('El pago debe ser un entero positivo en centavos');
  }

  let restante = montoCentavos;
  const detalle: DetallePago[] = [];
  const resultado: CuotaPago[] = [];

  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero);

  for (const original of ordenadas) {
    const c: CuotaPago = { ...original };
    c.moraDevengadaCentavos = calcularMora(c, fechaPago, cfg);

    const pagoMora = Math.min(restante, c.moraDevengadaCentavos - c.moraPagadaCentavos);
    restante -= pagoMora;
    c.moraPagadaCentavos += pagoMora;

    const pagoInteres = Math.min(restante, c.interesCentavos - c.interesPagadoCentavos);
    restante -= pagoInteres;
    c.interesPagadoCentavos += pagoInteres;

    const pagoCapital = Math.min(restante, c.capitalCentavos - c.capitalPagadoCentavos);
    restante -= pagoCapital;
    c.capitalPagadoCentavos += pagoCapital;

    if (pagoMora + pagoInteres + pagoCapital > 0) {
      detalle.push({
        numero: c.numero,
        moraCentavos: pagoMora,
        interesCentavos: pagoInteres,
        capitalCentavos: pagoCapital,
      });
    }
    resultado.push(c);
  }

  return { cuotas: resultado, detalle, sobranteCentavos: restante };
}
