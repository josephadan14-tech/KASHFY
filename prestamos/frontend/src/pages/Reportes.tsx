import { useState } from 'react';
import { api } from '../api';
import { MARCA } from '../marca';
import { descargarCsv, fecha, fechaCorta, hoyHonduras, inicioMes, lempiras, redondear, sumarDias } from '../format';
import { useCarga } from '../hooks';
import type { DiaCaja, FlujoProyectado, HistorialCaja } from '../types';
import { Cargando, Dinero } from '../ui';

export default function Reportes() {
  const [vista, setVista] = useState<'flujo' | 'historial'>('flujo');
  return (
    <>
      <header className="cabecera no-imprimir">
        <div>
          <h1>Reportes</h1>
          <p className="suave">Lo que se espera cobrar y lo que ya pasó por la caja</p>
        </div>
      </header>
      <div className="segmentos no-imprimir" role="group" aria-label="Tipo de reporte" style={{ marginBottom: '1.2rem', maxWidth: 420 }}>
        <button aria-pressed={vista === 'flujo'} onClick={() => setVista('flujo')}>Flujo proyectado</button>
        <button aria-pressed={vista === 'historial'} onClick={() => setVista('historial')}>Historial de caja</button>
      </div>
      {vista === 'flujo' ? <Flujo /> : <Historial />}
    </>
  );
}

/* ---------- Flujo de caja proyectado ---------- */
function Flujo() {
  const { datos, error, cargando } = useCarga(() => api<FlujoProyectado>('/reportes/flujo'), []);
  const [sel, setSel] = useState<number | null>(null);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (cargando && !datos) return <Cargando filas={3} />;
  if (!datos) return null;

  const acumulado = (n: number) => redondear(datos.dias.slice(0, n).reduce((s, d) => s + d.monto, 0));
  const maximo = Math.max(...datos.dias.map((d) => d.monto), 1);
  const elegido = sel !== null ? datos.dias[sel] : null;
  const filasCsv = () => [
    ['Fecha', 'Monto esperado (L)', 'Cuotas'],
    ...datos.dias.map((d) => [d.fecha, d.monto.toFixed(2), d.cuotas]),
    [],
    ['Vencido por recuperar (L)', datos.vencido.toFixed(2)],
  ];

  return (
    <>
      <p className="suave" style={{ marginBottom: '.9rem' }}>
        Capital e interés de las cuotas que vencen en cada período. No incluye la mora que todavía no se ha generado.
      </p>
      <div className="kpis kpis-4">
        {[7, 15, 30].map((n) => (
          <div className="kpi" key={n}>
            <span className="etq">Próximos {n} días</span>
            <strong><Dinero valor={acumulado(n)} /></strong>
          </div>
        ))}
        <div className="kpi kpi-alerta">
          <span className="etq">Vencido por recuperar</span>
          <strong className="texto-mora"><Dinero valor={datos.vencido} /></strong>
          <span className="sub">{datos.creditosVencidos} {datos.creditosVencidos === 1 ? 'crédito' : 'créditos'}</span>
        </div>
      </div>

      <section className="panel">
        <h2>Día por día, próximos 30 días</h2>
        <p className="lectura" aria-live="polite">
          {elegido
            ? <><strong>{fechaCorta(elegido.fecha)}</strong>: {lempiras(elegido.monto)} en {elegido.cuotas} {elegido.cuotas === 1 ? 'cuota' : 'cuotas'}</>
            : 'Toca una barra para ver el detalle de ese día.'}
        </p>
        <div className="barras" role="group" aria-label="Cobros esperados por día">
          {datos.dias.map((d, i) => (
            <button
              key={d.fecha}
              className={`barra ${sel === i ? 'activa' : ''} ${i === 0 ? 'hoy' : ''}`}
              onClick={() => setSel(sel === i ? null : i)}
              aria-label={`${fechaCorta(d.fecha)}: ${lempiras(d.monto)}`}
              title={`${fechaCorta(d.fecha)}: ${lempiras(d.monto)}`}
            >
              <span style={{ height: `${Math.max(d.monto > 0 ? 4 : 0, (d.monto / maximo) * 100)}%`, animationDelay: `${i * 18}ms` }} />
            </button>
          ))}
        </div>
        <div className="eje"><span>Hoy</span><span>{fechaCorta(datos.dias[14].fecha)}</span><span>{fechaCorta(datos.dias[29].fecha)}</span></div>
      </section>

      <div className="acciones no-imprimir" style={{ marginTop: 0 }}>
        <button className="secundario" onClick={() => descargarCsv(`flujo-proyectado-${datos.fecha}.csv`, filasCsv())}>Descargar para Excel</button>
        <button className="secundario" onClick={() => window.print()}>Imprimir o guardar como PDF</button>
      </div>
    </>
  );
}

