import type { EstadoCredito, Frecuencia, Metodo, Rol } from './types';

const moneda = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' });
export const lempiras = (n: number | string): string => moneda.format(Number(n));

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** '2026-10-08' -> '8 oct 2026' (sin pasar por Date, para evitar corrimientos de zona horaria) */
export function fecha(s: string): string {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

export const hoyHonduras = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());

export const redondear = (n: number): number => Math.round(n * 100) / 100;

export const ETIQUETA_METODO: Record<Metodo, string> = {
  FRANCES: 'Cuota fija (francés)',
  ALEMAN: 'Capital fijo (alemán)',
  FLAT: 'Interés fijo (flat)',
};
export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  DIARIA: 'Diaria',
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
};
export const CUOTAS_POR_FRECUENCIA: Record<Frecuencia, string> = {
  DIARIA: 'diarias',
  SEMANAL: 'semanales',
  QUINCENAL: 'quincenales',
  MENSUAL: 'mensuales',
};
export const ETIQUETA_ESTADO: Record<EstadoCredito, string> = {
  ACTIVO: 'Activo',
  FINALIZADO: 'Finalizado',
  EN_MORA: 'En mora',
  CASTIGADO: 'Castigado',
};
export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  EVALUADOR: 'Evaluador',
  COBRADOR: 'Cobrador',
  CONTADOR: 'Contador',
};

export const fechaLarga = (): string =>
  new Intl.DateTimeFormat('es-HN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Tegucigalpa' }).format(new Date());

const pct = new Intl.NumberFormat('es-HN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const porcentaje = (x: number): string => pct.format(x);

/** Enlaces para llamar o escribir por WhatsApp (números de 8 dígitos se asumen de Honduras, +504). */
export function enlacesContacto(telefono: string | null): { llamar: string; whatsapp: string } | null {
  if (!telefono) return null;
  const d = telefono.replace(/\D/g, '');
  if (d.length < 8) return null;
  const completo = d.length === 8 ? `504${d}` : d;
  return { llamar: `tel:+${completo}`, whatsapp: `https://wa.me/${completo}` };
}

export const DESCRIPCION_ROL: Record<Rol, string> = {
  ADMIN: 'Todo, incluida la gestión de usuarios',
  EVALUADOR: 'Crea clientes y créditos, y consulta',
  COBRADOR: 'Cobra pagos y consulta',
  CONTADOR: 'Solo consulta',
};

/** Contraseña aleatoria de 10 caracteres, sin letras que se confunden (0/O, 1/l/I). */
export function generarClave(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const azar = new Uint32Array(10);
  crypto.getRandomValues(azar);
  return Array.from(azar, (n) => letras[n % letras.length]).join('');
}

/** '2026-10-08T15:30:00Z' -> '8 de octubre de 2026, 9:30 a. m.' (hora de Honduras) */
export const fechaHora = (iso: string): string =>
  new Intl.DateTimeFormat('es-HN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Tegucigalpa' }).format(new Date(iso));

export const ETIQUETA_PAGO: Record<'EFECTIVO' | 'TRANSFERENCIA', string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
};

export const DESCRIPCION_METODO: Record<Metodo, string> = {
  FRANCES: 'La cuota es igual en todas. Al principio se paga más interés y al final más capital.',
  ALEMAN: 'El abono a capital es igual en todas. Las cuotas van bajando con el tiempo.',
  FLAT: 'El interés total se calcula sobre el monto inicial y se reparte parejo. Es lo habitual en préstamos diarios o semanales.',
};
export const NOMBRE_METODO_CORTO: Record<Metodo, string> = { FRANCES: 'Cuota fija', ALEMAN: 'Capital fijo', FLAT: 'Interés fijo' };
export const CADA_FRECUENCIA: Record<Frecuencia, string> = {
  DIARIA: 'cada día',
  SEMANAL: 'cada semana',
  QUINCENAL: 'cada quincena',
  MENSUAL: 'cada mes',
};
export const saludoHonduras = (): string => {
  const h = Number(new Intl.DateTimeFormat('es-HN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Tegucigalpa' }).format(new Date())) % 24;
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

export function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const inicioMes = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** '2026-10-08' -> 'jue 8 oct' */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dia = new Intl.DateTimeFormat('es-HN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${dia} ${d} ${MESES[m - 1]}`;
}

export function enlaceWhatsApp(telefono: string | null, texto: string): string | null {
  const c = enlacesContacto(telefono);
  return c ? `${c.whatsapp}?text=${encodeURIComponent(texto)}` : null;
}

/** Mensaje de recordatorio de pago, cortés y claro. El tono es más firme (sin amenazas) cuando el atraso es largo. */
export function mensajeRecordatorio(nombre: string, dias: number, pendiente: number, negocio: string): string {
  const primero = nombre.split(' ')[0];
  const monto = lempiras(pendiente);
  if (dias === 0) return `Hola ${primero}, le saluda ${negocio}. Le recordamos que hoy vence su cuota. El monto pendiente es ${monto}. Gracias por su puntualidad.`;
  if (dias <= 15) return `Hola ${primero}, le saluda ${negocio}. Su cuota venció hace ${dias} ${dias === 1 ? 'día' : 'días'} y tiene pendiente ${monto}. Le agradecemos ponerse al día. Si ya realizó el pago, por favor ignore este mensaje.`;
  return `Hola ${primero}, le saluda ${negocio}. Su pago lleva ${dias} días de atraso y tiene pendiente ${monto}. Nos gustaría ayudarle a ponerse al día: por favor comuníquese con nosotros para acordar su pago. Gracias.`;
}

/** Descarga un archivo CSV que Excel abre con las tildes bien (lleva marca BOM de UTF-8). */
export function descargarCsv(nombre: string, filas: (string | number)[][]): void {
  const celda = (v: string | number) => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const contenido = '\ufeff' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
