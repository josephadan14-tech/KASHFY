export type Rol = 'ADMIN' | 'EVALUADOR' | 'COBRADOR' | 'CONTADOR';
export type Metodo = 'FRANCES' | 'ALEMAN' | 'FLAT';
export type Frecuencia = 'DIARIA' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
export type EstadoCredito = 'ACTIVO' | 'FINALIZADO' | 'EN_MORA' | 'CASTIGADO';
export type EstadoCuota = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';

export interface Sesion {
  token: string;
  usuario: { id: string | number; nombre: string; rol: Rol; empresaId: string | number };
}

export interface Cliente {
  id: string;
  nombres: string;
  documento: string;
  telefono: string | null;
  direccion: string | null;
  zona: string | null;
  cobrador_id: string | null;
  cobrador: string | null;
  estado: 'ACTIVO' | 'LISTA_NEGRA';
}

export interface CreditoResumen {
  id: string;
  cliente_id: string;
  cliente: string;
  monto: string;
  estado: EstadoCredito;
  metodo: Metodo;
  frecuencia: Frecuencia;
  numero_cuotas: number;
  fecha_desembolso: string;
}

export interface CuotaDetalle {
  numero: number;
  fechaVencimiento: string;
  estado: EstadoCuota;
  diasAtraso: number;
  capital: number;
  interes: number;
  moraPendiente: number;
  interesPendiente: number;
  capitalPendiente: number;
  pendienteTotal: number;
}

export interface DetalleCredito {
  credito: {
    id: string;
    monto: string;
    tasa: string;
    numero_cuotas: number;
    frecuencia: Frecuencia;
    metodo: Metodo;
    fecha_desembolso: string;
    dias_gracia: number;
    mora_porcentaje_dia: string;
    mora_monto_fijo: string;
    estado: EstadoCredito;
    cliente_nombres: string;
    cliente_documento: string;
  };
  fechaConsulta: string;
  cuotas: CuotaDetalle[];
}

export interface CuotaSimulada {
  numero: number;
  fechaVencimiento: string;
  capital: number;
  interes: number;
  total: number;
  saldo: number;
}

export interface PagoResultado {
  pagoId: string;
  monto: number;
  aplicado: { cuota: number; mora: number; interes: number; capital: number }[];
  estadoCredito: EstadoCredito;
}

export interface Resumen {
  fecha: string;
  cartera: number;
  creditosActivos: number;
  creditosEnMora: number;
  porCobrarHoy: number;
  cobradoHoy: number;
  pagosHoy: number;
  atraso: { d1_15: number; d16_30: number; d31_60: number; d60mas: number };
}

export interface Cobro {
  creditoId: string;
  cliente: string;
  telefono: string | null;
  zona: string | null;
  diasAtraso: number;
  cuotas: number;
  pendiente: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creado_en: string;
}

export interface PagoLista {
  id: string;
  fecha_pago: string;
  monto: string;
  metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA';
  anulado: boolean;
  registrado_por: string;
}

export interface ReciboDatos {
  id: string;
  numero: string;
  fecha: string;
  monto: number;
  metodoPago: 'EFECTIVO' | 'TRANSFERENCIA';
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  empresa: string;
  creditoId: string;
  cliente: { nombres: string; documento: string; telefono: string | null };
  detalle: { cuota: number; mora: number; interes: number; capital: number }[];
  totales: { mora: number; interes: number; capital: number };
  saldoDespues: number;
}

export interface CobradorLista {
  id: string;
  nombre: string;
}

export interface CajaCobrador {
  cobradorId: string;
  nombre: string;
  efectivo: number;
  transferencias: number;
  pagos: number;
  arqueo: { id: string; esperado: number; entregado: number; diferencia: number; observacion: string | null } | null;
}

export interface CajaDia {
  fecha: string;
  cobradores: CajaCobrador[];
}

export interface FlujoProyectado {
  fecha: string;
  vencido: number;
  creditosVencidos: number;
  dias: { fecha: string; monto: number; cuotas: number }[];
}

export interface DiaCaja {
  fecha: string;
  capital: number;
  interes: number;
  mora: number;
  cobrado: number;
  pagos: number;
  desembolsado: number;
}

export interface HistorialCaja {
  desde: string;
  hasta: string;
  dias: DiaCaja[];
  totales: { capital: number; interes: number; mora: number; cobrado: number; pagos: number; desembolsado: number; neto: number };
}
