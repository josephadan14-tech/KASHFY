import { useEffect, useMemo, useRef, useState } from 'react';
import { api, mensajeError, puedeCrear } from '../api';
import { CADA_FRECUENCIA, DESCRIPCION_METODO, ETIQUETA_FRECUENCIA, NOMBRE_METODO_CORTO, fecha, hoyHonduras, lempiras, redondear } from '../format';
import { useCarga } from '../hooks';
import type { Cliente, CuotaSimulada, Frecuencia, Metodo, Rol } from '../types';
import { Cargando, Dinero, Guilloche, Icono, useAviso } from '../ui';

const aNumero = (s: string): number => Number(s.replace(',', '.'));
const aDecimal = (porcentaje: string): number => Number((aNumero(porcentaje) / 100).toFixed(6));
const METODOS = Object.keys(NOMBRE_METODO_CORTO) as Metodo[];
const FRECUENCIAS = Object.keys(ETIQUETA_FRECUENCIA) as Frecuencia[];

export default function NuevoCredito({ rol }: { rol: Rol }) {
  const clientes = useCarga(() => api<Cliente[]>('/clientes'), []);
  const aviso = useAviso();
  const [f, setF] = useState({
    clienteId: '', monto: '', metodo: 'FLAT' as Metodo, frecuencia: 'SEMANAL' as Frecuencia, numeroCuotas: '10', tasa: '',
    fechaDesembolso: hoyHonduras(), diasGracia: '1', moraPorcentaje: '1', moraFija: '0',
  });
  const [cuotas, setCuotas] = useState<CuotaSimulada[] | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const secuencia = useRef(0);

  const cuerpo = useMemo(
    () => ({
      monto: aNumero(f.monto), tasa: aDecimal(f.tasa), numeroCuotas: aNumero(f.numeroCuotas), metodo: f.metodo, frecuencia: f.frecuencia,
      fechaDesembolso: f.fechaDesembolso, diasGracia: aNumero(f.diasGracia), moraPorcentajeDia: aDecimal(f.moraPorcentaje), moraMontoFijo: aNumero(f.moraFija),
    }),
    [f],
  );
  const listo = f.monto !== '' && f.tasa !== '' && f.numeroCuotas !== '' && aNumero(f.monto) > 0 && aNumero(f.numeroCuotas) >= 1;
  const huella = JSON.stringify(cuerpo);

  // Simulación en vivo: recalcula sola cuando cambias un dato (con una pequeña espera para no saturar)
  useEffect(() => {
    if (!listo) { setCuotas(null); setError(null); return; }
    const mia = ++secuencia.current;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ cuotas: CuotaSimulada[] }>('/creditos/simular', { cuerpo });
        if (mia === secuencia.current) { setCuotas(r.cuotas); setError(null); }
      } catch (e) {
        if (mia === secuencia.current) { setCuotas(null); setError(mensajeError(e)); }
      } finally {
        if (mia === secuencia.current) setCalculando(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  if (!puedeCrear(rol)) return <p className="vacio">Tu rol no puede crear créditos.</p>;

  const set = (campo: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [campo]: e.target.value });
  const pasos = (d: number) => setF({ ...f, numeroCuotas: String(Math.max(1, Math.min(365, (aNumero(f.numeroCuotas) || 0) + d))) });

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await api<{ credito: { id: string } }>('/creditos', { cuerpo: { ...cuerpo, clienteId: Number(f.clienteId) } });
      aviso.ok('Crédito creado');
      window.location.hash = `#/creditos/${r.credito.id}`;
    } catch (e) {
      setError(mensajeError(e));
      setCreando(false);
    }
  }

  const totalInteres = redondear((cuotas ?? []).reduce((s, c) => s + c.interes, 0));
  const totalPagar = redondear((cuotas ?? []).reduce((s, c) => s + c.total, 0));
  const totalCapital = redondear((cuotas ?? []).reduce((s, c) => s + c.capital, 0));
  const primera = cuotas?.[0];
  const ultima = cuotas?.[cuotas.length - 1];
  const decrece = f.metodo === 'ALEMAN';
  const etiquetaTasa = f.metodo === 'FLAT' ? 'Interés total del préstamo (%)' : 'Tasa por cada período de pago (%)';

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Nuevo crédito</h1>
          <p className="suave">Cambia cualquier dato y mira el resultado al instante</p>
        </div>
        <a className="boton secundario chico" href="#/creditos">Volver</a>
      </header>

      <div className="simulador">
        <section className="panel" style={{ marginBottom: 0 }}>
          <div className="pregunta">
            <label>Cliente
              <select value={f.clienteId} onChange={set('clienteId')}>
                <option value="">Elige un cliente</option>
                {(clientes.datos ?? []).filter((c) => c.estado === 'ACTIVO').map((c) => (
                  <option key={c.id} value={c.id}>{c.nombres} ({c.documento})</option>
                ))}
              </select>
            </label>
          </div>
          <div className="rejilla pregunta">
            <label>Monto a prestar (L)<input inputMode="decimal" value={f.monto} onChange={set('monto')} placeholder="5000" /></label>
            <label>{etiquetaTasa}<input inputMode="decimal" value={f.tasa} onChange={set('tasa')} placeholder="10" /></label>
          </div>

          <div className="pregunta">
            <span className="titulo">Cómo se calculan los intereses</span>
            <div className="segmentos" role="group" aria-label="Método de cálculo">
              {METODOS.map((m) => <button key={m} type="button" aria-pressed={f.metodo === m} onClick={() => setF({ ...f, metodo: m })}>{NOMBRE_METODO_CORTO[m]}</button>)}
            </div>
            <p className="nota">{DESCRIPCION_METODO[f.metodo]}</p>
          </div>

          <div className="pregunta">
            <span className="titulo">Frecuencia de pago</span>
            <div className="segmentos" role="group" aria-label="Frecuencia de pago">
              {FRECUENCIAS.map((x) => <button key={x} type="button" aria-pressed={f.frecuencia === x} onClick={() => setF({ ...f, frecuencia: x })}>{ETIQUETA_FRECUENCIA[x]}</button>)}
            </div>
          </div>

          <div className="rejilla pregunta">
            <div>
              <span className="titulo" style={{ display: 'block', fontSize: '.92rem', color: 'var(--suave)', fontWeight: 500, marginBottom: '.4rem' }}>Número de cuotas</span>
              <div className="stepper">
                <button type="button" className="secundario" onClick={() => pasos(-1)} aria-label="Una cuota menos"><Icono nombre="menos" tam={18} /></button>
                <input inputMode="numeric" value={f.numeroCuotas} onChange={set('numeroCuotas')} aria-label="Número de cuotas" />
                <button type="button" className="secundario" onClick={() => pasos(1)} aria-label="Una cuota más"><Icono nombre="mas" tam={18} /></button>
              </div>
            </div>
            <label>Fecha de desembolso<input type="date" value={f.fechaDesembolso} onChange={set('fechaDesembolso')} /></label>
          </div>

          <h3>Mora por atraso</h3>
          <div className="rejilla">
            <label>Días de gracia<input inputMode="numeric" value={f.diasGracia} onChange={set('diasGracia')} /></label>
            <label>Porcentaje diario (%)<input inputMode="decimal" value={f.moraPorcentaje} onChange={set('moraPorcentaje')} /></label>
            <label>Cargo fijo por atraso (L)<input inputMode="decimal" value={f.moraFija} onChange={set('moraFija')} /></label>
          </div>
        </section>

        <aside className="previa-pegada">
          <div className="previa">
            <Guilloche />
            {!listo && <p className="vacia">Escribe el monto, el interés y las cuotas para ver aquí cuánto pagaría el cliente.</p>}
            {listo && !primera && !error && <p className="vacia">Calculando...</p>}
            {listo && error && <p className="vacia">{error}</p>}
            {primera && ultima && (
              <>
                <p className="etq">{decrece ? 'Primera cuota' : 'Cuota'} {CADA_FRECUENCIA[f.frecuencia]}</p>
                <Dinero className="grande" valor={primera.total} />
                <p className="cada">{decrece ? `Baja hasta ${lempiras(ultima.total)}` : `${cuotas!.length} cuotas`}, la última vence el {fecha(ultima.fechaVencimiento)}</p>
                <div className="edad" role="img" aria-label={`Capital ${lempiras(totalCapital)}, interés ${lempiras(totalInteres)}`}>
                  <span className="tramo p-capital" style={{ width: `${(totalCapital / (totalPagar || 1)) * 100}%` }} />
                  <span className="tramo p-interes" style={{ width: `${(totalInteres / (totalPagar || 1)) * 100}%` }} />
                </div>
                <div className="datos">
                  <div><span className="etq">Intereses totales</span><strong>{lempiras(totalInteres)}</strong></div>
                  <div><span className="etq">Total a pagar</span><strong>{lempiras(totalPagar)}</strong></div>
                </div>
                <button className="enlace" onClick={() => setVerTodas(!verTodas)}>{verTodas ? 'Ocultar las cuotas' : `Ver las ${cuotas!.length} cuotas`}</button>
              </>
            )}
          </div>
          <div className="acciones" style={{ marginTop: '.9rem' }}>
            <button className="primario" style={{ flex: 1 }} disabled={creando || calculando || !primera || !f.clienteId} onClick={crear}>{creando ? 'Creando...' : 'Crear crédito'}</button>
          </div>
          {primera && !f.clienteId && <p className="suave" style={{ marginTop: '.6rem' }}>Elige un cliente para poder crear el crédito.</p>}
        </aside>
      </div>

      {verTodas && cuotas && (
        <div className="tabla-caja pagina">
          <table>
            <thead><tr><th>Cuota</th><th>Vence</th><th className="num">Capital</th><th className="num">Interés</th><th className="num">Total</th><th className="num">Saldo</th></tr></thead>
            <tbody>
              {cuotas.map((c) => (
                <tr key={c.numero}>
                  <td>{c.numero}</td><td>{fecha(c.fechaVencimiento)}</td>
                  <td className="num">{lempiras(c.capital)}</td><td className="num">{lempiras(c.interes)}</td>
                  <td className="num">{lempiras(c.total)}</td><td className="num">{lempiras(c.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {clientes.cargando && !clientes.datos && <Cargando filas={1} />}
    </>
  );
}
