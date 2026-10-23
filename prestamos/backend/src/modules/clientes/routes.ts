import { Router } from 'express';
import { auditar, conTransaccion, pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, soloMios, texto } from '../../http.js';
import { requerirRol } from '../auth/middleware.js';

export const clientesRouter = Router();

type Consulta = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

/** Comprueba que el cobrador exista, esté activo y sea de esta empresa. */
async function exigirCobrador(q: Consulta, empresaId: string, cobradorId: unknown): Promise<string | null> {
  if (cobradorId === null || cobradorId === undefined || cobradorId === '') return null;
  const id = String(cobradorId);
  if (!/^\d+$/.test(id)) throw new ErrorHttp(400, 'Cobrador inválido');
  const r = await q(`SELECT id FROM usuarios WHERE id=$1 AND empresa_id=$2 AND rol='COBRADOR' AND activo`, [id, empresaId]);
  if (r.rows.length === 0) throw new ErrorHttp(400, 'Ese cobrador no existe o está desactivado');
  return id;
}

const limpiar = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** Cobradores activos, para elegir a quién asignar un cliente. */
clientesRouter.get(
  '/cobradores',
  requerirRol('ADMIN', 'EVALUADOR'),
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const r = await pool.query(`SELECT id, nombre FROM usuarios WHERE empresa_id=$1 AND rol='COBRADOR' AND activo ORDER BY nombre`, [empresaId]);
    res.json(r.rows);
  }),
);

clientesRouter.post(
  '/',
  requerirRol('ADMIN', 'EVALUADOR'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const b = req.body ?? {};
    const nombres = texto(b.nombres, 'nombres');
    const documento = texto(b.documento, 'documento');

    const cliente = await conTransaccion(async (c) => {
      const cobradorId = await exigirCobrador((s, p) => c.query(s, p), empresaId, b.cobradorId);
      const r = await c.query(
        `INSERT INTO clientes (empresa_id, nombres, documento, telefono, direccion, zona, cobrador_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [empresaId, nombres, documento, limpiar(b.telefono), limpiar(b.direccion), limpiar(b.zona), cobradorId],
      );
      await auditar(c, empresaId, usuarioId, 'CREAR_CLIENTE', 'clientes', r.rows[0].id, { nombres, documento });
      return r.rows[0];
    });
    res.status(201).json(cliente);
  }),
);

clientesRouter.get(
  '/',
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const r = await pool.query(
      `SELECT c.*, u.nombre AS cobrador
       FROM clientes c LEFT JOIN usuarios u ON u.id = c.cobrador_id
       WHERE c.empresa_id = $1 AND ($2::bigint IS NULL OR c.cobrador_id = $2::bigint)
       ORDER BY c.id DESC LIMIT 300`,
      [empresaId, soloMios(res)],
    );
    res.json(r.rows);
  }),
);

/** Asignar o cambiar el cobrador y la zona de un cliente. */
clientesRouter.patch(
  '/:id/asignacion',
  requerirRol('ADMIN', 'EVALUADOR'),
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    if (!/^\d+$/.test(req.params.id)) throw new ErrorHttp(404, 'Cliente no encontrado');
    const b = req.body ?? {};
    if (!('cobradorId' in b) && !('zona' in b)) throw new ErrorHttp(400, 'No hay nada que cambiar');

    const r = await conTransaccion(async (c) => {
      const actual = await c.query('SELECT cobrador_id, zona FROM clientes WHERE id=$1 AND empresa_id=$2 FOR UPDATE', [req.params.id, empresaId]);
      if (actual.rows.length === 0) throw new ErrorHttp(404, 'Cliente no encontrado');
      const cobradorId = 'cobradorId' in b ? await exigirCobrador((s, p) => c.query(s, p), empresaId, b.cobradorId) : actual.rows[0].cobrador_id;
      const zona = 'zona' in b ? limpiar(b.zona) : actual.rows[0].zona;
      const x = await c.query('UPDATE clientes SET cobrador_id=$1, zona=$2 WHERE id=$3 RETURNING *', [cobradorId, zona, req.params.id]);
      await auditar(c, empresaId, usuarioId, 'ASIGNAR_CLIENTE', 'clientes', req.params.id, { cobradorId, zona });
      return x.rows[0];
    });
    res.json(r);
  }),
);
