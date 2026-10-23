/**
 * Motor de amortización.
 * Todos los montos se manejan en CENTAVOS (enteros) para que las cuentas cuadren exacto.
 * Convierte a/desde NUMERIC(14,2) solo en el borde (base de datos / pantalla).
 *
 * Significado de `tasa`:
 *  - FRANCES y ALEMAN: tasa por período (0.05 = 5% por cada período de pago).
 *  - FLAT: tasa TOTAL sobre el monto inicial (0.10 = 10% del préstamo, repartido parejo).
 */

export type Metodo = 'FRANCES' | 'ALEMAN' | 'FLAT';
export type Frecuencia = 'DIARIA' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

export interface ParametrosCredito {
  montoCentavos: number;
  tasa: number;
  numeroCuotas: number;
  metodo: Metodo;
  frecuencia: Frecuencia;
  fechaDesembolso: string; // YYYY-MM-DD
}

export interface Cuota {
  numero: number;
  fechaVencimiento: string; // YYYY-MM-DD
  capitalCentavos: number;
  interesCentavos: number;
  totalCentavos: number;
  saldoCentavos: number; // saldo de capital después de pagar esta cuota
}

export function lempirasACentavos(valor: number): number {
  return Math.round(valor * 100);
}

export function centavosALempiras(centavos: number): number {
  return centavos / 100;
}

function validar(p: ParametrosCredito): void {
  if (!Number.isInteger(p.montoCentavos) || p.montoCentavos <= 0) {
    throw new Error('El monto debe ser un entero positivo en centavos');
  }
  if (!Number.isInteger(p.numeroCuotas) || p.numeroCuotas <= 0) {
    throw new Error('El número de cuotas debe ser un entero positivo');
  }
  if (!(p.tasa >= 0)) throw new Error('La tasa no puede ser negativa');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fechaDesembolso)) {
    throw new Error('Fecha inválida, use YYYY-MM-DD');
  }
}

/** Fecha de la cuota k (k >= 1), contada desde la fecha de desembolso. */
export function fechaCuota(base: string, frecuencia: Frecuencia, k: number): string {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  if (frecuencia === 'MENSUAL') {
    const totalMeses = m - 1 + k;
    const anio = y + Math.floor(totalMeses / 12);
    const mes = ((totalMeses % 12) + 12) % 12;
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(anio, mes, Math.min(d, ultimoDia))));
  }

  const dias = { DIARIA: 1, SEMANAL: 7, QUINCENAL: 15 }[frecuencia] * k;
  dt.setUTCDate(dt.getUTCDate() + dias);
  return iso(dt);
}

function iso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function generarAmortizacion(p: ParametrosCredito): Cuota[] {
  validar(p);
  const { montoCentavos: P, tasa: i, numeroCuotas: n } = p;
  const cuotas: Cuota[] = [];
  let saldo = P;

  const agregar = (k: number, capital: number, interes: number) => {
    saldo -= capital;
    cuotas.push({
      numero: k,
      fechaVencimiento: fechaCuota(p.fechaDesembolso, p.frecuencia, k),
      capitalCentavos: capital,
      interesCentavos: interes,
      totalCentavos: capital + interes,
      saldoCentavos: saldo,
    });
  };

  if (p.metodo === 'FRANCES') {
    const cuotaFija =
      i === 0 ? Math.round(P / n) : Math.round((P * i) / (1 - Math.pow(1 + i, -n)));
    for (let k = 1; k <= n; k++) {
      const interes = Math.round(saldo * i);
      // La última cuota absorbe el redondeo y deja el saldo en 0
      const capital = k === n ? saldo : cuotaFija - interes;
      agregar(k, capital, interes);
    }
  } else if (p.metodo === 'ALEMAN') {
    const capitalBase = Math.floor(P / n);
    for (let k = 1; k <= n; k++) {
      const interes = Math.round(saldo * i);
      const capital = k === n ? saldo : capitalBase;
      agregar(k, capital, interes);
    }
  } else {
    // FLAT: interés total fijo, capital e interés repartidos parejo
    const interesTotal = Math.round(P * i);
    const capitalBase = Math.floor(P / n);
    const interesBase = Math.floor(interesTotal / n);
    let interesAcum = 0;
    for (let k = 1; k <= n; k++) {
      const capital = k === n ? saldo : capitalBase;
      const interes = k === n ? interesTotal - interesAcum : interesBase;
      interesAcum += interes;
      agregar(k, capital, interes);
    }
  }

  return cuotas;
}
