import { useState } from 'react';
import { api } from '../api';
import { enlaceWhatsApp, enlacesContacto, hoyHonduras, lempiras, mensajeRecordatorio, redondear } from '../format';
import { MARCA } from '../marca';
import { useCarga } from '../hooks';
import type { Cobro } from '../types';
import { Cargando, Dinero } from '../ui';

export const claseCobro = (dias: number): string => (dias === 0 ? 'hoy' : dias > 30 ? 'mora-grave' : dias > 0 ? 'mora' : '');
export const textoCobro = (dias: number): string =>
  dias === 0 ? 'Vence hoy' : `Vencida hace ${dias} ${dias === 1 ? 'día' : 'días'}`;

const EDADES = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'hoy', texto: 'Vencen hoy' },
  { clave: 'd1', texto: '1 a 15 días' },
  { clave: 'd2', texto: '16 a 30' },
  { clave: 'd3', texto: '31 a 60' },
  { clave: 'd4', texto: 'Más de 60' },
];
const edadDe = (dias: number): string => (dias === 0 ? 'hoy' : dias <= 15 ? 'd1' : dias <= 30 ? 'd2' : dias <= 60 ? 'd3' : 'd4');

// Memoria local de a quién ya se le recordó hoy (solo en este teléfono o computadora)
const CLAVE_RECORDADOS = 'recordados';
function leerRecordados(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CLAVE_RECORDADOS) ?? '{}'); } catch { return {}; }
}

export default function Cobros({ params }: { params: URLSearchParams }) {
  const [recordados, setRecordados] = useState<Record<string, string>>(leerRecordados);
  const hoy = hoyHonduras();
  const marcarRecordado = (id: string) => {
    const nuevos = { ...recordados, [id]: hoy };
    setRecordados(nuevos);
    try { localStorage.setItem(CLAVE_RECORDADOS, JSON.stringify(nuevos)); } catch { /* sin almacenamiento */ }
  };
  const { datos, error, cargando } = useCarga(() => api<Cobro[]>('/reportes/cobros'), []);
  const [busqueda, setBusqueda] = useState('');
  const filtro = params.get('edad') ?? 'todos';
  const elegir = (clave: string) => {
    window.location.hash = clave === 'todos' ? '#/cobros' : `#/cobros?edad=${clave}`;
  };

  const todos = datos ?? [];
  const cuenta = (clave: string) => (clave === 'todos' ? todos.length : todos.filter((c) => edadDe(c.diasAtraso) === clave).length);
  const q = busqueda.trim().toLowerCase();
  const lista = todos.filter(
    (c) => (filtro === 'todos' || edadDe(c.diasAtraso) === filtro) && (!q || `${c.cliente} ${c.zona ?? ''}`.toLowerCase().includes(q)),
  );
  const total = redondear(lista.reduce((s, c) => s + c.pendiente, 0));

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Cobros</h1>
          {datos ? (
            <p className="suave">
              {lista.length} {lista.length === 1 ? 'cliente' : 'clientes'}, <strong style={{ color: 'var(--tinta)' }}><Dinero valor={total} /></strong> por cobrar
            </p>
          ) : (
            <p className="suave">Quién debe pagar hoy o está atrasado</p>
          )}
        </div>
      </header>

      <div className="filtros" role="group" aria-label="Filtrar por antigüedad del atraso">
        {EDADES.map((e) => (
          <button key={e.clave} aria-pressed={filtro === e.clave} onClick={() => elegir(e.clave)}>
            {e.texto}
            {datos && <span className="cuenta">{cuenta(e.clave)}</span>}
          </button>
        ))}
      </div>
      <input className="buscador" placeholder="Buscar por cliente o zona" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar cliente" />

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando />}
      {datos && lista.length === 0 && (
        <p className="vacio">{datos.length === 0 ? 'No hay cobros pendientes. Todo al día.' : 'Ningún cobro coincide con el filtro.'}</p>
      )}

      {lista.length > 0 && (
        <ul className="libreta">
          {lista.map((c) => {
            const contacto = enlacesContacto(c.telefono);
            const recordatorio = enlaceWhatsApp(c.telefono, mensajeRecordatorio(c.cliente, c.diasAtraso, c.pendiente, MARCA.nombre));
            const yaRecordado = recordados[c.creditoId] === hoy;
            return (
              <li key={c.creditoId} className={`fila ${claseCobro(c.diasAtraso)}`}>
                <a className="fila-principal" href={`#/creditos/${c.creditoId}`}>
                  <div>
                    <div className="nombre">{c.cliente}</div>
                    <div className="sub">{textoCobro(c.diasAtraso)}{c.cuotas > 1 ? `, ${c.cuotas} cuotas` : ''}{c.zona ? `. Zona: ${c.zona}` : ''}</div>
                  </div>
                  <div className="derecha"><div className="monto">{lempiras(c.pendiente)}</div></div>
                </a>
                <div className="fila-acciones">
                  <a className="boton primario chico" href={`#/creditos/${c.creditoId}?cobrar=1`}>Cobrar</a>
                  {contacto && <a className="boton secundario chico" href={contacto.llamar}>Llamar</a>}
                  {recordatorio && (
                    <a className="boton secundario chico" href={recordatorio} target="_blank" rel="noreferrer" onClick={() => marcarRecordado(c.creditoId)}>
                      {yaRecordado ? 'Recordado hoy ✓' : 'Recordar'}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
