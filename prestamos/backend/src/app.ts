import express from 'express';
import { errorHandler } from './http.js';
import { authRouter } from './modules/auth/routes.js';
import { autenticar } from './modules/auth/middleware.js';
import { cajaRouter } from './modules/caja/routes.js';
import { clientesRouter } from './modules/clientes/routes.js';
import { creditosRouter } from './modules/creditos/routes.js';
import { pagosRouter } from './modules/pagos/routes.js';
import { reportesRouter } from './modules/reportes/routes.js';
import { usuariosRouter } from './modules/usuarios/routes.js';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // Detrás de Caddy: así req.ip es la IP real de la persona y no la del proxy (importa para el límite de intentos del login)
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // datos financieros: que ningún navegador ni proxy los guarde
    next();
  });

  // Rutas públicas
  app.get('/salud', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRouter);

  // Todo lo demás exige sesión
  app.use(autenticar);
  app.get('/yo', (_req, res) =>
    res.json({ usuarioId: res.locals.usuarioId, empresaId: res.locals.empresaId, rol: res.locals.rol }),
  );
  app.use('/usuarios', usuariosRouter);
  app.use('/clientes', clientesRouter);
  app.use('/creditos', creditosRouter);
  app.use('/reportes', reportesRouter);
  app.use('/caja', cajaRouter);
  app.use(pagosRouter);

  app.use(errorHandler);
  return app;
}
