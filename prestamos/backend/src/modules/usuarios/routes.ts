import { Router } from 'express';
import { auditar, conTransaccion, pool } from '../../db/pool.js';
import { ErrorHttp, ah, ctx, texto } from '../../http.js';
import { hashPassword } from '../auth/password.js';
import { requerirRol } from '../auth/middleware.js';

export const usuariosRouter = Router();
const ROLES = ['ADMIN', 'EVALUADOR', 'COBRADOR', 'CONTADOR'];

usuariosRouter.use(requerirRol('ADMIN'));

usuariosRouter.get(
  '/',
  ah(async (_req, res) => {
    const { empresaId } = ctx(res);
    const r = await pool.query(
      'SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE empresa_id=$1 ORDER BY id',
      [empresaId],
    );
    res.json(r.rows);
  }),
);

usuariosRouter.post(
  '/',
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const b = req.body ?? {};
    const nombre = texto(b.nombre, 'nombre');
    const email = texto(b.email, 'email').toLowerCase();
    const password = texto(b.password, 'password');
    const rol = texto(b.rol, 'rol');
    if (!ROLES.includes(rol)) throw new ErrorHttp(400, `rol debe ser: ${ROLES.join(', ')}`);
    if (password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');

    const hash = await hashPassword(password);
    const nuevo = await conTransaccion(async (c) => {
      const r = await c.query(
        `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, email, rol, activo`,
        [empresaId, nombre, email, hash, rol],
      );
      await auditar(c, empresaId, usuarioId, 'CREAR_USUARIO', 'usuarios', r.rows[0].id, { email, rol });
      return r.rows[0];
    });
    res.status(201).json(nuevo);
  }),
);

usuariosRouter.patch(
  '/:id/activo',
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    if (typeof req.body?.activo !== 'boolean') throw new ErrorHttp(400, 'activo debe ser true o false');
    if (req.params.id === usuarioId && !req.body.activo) {
      throw new ErrorHttp(400, 'No puedes desactivar tu propio usuario');
    }
    const r = await conTransaccion(async (c) => {
      const x = await c.query(
        'UPDATE usuarios SET activo=$1 WHERE id=$2 AND empresa_id=$3 RETURNING id, nombre, email, rol, activo',
        [req.body.activo, req.params.id, empresaId],
      );
      if (x.rows.length === 0) throw new ErrorHttp(404, 'Usuario no encontrado');
      await auditar(c, empresaId, usuarioId, req.body.activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', 'usuarios', x.rows[0].id, {});
      return x.rows[0];
    });
    res.json(r);
  }),
);

const idValido = (v: string): string => {
  if (!/^\d+$/.test(v)) throw new ErrorHttp(404, 'Usuario no encontrado');
  return v;
};

/** Cambiar nombre o rol. Nadie puede cambiarse su propio rol (así la empresa nunca se queda sin administrador). */
usuariosRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const id = idValido(req.params.id);
    const b = req.body ?? {};
    const nombre = b.nombre === undefined ? null : texto(b.nombre, 'nombre');
    const rol = b.rol === undefined ? null : texto(b.rol, 'rol');
    if (nombre === null && rol === null) throw new ErrorHttp(400, 'No hay nada que cambiar');
    if (rol !== null && !ROLES.includes(rol)) throw new ErrorHttp(400, `rol debe ser: ${ROLES.join(', ')}`);
    if (rol !== null && id === usuarioId) throw new ErrorHttp(400, 'No puedes cambiar tu propio rol');

    const r = await conTransaccion(async (c) => {
      const x = await c.query(
        `UPDATE usuarios SET nombre = COALESCE($1, nombre), rol = COALESCE($2, rol)
         WHERE id=$3 AND empresa_id=$4 RETURNING id, nombre, email, rol, activo`,
        [nombre, rol, id, empresaId],
      );
      if (x.rows.length === 0) throw new ErrorHttp(404, 'Usuario no encontrado');
      await auditar(c, empresaId, usuarioId, 'EDITAR_USUARIO', 'usuarios', x.rows[0].id, { nombre, rol });
      return x.rows[0];
    });
    res.json(r);
  }),
);

/** Restablecer la contraseña de un usuario (por ejemplo, si un cobrador la olvidó). */
usuariosRouter.post(
  '/:id/clave',
  ah(async (req, res) => {
    const { empresaId, usuarioId } = ctx(res);
    const id = idValido(req.params.id);
    const password = texto(req.body?.password, 'password');
    if (password.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres');

    const hash = await hashPassword(password);
    await conTransaccion(async (c) => {
      const x = await c.query('UPDATE usuarios SET password_hash=$1 WHERE id=$2 AND empresa_id=$3 RETURNING id', [hash, id, empresaId]);
      if (x.rows.length === 0) throw new ErrorHttp(404, 'Usuario no encontrado');
      await auditar(c, empresaId, usuarioId, 'RESTABLECER_CLAVE', 'usuarios', x.rows[0].id, {});
    });
    res.json({ ok: true });
  }),
);
