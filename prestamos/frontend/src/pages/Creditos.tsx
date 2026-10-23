import { api, puedeCrear } from '../api';
import { CUOTAS_POR_FRECUENCIA, ETIQUETA_ESTADO, ETIQUETA_METODO, fecha, lempiras } from '../format';
import { useCarga } from '../hooks';
import { Cargando } from '../ui';
import type { CreditoResumen, EstadoCredito, Rol } from '../types';

export const claseEstado = (e: EstadoCredito) => (e === 'FINALIZADO' ? 'ok' : e === 'ACTIVO' ? 'neutral' : 'mora');

export default function Creditos({ rol }: { rol: Rol }) {
  const { datos, error, cargando } = useCarga(() => api<CreditoResumen[]>('/creditos'), []);

  return (
    <>
      <header className="cabecera">
        <h1>Créditos</h1>
        {puedeCrear(rol) && <a className="boton primario" href="#/creditos/nuevo">Nuevo crédito</a>}
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando />}
      {datos && datos.length === 0 && (
        <p className="vacio">Todavía no hay créditos. {puedeCrear(rol) ? 'Crea el primero con "Nuevo crédito".' : ''}</p>
      )}
      {datos && datos.length > 0 && (
        <ul className="libreta">
          {datos.map((c) => (
            <li key={c.id} className={`fila ${c.estado === 'FINALIZADO' ? 'ok' : c.estado === 'ACTIVO' ? '' : 'mora'}`}>
              <a className="fila-principal" href={`#/creditos/${c.id}`}>
                <div>
                  <div className="nombre">{c.cliente}</div>
                  <div className="sub">
                    {c.numero_cuotas} cuotas {CUOTAS_POR_FRECUENCIA[c.frecuencia]}, {ETIQUETA_METODO[c.metodo].toLowerCase()}. Desde el {fecha(c.fecha_desembolso)}
                  </div>
                </div>
                <div className="derecha">
                  <div className="monto">{lempiras(c.monto)}</div>
                  <span className={`etiqueta ${claseEstado(c.estado)}`}>{ETIQUETA_ESTADO[c.estado]}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
