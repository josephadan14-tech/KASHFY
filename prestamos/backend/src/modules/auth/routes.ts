import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool.js';
import { ErrorHttp, ah, texto } from '../../http.js';
import { secretoJwt } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';

export const authRouter = Router();

const DURACION_SEGUNDOS = 8 * 3600;
const MAX_INTENTOS = 10;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map<string, { cuenta: number; desde: number }>();
// Para que tardar lo mismo exista o no el email (no revelar qué cuentas existen)
const HASH_FALSO = hashPassword('contraseña-falsa-para-igualar-tiempos');

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const b = req.body ?? {};
    const email = texto(b.email, 'email').toLowerCase();
    const password = texto(b.password, 'password');

    const clave = `${req.ip}|${email}`;
    const previo = fallos.get(clave);
    if (previo && Date.now() - previo.desde < VENTANA_MS && previo.cuenta >= MAX_INTENTOS) {
      throw new ErrorHttp(429, 'Demasiados intentos. Espera unos minutos.');
    }

    const r = await pool.query(
      `SELECT id, empresa_id, nombre, rol, password_hash FROM usuarios
       WHERE lower(email)=$1 AND activo AND ($2::bigint IS NULL OR empresa_id=$2::bigint)`,
      [email, b.empresaId ?? null],
    );
    if (r.rows.length > 1) throw new ErrorHttp(400, 'Ese email existe en varias empresas: indica empresaId');

    const u = r.rows[0];
    const ok = u
      ? await verifyPassword(password, u.password_hash)
      : (await verifyPassword(password, await HASH_FALSO), false);

    if (!ok) {
      const vigente = previo && Date.now() - previo.desde < VENTANA_MS;
      fallos.set(clave, { cuenta: (vigente ? previo.cuenta : 0) + 1, desde: vigente ? previo.desde : Date.now() });
      throw new ErrorHttp(401, 'Email o contraseña incorrectos');
    }
    fallos.delete(clave);

    const token = jwt.sign({ sub: String(u.id), emp: String(u.empresa_id) }, secretoJwt(), {
      expiresIn: DURACION_SEGUNDOS,
    });
    res.json({ token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol, empresaId: u.empresa_id } });
  }),
);
