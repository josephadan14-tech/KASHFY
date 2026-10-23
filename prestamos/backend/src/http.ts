import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class ErrorHttp extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Envuelve handlers async para que los errores lleguen al manejador de errores */
export const ah =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** TEMPORAL: empresa/usuario fijos desde .env hasta implementar login y roles */
export const ctx = (res: Response) => ({
  empresaId: String(res.locals.empresaId),
  usuarioId: String(res.locals.usuarioId),
});

/** Fecha de hoy en Honduras (UTC-6) como YYYY-MM-DD */
export const hoy = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());

export function texto(v: unknown, campo: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new ErrorHttp(400, `Falta ${campo}`);
  return v.trim();
}

export function numero(v: unknown, campo: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ErrorHttp(400, `${campo} debe ser un número`);
  return v;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ErrorHttp) {
    res.status(err.status).json({ error: err.message });
  } else if (err?.code === '23505') {
    res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/** Si quien consulta es COBRADOR, devuelve su id (solo debe ver lo suyo); para los demás roles, null (ven todo). */
export const soloMios = (res: Response): string | null =>
  res.locals.rol === 'COBRADOR' ? String(res.locals.usuarioId) : null;