/* ---------- Historial de caja ---------- */
const PERIODOS = [
  { clave: '7', texto: '7 días' },
  { clave: '30', texto: '30 días' },
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'otro', texto: 'Personalizado' },
];

function Historial() {
  const hoy = hoyHonduras();
  const [periodo, setPeriodo] = useState('30');
  const [desdeP, setDesdeP] = useState(sumarDias(hoy, -29));
  const [hastaP, setHastaP] = useState(hoy);
  const desde = periodo === '7' ? sumarDias(hoy, -6) : periodo === '30' ? sumarDias(hoy, -29) : periodo === 'mes' ? inicioMes(hoy) : desdeP;
  const hasta = periodo === 'otro' ? hastaP : hoy;
  const rangoValido = desde <= hasta;

  const { datos, error, cargando } = useCarga(
    () => (rangoValido ? api<HistorialCaja>(`/reportes/historial?desde=${desde}&hasta=${hasta}`) : Promise.reject(new Error('La fecha inicial no puede ser posterior a la final'))),
    [desde, hasta],
  );
  const [sel, setSel] = useState<number | null>(null);

  const t = datos?.totales;
  const maximo = Math.max(...(datos?.dias.map((d) => d.cobrado) ?? [0]), 1);
  const elegido: DiaCaja | null = datos && sel !== null ? datos.dias[sel] ?? null : null;
  const conMovimiento = (datos?.dias ?? []).filter((d) => d.cobrado > 0 || d.desembolsado > 0).reverse();

  const exportar = () => {
    if (!datos) return;
    descargarCsv(`historial-caja-${datos.desde}-a-${datos.hasta}.csv`, [
      ['Fecha', 'Pagos', 'Capital cobrado (L)', 'Interés cobrado (L)', 'Mora cobrada (L)', 'Total cobrado (L)', 'Desembolsado (L)'],
      ...datos.dias.map((d) => [d.fecha, d.pagos, d.capital.toFixed(2), d.interes.toFixed(2), d.mora.toFixed(2), d.cobrado.toFixed(2), d.desembolsado.toFixed(2)]),
      [],
      ['Totales', datos.totales.pagos, datos.totales.capital.toFixed(2), datos.totales.interes.toFixed(2), datos.totales.mora.toFixed(2), datos.totales.cobrado.toFixed(2), datos.totales.desembolsado.toFixed(2)],
    ]);
  };

  return (
    <>
      <div className="filtros no-imprimir" role="group" aria-label="Período">
        {PERIODOS.map((p) => <button key={p.clave} aria-pressed={periodo === p.clave} onClick={() => { setPeriodo(p.clave); setSel(null); }}>{p.texto}</button>)}
      </div>
      {periodo === 'otro' && (
        <div className="rejilla no-imprimir" style={{ marginBottom: '1rem', maxWidth: 520 }}>
          <label>Desde<input type="date" value={desdeP} max={hoy} onChange={(e) => e.target.value && setDesdeP(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hastaP} max={hoy} onChange={(e) => e.target.value && setHastaP(e.target.value)} /></label>
        </div>
      )}
      <p className="suave" style={{ marginBottom: '1rem' }}>{MARCA.nombre}: del {fecha(desde)} al {fecha(hasta)}</p>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando filas={3} />}

      {datos && t && (
        <>
          <div className="kpis kpis-4">
            <div className="kpi"><span className="etq">Cobrado</span><strong><Dinero valor={t.cobrado} /></strong><span className="sub">{t.pagos} {t.pagos === 1 ? 'pago' : 'pagos'}</span></div>
            <div className="kpi"><span className="etq">Intereses y mora cobrados</span><strong className="texto-ok"><Dinero valor={redondear(t.interes + t.mora)} /></strong></div>
            <div className="kpi"><span className="etq">Desembolsado</span><strong><Dinero valor={t.desembolsado} /></strong></div>
            <div className="kpi"><span className="etq">Movimiento neto</span><strong className={t.neto < 0 ? 'texto-mora' : ''}><Dinero valor={t.neto} /></strong><span className="sub">cobrado menos desembolsado</span></div>
          </div>

          <section className="panel">
            <h2>Cobrado por día</h2>
            <p className="lectura" aria-live="polite">
              {elegido
                ? <><strong>{fechaCorta(elegido.fecha)}</strong>: cobrado {lempiras(elegido.cobrado)} (capital {lempiras(elegido.capital)}, interés {lempiras(elegido.interes)}, mora {lempiras(elegido.mora)})</>
                : 'Toca una barra para ver el detalle de ese día.'}
            </p>
            <div className="barras" role="group" aria-label="Cobrado por día">
              {datos.dias.map((d, i) => {
                const alto = (d.cobrado / maximo) * 100;
                const parte = (v: number) => (d.cobrado > 0 ? (v / d.cobrado) * 100 : 0);
                return (
                  <button key={d.fecha} className={`barra apilada ${sel === i ? 'activa' : ''}`} onClick={() => setSel(sel === i ? null : i)} aria-label={`${fechaCorta(d.fecha)}: ${lempiras(d.cobrado)}`} title={`${fechaCorta(d.fecha)}: ${lempiras(d.cobrado)}`}>
                    <span className="pila" style={{ height: `${Math.max(d.cobrado > 0 ? 4 : 0, alto)}%`, animationDelay: `${Math.min(i, 40) * 14}ms` }}>
                      <i className="p-mora" style={{ height: `${parte(d.mora)}%` }} />
                      <i className="p-interes" style={{ height: `${parte(d.interes)}%` }} />
                      <i className="p-capital" style={{ height: `${parte(d.capital)}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <ul className="leyenda leyenda-horizontal">
              <li><i className="punto p-capital" />Capital {lempiras(t.capital)}</li>
              <li><i className="punto p-interes" />Interés {lempiras(t.interes)}</li>
              <li><i className="punto p-mora" />Mora {lempiras(t.mora)}</li>
            </ul>
          </section>

          <section>
            <h2>Días con movimiento</h2>
            {conMovimiento.length === 0 && <p className="vacio">No hubo cobros ni desembolsos en este período.</p>}
            {conMovimiento.length > 0 && (
              <ul className="libreta">
                {conMovimiento.map((d) => (
                  <li key={d.fecha} className="fila">
                    <div className="fila-principal">
                      <div>
                        <div className="nombre">{fechaCorta(d.fecha)}</div>
                        <div className="sub">{d.pagos} {d.pagos === 1 ? 'pago' : 'pagos'}{d.desembolsado > 0 ? `. Desembolsado ${lempiras(d.desembolsado)}` : ''}</div>
                      </div>
                      <div className="derecha"><div className="monto">{lempiras(d.cobrado)}</div></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="acciones no-imprimir">
            <button className="secundario" onClick={exportar}>Descargar para Excel</button>
            <button className="secundario" onClick={() => window.print()}>Imprimir o guardar como PDF</button>
          </div>
        </>
      )}
    </>
  );
}
