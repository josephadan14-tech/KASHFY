import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, hoy, soloMios } from '../../http.js';
import { requerirRol } from '../auth/middleware.js';

export const reportesRouter = Router();

/**
 * Resumen para la pantalla de inicio.
 * Las cifras de atraso son de CAPITAL pendiente de cuotas vencidas (sin mora devengada),
 * para que se puedan comparar contra la cartera, que también es capital pendiente.
 */
reportesRouter.get(
  '/resumen',
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const fecha = hoy();
    const mios = soloMios(res);

    const b = await pool.query(
      `WITH pend AS (
         SELECT c.credito_id, c.fecha_vencimiento,
                (c.capital - c.capital_pagado) AS capital_pend,
                (c.capital - c.capital_pagado) + (c.interes - c.interes_pagado) AS pend
         FROM cuotas c JOIN creditos cr ON cr.id = c.credito_id JOIN clientes cl ON cl.id = cr.cliente_id
         WHERE c.empresa_id = $1 AND c.estado <> 'PAGADO' AND cr.estado IN ('ACTIVO','EN_MORA')
           AND ($3::bigint IS NULL OR cl.cobrador_id = $3::bigint)
       )
       SELECT
         COALESCE(SUM(capital_pend), 0) AS cartera,
         COUNT(DISTINCT credito_id) AS creditos_activos,
         COUNT(DISTINCT credito_id) FILTER (WHERE fecha_vencimiento < $2::date AND pend > 0) AS creditos_en_mora,
         COALESCE(SUM(pend) FILTER (WHERE fecha_vencimiento = $2::date), 0) AS por_cobrar_hoy,
         COALESCE(SUM(capital_pend) FILTER (WHERE $2::date - fecha_vencimiento BETWEEN 1 AND 15), 0) AS d1_15,
         COALESCE(SUM(capital_pend) FILTER (WHERE $2::date - fecha_vencimiento BETWEEN 16 AND 30), 0) AS d16_30,
         COALESCE(SUM(capital_pend) FILTER (WHERE $2::date - fecha_vencimiento BETWEEN 31 AND 60), 0) AS d31_60,
         COALESCE(SUM(capital_pend) FILTER (WHERE $2::date - fecha_vencimiento > 60), 0) AS d60_mas
       FROM pend`,
      [empresaId, fecha, mios],
    );

    const p = await pool.query(
      `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS n
       FROM pagos
       WHERE empresa_id = $1 AND NOT anulado
         AND (fecha_pago AT TIME ZONE 'America/Tegucigalpa')::date = $2::date
         AND ($3::bigint IS NULL OR registrado_por = $3::bigint)`,
      [empresaId, fecha, mios],
    );

    const f = b.rows[0];
    res.json({
      fecha,
      cartera: Number(f.cartera),
      creditosActivos: Number(f.creditos_activos),
      creditosEnMora: Number(f.creditos_en_mora),
      porCobrarHoy: Number(f.por_cobrar_hoy),
      cobradoHoy: Number(p.rows[0].total),
      pagosHoy: Number(p.rows[0].n),
      atraso: {
        d1_15: Number(f.d1_15),
        d16_30: Number(f.d16_30),
        d31_60: Number(f.d31_60),
        d60mas: Number(f.d60_mas),
      },
    });
  }),
);

/** Créditos con cuotas que vencen hoy o están atrasadas: la lista de trabajo del cobrador. */
reportesRouter.get(
  '/cobros',
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const r = await pool.query(
      `SELECT cr.id AS credito_id, cl.nombres AS cliente, cl.telefono, cl.zona,
              MAX($2::date - c.fecha_vencimiento) AS dias_atraso,
              COUNT(*) AS cuotas,
              SUM((c.capital - c.capital_pagado) + (c.interes - c.interes_pagado)) AS pendiente
       FROM cuotas c
       JOIN creditos cr ON cr.id = c.credito_id
       JOIN clientes cl ON cl.id = cr.cliente_id
       WHERE c.empresa_id = $1 AND c.estado <> 'PAGADO' AND cr.estado IN ('ACTIVO','EN_MORA')
         AND c.fecha_vencimiento <= $2::date
         AND (c.capital - c.capital_pagado) + (c.interes - c.interes_pagado) > 0
         AND ($3::bigint IS NULL OR cl.cobrador_id = $3::bigint)
       GROUP BY cr.id, cl.nombres, cl.telefono, cl.zona
       ORDER BY dias_atraso DESC, cl.nombres
       LIMIT 300`,
      [empresaId, hoy(), soloMios(res)],
    );
    res.json(
      r.rows.map((f) => ({
        creditoId: String(f.credito_id),
        cliente: f.cliente,
        telefono: f.telefono,
        zona: f.zona,
        diasAtraso: Number(f.dias_atraso),
        cuotas: Number(f.cuotas),
        pendiente: Number(f.pendiente),
      })),
    );
  }),
);

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sumarDias = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const redondear = (n: number): number => Math.round(n * 100) / 100;

/**
 * Flujo de caja proyectado: lo que se espera cobrar (capital + interés pendientes) en los próximos 30 días,
 * día por día, más lo que ya está vencido y falta por recuperar. No incluye mora todavía no devengada.
 */
