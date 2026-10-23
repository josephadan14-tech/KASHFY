import { Router } from 'express';
import { auditar, aCentavos, aNumeric, conTransaccion, pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, hoy, numero, soloMios, texto } from '../../http.js';
import { requerirRol } from '../auth/middleware.js';

export const cajaRouter = Router();
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

type Consulta = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

/** Efectivo y transferencias que registró cada cobrador en un día (hora de Honduras), sin contar pagos anulados. */
async function totalesPorCobrador(q: Consulta, empresaId: string, fecha: string, cobradorId: string | null) {
  const r = await q(
    `SELECT u.id, u.nombre,
            COALESCE(SUM(p.monto) FILTER (WHERE p.metodo_pago = 'EFECTIVO'), 0) AS efectivo,
            COALESCE(SUM(p.monto) FILTER (WHERE p.metodo_pago = 'TRANSFERENCIA'), 0) AS transferencias,
            COUNT(p.id) AS pagos
     FROM usuarios u
     LEFT JOIN pagos p ON p.registrado_por = u.id AND NOT p.anulado
                      AND (p.fecha_pago AT TIME ZONE 'America/Tegucigalpa')::date = $2::date
     WHERE u.empresa_id = $1 AND ($3::bigint IS NULL OR u.id = $3::bigint)
       AND (u.rol = 'COBRADOR' OR p.id IS NOT NULL) AND (u.activo OR p.id IS NOT NULL)
     GROUP BY u.id, u.nombre
     ORDER BY u.nombre`,
    [empresaId, fecha, cobradorId],
  );
  return r.rows;
}

/** Caja del día. Un cobrador solo ve su propia fila. */
cajaRouter.get(
  '/resumen',
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : hoy();
    if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Fecha inválida');

    const filas = await totalesPorCobrador((s, p) => pool.query(s, p), empresaId, fecha, soloMios(res));
    const arq = await pool.query('SELECT * FROM arqueos WHERE empresa_id=$1 AND fecha=$2::date', [empresaId, fecha]);
    const porCobrador = new Map<string, any>(arq.rows.map((a): [string, any] => [String(a.cobrador_id), a]));

    res.json({
      fecha,
      cobradores: filas.map((f) => {
        const a = porCobrador.get(String(f.id));
        return {
          cobradorId: String(f.id),
          nombre: f.nombre,
          efectivo: Number(f.efectivo),
          transferencias: Number(f.transferencias),
          pagos: Number(f.pagos),
          arqueo: a
            ? {
                id: String(a.id),
                esperado: Number(a.efectivo_esperado),
                entregado: Number(a.efectivo_entregado),
                diferencia: Number(a.diferencia),
                observacion: a.observacion,
              }
            : null,
        };
      }),
    });
  }),
);

/**
 * Registrar el arqueo de un cobrador. El efectivo esperado lo calcula el servidor (no se confía en el
 * cliente). Un arqueo no se edita: queda como constancia del día.
 */
cajaRouter.post(
  '/arqueo',
  requerirRol('ADMIN', 'CONTADOR'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const b = req.body ?? {};
    const fecha = texto(b.fecha, 'fecha');
    if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Fecha inválida');
    if (fecha > hoy()) throw new ErrorHttp(400, 'No se puede cuadrar un día que todavía no llega');
    const cobradorId = texto(String(b.cobradorId ?? ''), 'cobradorId');
    if (!/^\d+$/.test(cobradorId)) throw new ErrorHttp(400, 'Cobrador inválido');
    const entregadoC = aCentavos(numero(b.efectivoEntregado, 'efectivoEntregado'));
    if (entregadoC < 0) throw new ErrorHttp(400, 'El efectivo entregado no puede ser negativo');
    const observacion = typeof b.observacion === 'string' ? b.observacion.trim() : '';

    await conTransaccion(async (c) => {
      const fila = (await totalesPorCobrador((s, p) => c.query(s, p), empresaId, fecha, cobradorId))[0];
      if (!fila) throw new ErrorHttp(404, 'Cobrador no encontrado');

      const ya = await c.query('SELECT 1 FROM arqueos WHERE empresa_id=$1 AND fecha=$2::date AND cobrador_id=$3', [empresaId, fecha, cobradorId]);
      if (ya.rows.length > 0) throw new ErrorHttp(400, 'Ese día ya fue cuadrado para este cobrador');

      const esperadoC = aCentavos(fila.efectivo);
      const diferenciaC = entregadoC - esperadoC;
      if (diferenciaC !== 0 && observacion.length < 5) {
        throw new ErrorHttp(400, 'Hay una diferencia: explica el motivo en la observación (mínimo 5 caracteres)');
      }

      await c.query(
        `INSERT INTO arqueos (empresa_id, fecha, cobrador_id, efectivo_esperado, efectivo_entregado, diferencia, observacion, registrado_por)
         VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)`,
        [empresaId, fecha, cobradorId, aNumeric(esperadoC), aNumeric(entregadoC), aNumeric(diferenciaC), observacion || null, usuarioId],
      );
      await auditar(c, empresaId, usuarioId, 'REGISTRAR_ARQUEO', 'arqueos', cobradorId, {
        fecha, esperado: esperadoC / 100, entregado: entregadoC / 100, diferencia: diferenciaC / 100,
      });
    });
    res.status(201).json({ ok: true });
  }),
);
