import { useState } from 'react';
import { api } from '../api';
import { fechaLarga, lempiras, saludoHonduras } from '../format';
import { useCarga } from '../hooks';
import type { Cobro, Resumen } from '../types';
import { Cargando, Dinero, Dona, Entero, Guilloche, Porcentaje, type Tramo } from '../ui';
import { claseCobro, textoCobro } from './Cobros';

export default function Inicio({ nombre }: { nombre: string }) {
  const resumen = useCarga(() => api<Resumen>('/reportes/resumen'), []);
  const cobros = useCarga(() => api<Cobro[]>('/reportes/cobros'), []);
  const [activo, setActivo] = useState<string | null>(null);
  const r = resumen.datos;

  const enAtraso = r ? r.atraso.d1_15 + r.atraso.d16_30 + r.atraso.d31_60 + r.atraso.d60mas : 0;
  const alDia = r ? Math.max(0, r.cartera - enAtraso) : 0;
  const indiceMora = r && r.cartera > 0 ? enAtraso / r.cartera : 0;
  const tramos: Tramo[] = r
    ? [
        { clave: 'aldia', nombre: 'Al día', valor: alDia, color: 'var(--t-aldia)', href: '#/creditos' },
        { clave: 'd1', nombre: 'Atraso de 1 a 15 días', valor: r.atraso.d1_15, color: 'var(--t-d1)', href: '#/cobros?edad=d1' },
        { clave: 'd2', nombre: 'Atraso de 16 a 30 días', valor: r.atraso.d16_30, color: 'var(--t-d2)', href: '#/cobros?edad=d2' },
        { clave: 'd3', nombre: 'Atraso de 31 a 60 días', valor: r.atraso.d31_60, color: 'var(--t-d3)', href: '#/cobros?edad=d3' },
        { clave: 'd4', nombre: 'Atraso de más de 60 días', valor: r.atraso.d60mas, color: 'var(--t-d4)', href: '#/cobros?edad=d4' },
      ]
    : [];
  const elegido = tramos.find((t) => t.clave === activo);
  const primerNombre = nombre.split(' ')[0];

  return (
    <>
      <section className="hero">
        <Guilloche />
        <p className="saludo">{saludoHonduras()}, {primerNombre}</p>
        <p className="fecha">{fechaLarga()}</p>
        {!r && <p className="saludo" style={{ marginTop: '1.4rem' }}>Cargando tu resumen...</p>}
        {r && (
          <>
            <div className="hero-cifras">
              <div>
                <span className="etq">Por cobrar hoy</span>
                <Dinero className="hero-valor oro" valor={r.porCobrarHoy} />
              </div>
              <div>
                <span className="etq">Cobrado hoy</span>
                <Dinero className="hero-valor" valor={r.cobradoHoy} />
                <small>{r.pagosHoy} {r.pagosHoy === 1 ? 'pago' : 'pagos'}</small>
              </div>
            </div>
            <a className="boton hero-boton" href="#/cobros">Ver los cobros del día</a>
          </>
        )}
      </section>

      {resumen.error && <p className="error" role="alert">{resumen.error}</p>}
      {resumen.cargando && !r && <Cargando filas={3} />}

      {r && (
        <>
          <section className="panel">
            <h2>Cartera</h2>
            {r.cartera === 0 ? (
              <p className="vacio">Aún no hay créditos con saldo. Cuando crees el primero, aquí verás cómo va tu cartera.</p>
            ) : (
              <div className="cartera-grid">
                <Dona
                  tramos={tramos}
                  activo={activo}
                  onActivo={setActivo}
                  onElegir={(t) => t.href && (window.location.hash = t.href)}
                  centro={
                    elegido ? (
                      <>
                        <span className="monto-d">{lempiras(elegido.valor)}</span>
                        <span className="cap">{elegido.nombre}</span>
                      </>
                    ) : (
                      <>
                        <Porcentaje className="pct" valor={alDia / r.cartera} />
                        <span className="cap">de la cartera al día</span>
                      </>
                    )
                  }
                />
                <div style={{ width: '100%' }}>
                  <p className="suave" style={{ margin: '0 0 .4rem' }}>Capital pendiente: <strong style={{ color: 'var(--tinta)' }}>{lempiras(r.cartera)}</strong>. Toca un tramo para ver esos cobros.</p>
                  <ul className="leyenda-cartera">
                    {tramos.map((t) => (
                      <li key={t.clave} onMouseEnter={() => setActivo(t.clave)} onMouseLeave={() => setActivo(null)}>
                        <a href={t.href} className={activo === t.clave ? 'resalta' : ''}>
                          <i className="punto" style={{ background: t.color }} />
                          {t.nombre}
                          <span className="cuanto">{lempiras(t.valor)}</span>
                          <span className="pctx">{r.cartera > 0 ? `${((t.valor / r.cartera) * 100).toFixed(1)} %` : ''}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </section>

          <div className="kpis">
            <div className="kpi"><span className="etq">Créditos activos</span><strong><Entero valor={r.creditosActivos} /></strong></div>
            <div className="kpi"><span className="etq">Con atraso</span><strong className={r.creditosEnMora > 0 ? 'texto-mora' : ''}><Entero valor={r.creditosEnMora} /></strong></div>
            <div className="kpi"><span className="etq">Índice de mora</span><strong className={indiceMora > 0.1 ? 'texto-mora' : ''}><Porcentaje valor={indiceMora} /></strong></div>
          </div>
        </>
      )}

      <section>
        <h2 style={{ marginTop: 0 }}>Para atender primero</h2>
        {cobros.error && <p className="error" role="alert">{cobros.error}</p>}
        {cobros.cargando && !cobros.datos && <Cargando filas={3} />}
        {cobros.datos && cobros.datos.length === 0 && <p className="vacio">No hay cobros vencidos ni para hoy. Todo al día.</p>}
        {cobros.datos && cobros.datos.length > 0 && (
          <>
            <ul className="libreta">
              {cobros.datos.slice(0, 5).map((c) => (
                <li key={c.creditoId} className={`fila ${claseCobro(c.diasAtraso)}`}>
                  <a className="fila-principal" href={`#/creditos/${c.creditoId}`}>
                    <div>
                      <div className="nombre">{c.cliente}</div>
                      <div className="sub">{textoCobro(c.diasAtraso)}</div>
                    </div>
                    <div className="derecha"><div className="monto">{lempiras(c.pendiente)}</div></div>
                  </a>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: '1rem' }}><a href="#/cobros">Ver los {cobros.datos.length} cobros pendientes</a></p>
          </>
        )}
      </section>
    </>
  );
}
