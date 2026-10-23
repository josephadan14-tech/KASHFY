import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { pool } from '../../db/pool.js';
import { ErrorHttp } from '../../http.js';

export type Rol = 'ADMIN' | 'EVALUADOR' | 'COBRADOR' | 'CONTADOR';

export const secretoJwt = (): string => process.env.JWT_SECRET ?? '';

/**
 * Exige "Authorization: Bearer <token>". Con cada petición vuelve a leer al usuario en la base:
 * si lo desactivaron o le cambiaron el rol, el efecto es inmediato (no hay que esperar a que venza el token).
 */
export const autenticar: RequestHandler = (req, res, next) => {
  (async () => {
    const cabecera = req.headers.authorization ?? '';
    if (!cabecera.startsWith('Bearer ')) throw new ErrorHttp(401, 'Falta iniciar sesión');

    let datos: { sub?: string; emp?: string };
    try {
      datos = jwt.verify(cabecera.slice(7), secretoJwt()) as { sub?: string; emp?: string };
    } catch {
      throw new ErrorHttp(401, 'Sesión inválida o vencida');
    }

    const r = await pool.query(
      'SELECT id, empresa_id, rol, activo FROM usuarios WHERE id=$1 AND empresa_id=$2',
      [datos.sub, datos.emp],
    );
    const u = r.rows[0];
    if (!u || !u.activo) throw new ErrorHttp(401, 'Usuario no disponible');

    res.locals.usuarioId = String(u.id);
    res.locals.empresaId = String(u.empresa_id);
    res.locals.rol = u.rol as Rol;
    next();
  })().catch(next);
};

export const requerirRol =
  (...roles: Rol[]): RequestHandler =>
  (_req, res, next) => {
    if (roles.includes(res.locals.rol)) next();
    else next(new ErrorHttp(403, 'No tienes permiso para esta acción'));
  };
