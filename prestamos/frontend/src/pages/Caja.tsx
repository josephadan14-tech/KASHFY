import { useState } from 'react';
import { api, mensajeError } from '../api';
import { fecha as formatoFecha, hoyHonduras, lempiras, redondear } from '../format';
import { useCarga } from '../hooks';
import { Cargando } from '../ui';
import type { CajaCobrador, CajaDia, Rol } from '../types';

function estadoArqueo(c: CajaCobrador): { texto: string; clase: string; fila: string } {
  if (!c.arqueo) return { texto: 'Sin cuadrar', clase: 'aviso', fila: 'hoy' };
  const d = c.arqueo.diferencia;
  if (d === 0) return { texto: 'Cuadrado', clase: 'ok', fila: 'ok' };
  if (d < 0) return { texto: `Faltan ${lempiras(-d)}`, clase: 'mora', fila: 'mora' };
  return { texto: `Sobran ${lempiras(d)}`, clase: 'aviso', fila: 'aviso' };
}

export default function Caja({ rol }: { rol: Rol }) {
  const [dia, setDia] = useState(hoyHonduras());
  const { datos, error, cargando, recargar } = useCarga(() => api<CajaDia>(`/caja/resumen?fecha=${dia}`), [dia]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [entregado, setEntregado] = useState('');
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const puedeCuadrar = rol === 'ADMIN' || rol === 'CONTADOR';
  const lista = datos?.cobradores ?? [];
  const totalEfectivo = redondear(lista.reduce((s, c) => s + c.efectivo, 0));
  const totalTransf = redondear(lista.reduce((s, c) => s + c.transferencias, 0));

  function abrir(c: CajaCobrador) {
    setErrorForm(null);
    setEntregado('');
    setObservacion('');
    setAbierto(abierto === c.cobradorId ? null : c.cobradorId);
  }

  async function registrar(c: CajaCobrador) {
    setEnviando(true);
    setErrorForm(null);
    try {
      await api('/caja/arqueo', {
        cuerpo: { fecha: dia, cobradorId: c.cobradorId, efectivoEntregado: Number(entregado.replace(',', '.')), observacion },
      });
      setAbierto(null);
      recargar();
    } catch (e) {
      setErrorForm(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Caja</h1>
          <p className="suave">{rol === 'COBRADOR' ? 'Lo que cobraste y debes entregar' : 'Efectivo cobrado por cada cobrador y cuadre del día'}</p>
        </div>
      </header>

      <label style={{ maxWidth: 240, marginBottom: '1.2rem' }}>
        Día
        <input type="date" value={dia} max={hoyHonduras()} onChange={(e) => e.target.value && setDia(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando />}

      {datos && (
        <>
          <section className="cifras" aria-label="Totales del día">
            <div className="cifra cobrado">
              <span className="etiqueta-cifra">Efectivo del día</span>
              <span className="valor">{lempiras(totalEfectivo)}</span>
            </div>
            <div className="cifra">
              <span className="etiqueta-cifra">Por transferencia</span>
              <span className="valor">{lempiras(totalTransf)}</span>
            </div>
          </section>

          {lista.length === 0 && <p className="vacio">No hay cobradores ni pagos para el {formatoFecha(dia)}.</p>}

          {lista.length > 0 && (
            <ul className="libreta">
              {lista.map((c) => {
                const e = estadoArqueo(c);
                const abiertoAqui = abierto === c.cobradorId;
                const dif = Number.isFinite(Number(entregado.replace(',', '.'))) && entregado !== '' ? redondear(Number(entregado.replace(',', '.')) - c.efectivo) : null;
                const cambio = c.arqueo && Math.abs(c.arqueo.esperado - c.efectivo) > 0.004;
                const contenido = (
                  <>
                    <div>
                      <div className="nombre">{c.nombre}</div>
                      <div className="sub">{c.pagos} {c.pagos === 1 ? 'pago' : 'pagos'}. Transferencias: {lempiras(c.transferencias)}</div>
                    </div>
                    <div className="derecha">
                      <div className="monto">{lempiras(c.efectivo)}</div>
                      <span className={`etiqueta ${e.clase}`}>{e.texto}</span>
                    </div>
                  </>
                );
                return (
                  <li key={c.cobradorId} className={`fila ${e.fila}`}>
                    {puedeCuadrar && !c.arqueo ? (
                      <button className="fila-principal fila-boton" onClick={() => abrir(c)} aria-expanded={abiertoAqui}>{contenido}</button>
                    ) : (
                      <div className="fila-principal">{contenido}</div>
                    )}

                    {c.arqueo && (
                      <div className="fila-detalle">
                        <p className="sub" style={{ margin: 0 }}>
                          Esperado {lempiras(c.arqueo.esperado)}, entregado {lempiras(c.arqueo.entregado)}.
                          {c.arqueo.observacion ? ` Observación: ${c.arqueo.observacion}` : ''}
                        </p>
                        {cambio && (
                          <p className="error" style={{ margin: 0 }}>
                            El efectivo de ese día cambió después del arqueo (ahora es {lempiras(c.efectivo)}). Probablemente se anuló un pago. Revisa con el cobrador.
                          </p>
                        )}
                      </div>
                    )}

                    {abiertoAqui && !c.arqueo && puedeCuadrar && (
                      <div className="fila-detalle">
                        <p className="sub" style={{ margin: 0 }}>Debe entregar <strong>{lempiras(c.efectivo)}</strong> en efectivo.</p>
                        <label>Efectivo que entregó (L)
                          <input inputMode="decimal" value={entregado} onChange={(ev) => setEntregado(ev.target.value)} autoFocus />
                        </label>
                        {dif !== null && (
                          <p className={dif === 0 ? 'exito' : 'error'} style={{ margin: 0 }}>
                            {dif === 0 ? 'Cuadra exacto.' : dif < 0 ? `Faltan ${lempiras(-dif)}.` : `Sobran ${lempiras(dif)}.`}
                          </p>
                        )}
                        {dif !== null && dif !== 0 && (
                          <label>Observación (obligatoria si hay diferencia)
                            <textarea rows={2} value={observacion} onChange={(ev) => setObservacion(ev.target.value)} />
                          </label>
                        )}
                        {errorForm && <p className="error" role="alert" style={{ margin: 0 }}>{errorForm}</p>}
                        <div className="acciones" style={{ marginTop: 0 }}>
                          <button className="primario" disabled={enviando || dif === null} onClick={() => registrar(c)}>{enviando ? 'Registrando...' : 'Registrar arqueo'}</button>
                          <button className="secundario" disabled={enviando} onClick={() => setAbierto(null)}>Cancelar</button>
                        </div>
                        <p className="sub" style={{ margin: 0 }}>Un arqueo registrado no se puede editar.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
