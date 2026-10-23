import { Router } from 'express';
import { auditar, aCentavos, aNumeric, conTransaccion, pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, hoy, numero, soloMios, texto } from '../../http.js';
import { generarAmortizacion, type Cuota, type Frecuencia, type Metodo } from '../amortizacion/index.js';
import { calcularMora, diasAtraso, estadoCuota } from '../pagos/index.js';
import { filaAConfigMora, filaACuotaPago } from '../pagos/mapeo.js';
import { requerirRol } from '../auth/middleware.js';

export const creditosRouter = Router();

const METODOS = ['FRANCES', 'ALEMAN', 'FLAT'];
const FRECUENCIAS = ['DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL'];

/** Lee y valida los datos del crédito (los mismos para simular y para crear). */
function leerParametros(b: any) {
  const monto = numero(b.monto, 'monto');
  const tasa = numero(b.tasa, 'tasa'); // decimal: 0.05 = 5%
  const numeroCuotas = numero(b.numeroCuotas, 'numeroCuotas');
  const metodo = texto(b.metodo, 'metodo');
  const frecuencia = texto(b.frecuencia, 'frecuencia');
  const fechaDesembolso = texto(b.fechaDesembolso, 'fechaDesembolso');
  if (!METODOS.includes(metodo)) throw new ErrorHttp(400, `metodo debe ser: ${METODOS.join(', ')}`);
  if (!FRECUENCIAS.includes(frecuencia)) throw new ErrorHttp(400, `frecuencia debe ser: ${FRECUENCIAS.join(', ')}`);

  const diasGracia = b.diasGracia ?? 0;
  const moraPorcentajeDia = b.moraPorcentajeDia ?? 0; // decimal: 0.01 = 1% diario
  const moraMontoFijo = b.moraMontoFijo ?? 0; // lempiras
  if (!Number.isInteger(diasGracia) || diasGracia < 0) throw new ErrorHttp(400, 'diasGracia debe ser un entero desde 0');
  if (typeof moraPorcentajeDia !== 'number' || moraPorcentajeDia < 0 || moraPorcentajeDia > 1) {
    throw new ErrorHttp(400, 'moraPorcentajeDia debe estar entre 0 y 1 (0.01 = 1%)');
  }
  if (typeof moraMontoFijo !== 'number' || moraMontoFijo < 0) throw new ErrorHttp(400, 'moraMontoFijo no puede ser negativo');

  let cuotas: Cuota[];
  try {
    cuotas = generarAmortizacion({
      montoCentavos: aCentavos(monto),
      tasa,
      numeroCuotas,
      metodo: metodo as Metodo,
      frecuencia: frecuencia as Frecuencia,
      fechaDesembolso,
    });
  } catch (e) {
    throw new ErrorHttp(400, (e as Error).message);
  }
  return { monto, tasa, numeroCuotas, metodo, frecuencia, fechaDesembolso, diasGracia, moraPorcentajeDia, moraMontoFijo, cuotas };
}

const cuotasALempiras = (cuotas: Cuota[]) =>
  cuotas.map((q) => ({
    numero: q.numero,
    fechaVencimiento: q.fechaVencimiento,
    capital: q.capitalCentavos / 100,
    interes: q.interesCentavos / 100,
    total: q.totalCentavos / 100,
    saldo: q.saldoCentavos / 100,
  }));

/** Calcula las cuotas sin guardar nada (vista previa antes de aprobar). */
creditosRouter.post(
  '/simular',
  requerirRol('ADMIN', 'EVALUADOR'),
  ah(async (req, res) => {
    const p = leerParametros(req.body ?? {});
    res.json({ cuotas: cuotasALempiras(p.cuotas) });
  }),
);

