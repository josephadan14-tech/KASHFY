import type { Rol, Sesion } from './types';

const CLAVE = 'prestamos.sesion';

// La sesión vive en sessionStorage: se borra al cerrar la pestaña.
export function leerSesion(): Sesion | null {
  try {
    const s = sessionStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}
export const guardarSesion = (s: Sesion) => sessionStorage.setItem(CLAVE, JSON.stringify(s));
export const cerrarSesion = () => sessionStorage.removeItem(CLAVE);

export const puedeCrear = (rol: Rol) => rol === 'ADMIN' || rol === 'EVALUADOR';
export const puedeCobrar = (rol: Rol) => rol === 'ADMIN' || rol === 'COBRADOR';

export class ErrorApi extends Error {
  constructor(public estado: number, mensaje: string) {
    super(mensaje);
  }
}

export const mensajeError = (e: unknown): string => (e instanceof Error ? e.message : 'Ocurrió un error inesperado');

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const sesion = leerSesion();
  let r: Response;
  try {
    r = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    });
  } catch {
    throw new ErrorApi(
      0,
      navigator.onLine === false
        ? 'No hay conexión a internet. Vuelve a intentarlo cuando regrese la señal.'
        : 'No se pudo conectar con el servidor. Inténtalo de nuevo en un momento.',
    );
  }

  let datos: any = null;
  try {
    datos = await r.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!r.ok) {
    if (r.status === 401 && ruta !== '/auth/login') {
      cerrarSesion();
      window.dispatchEvent(new Event('sesion-vencida'));
    }
    throw new ErrorApi(r.status, datos?.error ?? 'No se pudo completar la acción');
  }
  return datos as T;
}
