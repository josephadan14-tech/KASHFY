import { Router } from 'express';
import { requerirRol } from '../auth/middleware.js';
import { auditar, aNumeric, conTransaccion, pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, hoy, numero, soloMios, texto } from '../../http.js';
import { aplicarPago, estadoCuota } from './index.js';
import { filaAConfigMora, filaACuotaPago } from './mapeo.js';
import { aCentavos } from '../../db/pool.js';

export const pagosRouter = Router();

pagosRouter.post(
  '/creditos/:id/pagos',
  requerirRol('ADMIN', 'COBRADOR'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const b = req.body ?? {};
    const montoCentavos = aCentavos(numero(b.monto, 'monto'));
    const metodoPago = texto(b.metodoPago, 'metodoPago');
    if (!['EFECTIVO', 'TRANSFERENCIA'].includes(metodoPago)) {
      throw new ErrorHttp(400, 'metodoPago debe ser EFECTIVO o TRANSFERENCIA');
    }
    if (montoCentavos <= 0) throw new ErrorHttp(400, 'El monto debe ser mayor a cero');
    const fecha = hoy();

    const resultado = await conTransaccion(async (c) => {
      // Bloquea el crédito: dos pagos simultáneos no pueden pisarse
      const cr = await c.query('SELECT * FROM creditos WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [req.params.id, empresaId]);
      if (cr.rows.length === 0) throw new ErrorHttp(404, 'Crédito no encontrado');
      const credito = cr.rows[0];
      const mios = soloMios(res);
      if (mios) {
        const propio = await c.query('SELECT 1 FROM creditos cr JOIN clientes cl ON cl.id = cr.cliente_id WHERE cr.id=$1 AND cl.cobrador_id=$2', [credito.id, mios]);
        if (propio.rows.length === 0) throw new ErrorHttp(404, 'Crédito no encontrado');
      }
      if (credito.estado === 'FINALIZADO') throw new ErrorHttp(400, 'El crédito ya está finalizado');

      const cu = await c.query('SELECT * FROM cuotas WHERE credito_id=$1 ORDER BY numero', [credito.id]);
      const idPorNumero = new Map<number, string>(cu.rows.map((f: any) => [f.numero, f.id]));
      const cfg = filaAConfigMora(credito);

      const r = aplicarPago(cu.rows.map(filaACuotaPago), montoCentavos, fecha, cfg);
      if (r.sobranteCentavos > 0) {
        throw new ErrorHttp(400, `El pago excede la deuda por L ${(r.sobranteCentavos / 100).toFixed(2)}`);
      }

      const pg = await c.query(
        `INSERT INTO pagos (empresa_id, credito_id, monto, metodo_pago, registrado_por)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [empresaId, credito.id, aNumeric(montoCentavos), metodoPago, usuarioId],
      );
      const pagoId = pg.rows[0].id;

      for (const q of r.cuotas) {
        await c.query(
          `UPDATE cuotas SET capital_pagado=$1, interes_pagado=$2, mora_pagada=$3, mora=$4, estado=$5
           WHERE id=$6`,
          [aNumeric(q.capitalPagadoCentavos), aNumeric(q.interesPagadoCentavos), aNumeric(q.moraPagadaCentavos),
           aNumeric(q.moraDevengadaCentavos), estadoCuota(q, fecha, cfg), idPorNumero.get(q.numero)],
        );
      }
      for (const d of r.detalle) {
        await c.query(
          `INSERT INTO pago_detalle (pago_id, cuota_id, mora, interes, capital) VALUES ($1,$2,$3,$4,$5)`,
          [pagoId, idPorNumero.get(d.numero), aNumeric(d.moraCentavos), aNumeric(d.interesCentavos), aNumeric(d.capitalCentavos)],
        );
      }

      const todoPagado = r.cuotas.every((q) => estadoCuota(q, fecha, cfg) === 'PAGADO');
      if (todoPagado) await c.query(`UPDATE creditos SET estado='FINALIZADO' WHERE id=$1`, [credito.id]);

      await auditar(c, empresaId, usuarioId, 'REGISTRAR_PAGO', 'pagos', pagoId, { monto: montoCentavos / 100, metodoPago });

      return {
        pagoId,
        monto: montoCentavos / 100,
        aplicado: r.detalle.map((d) => ({
          cuota: d.numero,
          mora: d.moraCentavos / 100,
          interes: d.interesCentavos / 100,
          capital: d.capitalCentavos / 100,
        })),
        estadoCredito: todoPagado ? 'FINALIZADO' : credito.estado,
      };
    });

    res.status(201).json(resultado);
  }),
);

const idNum = (v: string): string => {
  if (!/^\d+$/.test(v)) throw new ErrorHttp(404, 'No encontrado');
  return v;
};

/** Pagos de un crédito, del más reciente al más antiguo. */
pagosRouter.get(
  '/creditos/:id/pagos',
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const r = await pool.query(
      `SELECT p.id, p.fecha_pago, p.monto, p.metodo_pago, p.anulado, u.nombre AS registrado_por
       FROM pagos p JOIN usuarios u ON u.id = p.registrado_por
       JOIN creditos cr ON cr.id = p.credito_id JOIN clientes cl ON cl.id = cr.cliente_id
       WHERE p.credito_id = $1 AND p.empresa_id = $2 AND ($3::bigint IS NULL OR cl.cobrador_id = $3::bigint)
       ORDER BY p.id DESC`,
      [idNum(req.params.id), empresaId, soloMios(res)],
    );
    res.json(r.rows);
  }),
);

/** Datos del recibo de un pago. */
pagosRouter.get(
  '/pagos/:id',
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const id = idNum(req.params.id);
    const p = await pool.query(
      `SELECT p.id, p.credito_id, p.fecha_pago, p.monto, p.metodo_pago, p.anulado, p.motivo_anulacion,
              u.nombre AS registrado_por, cl.nombres, cl.documento, cl.telefono, e.nombre AS empresa
       FROM pagos p
       JOIN creditos cr ON cr.id = p.credito_id
       JOIN clientes cl ON cl.id = cr.cliente_id
       JOIN usuarios u ON u.id = p.registrado_por
       JOIN empresas e ON e.id = p.empresa_id
       WHERE p.id = $1 AND p.empresa_id = $2 AND ($3::bigint IS NULL OR cl.cobrador_id = $3::bigint)`,
      [id, empresaId, soloMios(res)],
    );
    if (p.rows.length === 0) throw new ErrorHttp(404, 'Pago no encontrado');
    const f = p.rows[0];

    const d = await pool.query(
      `SELECT cu.numero, d.mora, d.interes, d.capital
       FROM pago_detalle d JOIN cuotas cu ON cu.id = d.cuota_id
       WHERE d.pago_id = $1 ORDER BY cu.numero`,
      [id],
    );
    const detalle = d.rows.map((x) => ({
      cuota: x.numero as number,
      mora: Number(x.mora),
      interes: Number(x.interes),
      capital: Number(x.capital),
    }));

    // Saldo de capital e interés que quedaba justo después de este pago (sin contar la mora)
    const s = await pool.query(
      `SELECT (SELECT COALESCE(SUM(capital + interes), 0) FROM cuotas WHERE credito_id = $1)
            - (SELECT COALESCE(SUM(d.capital + d.interes), 0)
               FROM pago_detalle d JOIN pagos pg ON pg.id = d.pago_id
               WHERE pg.credito_id = $1 AND NOT pg.anulado AND pg.id <= $2) AS saldo`,
      [f.credito_id, id],
    );

    const suma = (k: 'mora' | 'interes' | 'capital') => Math.round(detalle.reduce((t, x) => t + x[k], 0) * 100) / 100;
    res.json({
      id: String(f.id),
      numero: `R-${String(f.id).padStart(6, '0')}`,
      fecha: f.fecha_pago,
      monto: Number(f.monto),
      metodoPago: f.metodo_pago,
      registradoPor: f.registrado_por,
      anulado: f.anulado,
      motivoAnulacion: f.motivo_anulacion,
      empresa: f.empresa,
      creditoId: String(f.credito_id),
      cliente: { nombres: f.nombres, documento: f.documento, telefono: f.telefono },
      detalle,
      totales: { mora: suma('mora'), interes: suma('interes'), capital: suma('capital') },
      saldoDespues: Number(s.rows[0].saldo),
    });
  }),
);

/**
 * Anular un pago (solo administrador, con motivo). Solo se puede anular el ÚLTIMO pago vigente del
 * crédito: así las cuotas vuelven exactamente al estado que tenían, sin dejar pagos posteriores
 * apoyados en uno que ya no existe.
 */
pagosRouter.post(
  '/pagos/:id/anular',
  requerirRol('ADMIN'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const id = idNum(req.params.id);
    const motivo = texto(req.body?.motivo, 'motivo');
    if (motivo.length < 5) throw new ErrorHttp(400, 'Explica el motivo de la anulación (mínimo 5 caracteres)');

    await conTransaccion(async (c) => {
      const p = await c.query('SELECT id, credito_id, monto FROM pagos WHERE id=$1 AND empresa_id=$2', [id, empresaId]);
      if (p.rows.length === 0) throw new ErrorHttp(404, 'Pago no encontrado');
      const pago = p.rows[0];

      // Bloquea el crédito y revisa DESPUÉS del bloqueo (evita anular dos veces a la vez)
      const cr = await c.query('SELECT * FROM creditos WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [pago.credito_id, empresaId]);
      const credito = cr.rows[0];
      const estado = await c.query('SELECT anulado FROM pagos WHERE id=$1', [id]);
      if (estado.rows[0].anulado) throw new ErrorHttp(400, 'Este pago ya está anulado');

      const ultimo = await c.query('SELECT id FROM pagos WHERE credito_id=$1 AND NOT anulado ORDER BY id DESC LIMIT 1', [pago.credito_id]);
      if (String(ultimo.rows[0].id) !== id) {
        throw new ErrorHttp(400, 'Solo se puede anular el último pago del crédito. Anula primero los pagos más recientes.');
      }

      // Devuelve a cada cuota lo que este pago le había abonado
      await c.query(
        `UPDATE cuotas c SET capital_pagado = c.capital_pagado - d.capital,
                             interes_pagado = c.interes_pagado - d.interes,
                             mora_pagada    = c.mora_pagada - d.mora
         FROM pago_detalle d WHERE d.pago_id = $1 AND d.cuota_id = c.id`,
        [id],
      );

      // Recalcula el estado de cada cuota con lo que quedó
      const cu = await c.query('SELECT * FROM cuotas WHERE credito_id=$1 ORDER BY numero', [pago.credito_id]);
      const cfg = filaAConfigMora(credito);
      const fecha = hoy();
      for (const f of cu.rows) {
        await c.query('UPDATE cuotas SET estado=$1 WHERE id=$2', [estadoCuota(filaACuotaPago(f), fecha, cfg), f.id]);
      }
      if (credito.estado === 'FINALIZADO') await c.query(`UPDATE creditos SET estado='ACTIVO' WHERE id=$1`, [pago.credito_id]);

      await c.query(
        'UPDATE pagos SET anulado=TRUE, motivo_anulacion=$1, anulado_por=$2, anulado_en=now() WHERE id=$3',
        [motivo, usuarioId, id],
      );
      await auditar(c, empresaId, usuarioId, 'ANULAR_PAGO', 'pagos', id, { motivo, monto: Number(pago.monto), creditoId: String(pago.credito_id) });
    });

    res.json({ ok: true });
  }),
);