creditosRouter.post(
  '/',
  requerirRol('ADMIN', 'EVALUADOR'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const b = req.body ?? {};
    const clienteId = texto(String(b.clienteId ?? ''), 'clienteId');
    const p = leerParametros(b);

    const credito = await conTransaccion(async (c) => {
      const cli = await c.query('SELECT id, estado FROM clientes WHERE id=$1 AND empresa_id=$2', [clienteId, empresaId]);
      if (cli.rows.length === 0) throw new ErrorHttp(404, 'Cliente no encontrado');
      if (cli.rows[0].estado === 'LISTA_NEGRA') throw new ErrorHttp(400, 'El cliente está en lista negra');

      const cr = await c.query(
        `INSERT INTO creditos (empresa_id, cliente_id, monto, tasa, numero_cuotas, frecuencia, metodo,
                               fecha_desembolso, dias_gracia, mora_porcentaje_dia, mora_monto_fijo, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [empresaId, clienteId, aNumeric(aCentavos(p.monto)), p.tasa, p.numeroCuotas, p.frecuencia, p.metodo,
         p.fechaDesembolso, p.diasGracia, p.moraPorcentajeDia, aNumeric(aCentavos(p.moraMontoFijo)), usuarioId],
      );
      const nuevo = cr.rows[0];

      for (const q of p.cuotas) {
        await c.query(
          `INSERT INTO cuotas (empresa_id, credito_id, numero, fecha_vencimiento, capital, interes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [empresaId, nuevo.id, q.numero, q.fechaVencimiento, aNumeric(q.capitalCentavos), aNumeric(q.interesCentavos)],
        );
      }
      await auditar(c, empresaId, usuarioId, 'CREAR_CREDITO', 'creditos', nuevo.id, {
        monto: p.monto, tasa: p.tasa, numeroCuotas: p.numeroCuotas, metodo: p.metodo, frecuencia: p.frecuencia,
      });
      return nuevo;
    });

    res.status(201).json({ credito, cuotas: cuotasALempiras(p.cuotas) });
  }),
);

/** Lista de créditos (opcional ?clienteId=) */
creditosRouter.get(
  '/',
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const filtro = req.query.clienteId ? String(req.query.clienteId) : null;
    const r = await pool.query(
      `SELECT c.id, c.cliente_id, c.monto, c.estado, c.metodo, c.frecuencia, c.numero_cuotas,
              c.fecha_desembolso, cl.nombres AS cliente
       FROM creditos c JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.empresa_id=$1 AND ($2::bigint IS NULL OR c.cliente_id=$2::bigint)
         AND ($3::bigint IS NULL OR cl.cobrador_id=$3::bigint)
       ORDER BY c.id DESC LIMIT 200`,
      [empresaId, filtro, soloMios(res)],
    );
    res.json(r.rows);
  }),
);

creditosRouter.get(
  '/:id',
  ah(async (req, res) => {
    const { empresaId } = ctx(res);
    const cr = await pool.query(
      `SELECT c.*, cl.nombres AS cliente_nombres, cl.documento AS cliente_documento
       FROM creditos c JOIN clientes cl ON cl.id = c.cliente_id
       WHERE c.id=$1 AND c.empresa_id=$2 AND ($3::bigint IS NULL OR cl.cobrador_id=$3::bigint)`,
      [req.params.id, empresaId, soloMios(res)],
    );
    if (cr.rows.length === 0) throw new ErrorHttp(404, 'Crédito no encontrado');
    const credito = cr.rows[0];
    const cfg = filaAConfigMora(credito);
    const fecha = hoy();

    const cu = await pool.query('SELECT * FROM cuotas WHERE credito_id=$1 ORDER BY numero', [credito.id]);
    const cuotas = cu.rows.map((f) => {
      const c = filaACuotaPago(f);
      const mora = calcularMora(c, fecha, cfg);
      return {
        numero: c.numero,
        fechaVencimiento: c.fechaVencimiento,
        estado: estadoCuota(c, fecha, cfg),
        diasAtraso: diasAtraso(c.fechaVencimiento, fecha),
        capital: c.capitalCentavos / 100,
        interes: c.interesCentavos / 100,
        moraPendiente: (mora - c.moraPagadaCentavos) / 100,
        interesPendiente: (c.interesCentavos - c.interesPagadoCentavos) / 100,
        capitalPendiente: (c.capitalCentavos - c.capitalPagadoCentavos) / 100,
        pendienteTotal:
          (mora - c.moraPagadaCentavos + (c.interesCentavos - c.interesPagadoCentavos) + (c.capitalCentavos - c.capitalPagadoCentavos)) / 100,
      };
    });
    res.json({ credito, fechaConsulta: fecha, cuotas });
  }),
);