reportesRouter.get(
  '/flujo',
  requerirRol('ADMIN', 'CONTADOR'),
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const fecha = hoy();

    const futuro = await pool.query(
      `SELECT c.fecha_vencimiento AS dia,
              SUM((c.capital - c.capital_pagado) + (c.interes - c.interes_pagado)) AS monto,
              COUNT(*) AS cuotas
       FROM cuotas c JOIN creditos cr ON cr.id = c.credito_id
       WHERE c.empresa_id = $1 AND c.estado <> 'PAGADO' AND cr.estado IN ('ACTIVO','EN_MORA')
         AND c.fecha_vencimiento BETWEEN $2::date AND ($2::date + 29)
       GROUP BY c.fecha_vencimiento
       HAVING SUM((c.capital - c.capital_pagado) + (c.interes - c.interes_pagado)) > 0`,
      [empresaId, fecha],
    );
    const vencido = await pool.query(
      `SELECT COALESCE(SUM((c.capital - c.capital_pagado) + (c.interes - c.interes_pagado)), 0) AS monto,
              COUNT(DISTINCT c.credito_id) AS creditos
       FROM cuotas c JOIN creditos cr ON cr.id = c.credito_id
       WHERE c.empresa_id = $1 AND c.estado <> 'PAGADO' AND cr.estado IN ('ACTIVO','EN_MORA')
         AND c.fecha_vencimiento < $2::date`,
      [empresaId, fecha],
    );

    const porDia = new Map<string, { monto: number; cuotas: number }>(
      futuro.rows.map((f): [string, { monto: number; cuotas: number }] => [f.dia, { monto: Number(f.monto), cuotas: Number(f.cuotas) }]),
    );
    const dias = Array.from({ length: 30 }, (_, i) => {
      const dia = sumarDias(fecha, i);
      const v = porDia.get(dia);
      return { fecha: dia, monto: redondear(v?.monto ?? 0), cuotas: v?.cuotas ?? 0 };
    });
    res.json({ fecha, vencido: Number(vencido.rows[0].monto), creditosVencidos: Number(vencido.rows[0].creditos), dias });
  }),
);

/**
 * Historial de caja entre dos fechas (por defecto, los últimos 30 días): lo cobrado cada día (separado en
 * capital, interés y mora) y lo desembolsado en créditos nuevos. Los pagos anulados no cuentan.
 */
reportesRouter.get(
  '/historial',
  requerirRol('ADMIN', 'CONTADOR'),
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : hoy();
    const desde = typeof req.query.desde === 'string' ? req.query.desde : sumarDias(hasta, -29);
    if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new ErrorHttp(400, 'Fechas inválidas (use AAAA-MM-DD)');
    if (desde > hasta) throw new ErrorHttp(400, 'La fecha inicial no puede ser posterior a la final');
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;
    if (dias > 366) throw new ErrorHttp(400, 'El período máximo es de un año');

    const cobros = await pool.query(
      `SELECT (p.fecha_pago AT TIME ZONE 'America/Tegucigalpa')::date AS dia,
              SUM(d.capital) AS capital, SUM(d.interes) AS interes, SUM(d.mora) AS mora, COUNT(DISTINCT p.id) AS pagos
       FROM pagos p JOIN pago_detalle d ON d.pago_id = p.id
       WHERE p.empresa_id = $1 AND NOT p.anulado
         AND (p.fecha_pago AT TIME ZONE 'America/Tegucigalpa')::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [empresaId, desde, hasta],
    );
    const desembolsos = await pool.query(
      `SELECT fecha_desembolso AS dia, SUM(monto) AS monto
       FROM creditos WHERE empresa_id = $1 AND fecha_desembolso BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [empresaId, desde, hasta],
    );

    const cob = new Map<string, any>(cobros.rows.map((f): [string, any] => [f.dia, f]));
    const des = new Map<string, number>(desembolsos.rows.map((f): [string, number] => [f.dia, Number(f.monto)]));
    const lista = Array.from({ length: dias }, (_, i) => {
      const dia = sumarDias(desde, i);
      const c = cob.get(dia);
      const capital = redondear(Number(c?.capital ?? 0));
      const interes = redondear(Number(c?.interes ?? 0));
      const mora = redondear(Number(c?.mora ?? 0));
      return { fecha: dia, capital, interes, mora, cobrado: redondear(capital + interes + mora), pagos: Number(c?.pagos ?? 0), desembolsado: redondear(des.get(dia) ?? 0) };
    });
    const total = (k: 'capital' | 'interes' | 'mora' | 'cobrado' | 'pagos' | 'desembolsado') => redondear(lista.reduce((s, d) => s + d[k], 0));
    res.json({
      desde,
      hasta,
      dias: lista,
      totales: {
        capital: total('capital'), interes: total('interes'), mora: total('mora'), cobrado: total('cobrado'),
        pagos: total('pagos'), desembolsado: total('desembolsado'),
        neto: redondear(total('cobrado') - total('desembolsado')),
      },
    });
  }),
);
