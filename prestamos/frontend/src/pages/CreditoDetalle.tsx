import { useEffect, useRef, useState } from 'react';
import { api, mensajeError, puedeCobrar } from '../api';
import { CADA_FRECUENCIA, CUOTAS_POR_FRECUENCIA, ETIQUETA_ESTADO, ETIQUETA_METODO, ETIQUETA_PAGO, fecha, fechaHora, lempiras, redondear } from '../format';
import { useCarga } from '../hooks';
import type { CuotaDetalle, DetalleCredito, PagoLista, PagoResultado, Rol } from '../types';
import { CheckAnimado, Cargando, Dinero, Guilloche, Modal, Porcentaje, ReparteBarra, useContar } from '../ui';
import { claseEstado } from './Creditos';

function estadoCuota(c: CuotaDetalle): { texto: string; etiqueta: string; fila: string } {
  if (c.estado === 'PAGADO') return { texto: 'Pagada', etiqueta: 'ok', fila: 'ok' };
  if (c.diasAtraso > 0) {
    return {
      texto: `Vencida hace ${c.diasAtraso} ${c.diasAtraso === 1 ? 'día' : 'días'}`,
      etiqueta: 'mora',
      fila: c.diasAtraso > 30 ? 'mora-grave' : 'mora',
    };
  }
  if (c.estado === 'PARCIAL') return { texto: 'Pago parcial', etiqueta: 'aviso', fila: 'aviso' };
  return { texto: 'Pendiente', etiqueta: '', fila: '' };
}

/** Estima cómo se repartiría un pago (mora, interés, capital; cuota más antigua primero). La cifra definitiva la calcula el servidor. */
function repartir(monto: number, cuotas: CuotaDetalle[]) {
  let resto = redondear(monto);
  let mora = 0, interes = 0, capital = 0;
  for (const c of cuotas) {
    if (c.estado === 'PAGADO' || resto <= 0) continue;
    const m = Math.min(resto, c.moraPendiente); resto = redondear(resto - m);
    const i = Math.min(resto, c.interesPendiente); resto = redondear(resto - i);
    const k = Math.min(resto, c.capitalPendiente); resto = redondear(resto - k);
    mora += m; interes += i; capital += k;
  }
  return { mora: redondear(mora), interes: redondear(interes), capital: redondear(capital), sobrante: resto };
}

export default function CreditoDetalle({ id, rol, params }: { id: string; rol: Rol; params: URLSearchParams }) {
  const { datos, error, cargando, recargar } = useCarga(() => api<DetalleCredito>(`/creditos/${id}`), [id]);
  const pagos = useCarga(() => api<PagoLista[]>(`/creditos/${id}/pagos`), [id]);
  const panelRef = useRef<HTMLElement>(null);
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA'>('EFECTIVO');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PagoResultado | null>(null);
  const [resaltada, setResaltada] = useState<number | null>(null);

  // Si se llegó desde "Cobrar" en la lista de cobros, deja listo el monto de la cuota pendiente
  const pedidoCobrar = params.get('cobrar');
  const yaPuesto = useRef(false);
  useEffect(() => {
    if (!datos || !pedidoCobrar || yaPuesto.current) return;
    const primera = datos.cuotas.find((c) => c.estado !== 'PAGADO');
    if (primera && puedeCobrar(rol) && datos.credito.estado !== 'FINALIZADO') {
      yaPuesto.current = true;
      setMonto(String(redondear(primera.pendienteTotal)));
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [datos, pedidoCobrar, rol]);

  const pagadoPct = (() => {
    if (!datos) return 0;
    const total = datos.cuotas.reduce((s, c) => s + c.capital + c.interes, 0);
    const pendiente = datos.cuotas.reduce((s, c) => s + c.capitalPendiente + c.interesPendiente, 0);
    return total > 0 ? Math.max(0, Math.min(1, 1 - pendiente / total)) : 0;
  })();

  const volver = (
    <button className="volver" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = '#/creditos'))}>
      Volver
    </button>
  );

  if (error) return <>{volver}<p className="error" role="alert">{error}</p></>;
  if (cargando && !datos) return <>{volver}<Cargando filas={3} /></>;
  if (!datos) return null;

  const { credito, cuotas } = datos;
  const abiertas = cuotas.filter((c) => c.estado !== 'PAGADO');
  const saldo = redondear(abiertas.reduce((s, c) => s + c.pendienteTotal, 0));
  const moraTotal = redondear(abiertas.reduce((s, c) => s + c.moraPendiente, 0));
  const vencidas = abiertas.filter((c) => c.diasAtraso > 0);
  const totalVencido = redondear(vencidas.reduce((s, c) => s + c.pendienteTotal, 0));
  const proxima = abiertas[0];
  const siguiente = abiertas.find((c) => c.diasAtraso === 0);
  const montoNum = Number(monto.replace(',', '.'));
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const mostrarCobro = puedeCobrar(rol) && credito.estado !== 'FINALIZADO';
  const reparto = montoValido ? repartir(montoNum, cuotas) : null;
  const excede = reparto !== null && reparto.sobrante > 0;

  async function registrar() {
    setEnviando(true);
    setErrorPago(null);
    try {
      const r = await api<PagoResultado>(`/creditos/${id}/pagos`, { cuerpo: { monto: montoNum, metodoPago } });
      setResultado(r);
      setMonto('');
      setConfirmando(false);
      navigator.vibrate?.(40);
      recargar();
      pagos.recargar();
    } catch (e) {
      setErrorPago(mensajeError(e));
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  function irACuota(n: number) {
    document.getElementById(`cuota-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setResaltada(n);
    setTimeout(() => setResaltada(null), 1600);
  }

  const sumar = (k: 'mora' | 'interes' | 'capital') => redondear((resultado?.aplicado ?? []).reduce((s, a) => s + a[k], 0));

  return (
    <>
      {volver}
      <section className="hero">
        <Guilloche />
        <p className="saludo" style={{ display: 'flex', gap: '.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          Crédito de {lempiras(credito.monto)}, {credito.numero_cuotas} cuotas {CUOTAS_POR_FRECUENCIA[credito.frecuencia]}
          <span className={`etiqueta ${claseEstado(credito.estado)}`}>{ETIQUETA_ESTADO[credito.estado]}</span>
        </p>
        <h1>{credito.cliente_nombres}</h1>
        <p className="fecha" style={{ textTransform: 'none' }}>
          Documento {credito.cliente_documento}. {ETIQUETA_METODO[credito.metodo]}, desde el {fecha(credito.fecha_desembolso)}
        </p>
        <div className="hero-cifras">
          <div>
            <span className="etq">Saldo pendiente hoy</span>
            <Dinero className="hero-valor oro" valor={saldo} />
          </div>
          <div>
            <span className="etq">Mora acumulada</span>
            <Dinero className="hero-valor" valor={moraTotal} />
            <small>{vencidas.length} {vencidas.length === 1 ? 'cuota vencida' : 'cuotas vencidas'}</small>
          </div>
        </div>
        <div className="progreso" aria-hidden="true"><span style={{ width: `${pagadoPct * 100}%` }} /></div>
        <small style={{ opacity: .8, display: 'block', marginTop: '.4rem' }}><Porcentaje valor={pagadoPct} /> de capital e interés pagado</small>
      </section>

      <section>
        <h2 style={{ marginTop: 0 }}>Línea de cuotas</h2>
        <div className={`linea-cuotas ${cuotas.length > 60 ? 'compacta' : ''}`} role="group" aria-label="Estado de cada cuota">
          {cuotas.map((c) => {
            const e = estadoCuota(c);
            const esProxima = siguiente !== undefined && c.numero === siguiente.numero;
            return (
              <button
                key={c.numero}
                className={`pc ${e.fila} ${esProxima ? 'proxima' : ''}`}
                onClick={() => irACuota(c.numero)}
                title={`Cuota ${c.numero}, vence ${fecha(c.fechaVencimiento)}: ${e.texto}`}
                aria-label={`Cuota ${c.numero}: ${e.texto}`}
              >
                {c.numero}
              </button>
            );
          })}
        </div>
        <p className="sub" style={{ margin: '-.4rem 0 1rem' }}>Toca una cuota para ir a su detalle. La que late es la siguiente por vencer.</p>
      </section>

      {mostrarCobro && (
        <section className="panel cobro" ref={panelRef}>
          <h2>Registrar un pago</h2>
          <div className="atajos">
            {proxima && <button className="secundario" onClick={() => setMonto(String(redondear(proxima.pendienteTotal)))}>Cuota pendiente: {lempiras(proxima.pendienteTotal)}</button>}
            {vencidas.length > 1 && <button className="secundario" onClick={() => setMonto(String(totalVencido))}>Todo lo vencido: {lempiras(totalVencido)}</button>}
            <button className="secundario" onClick={() => setMonto(String(saldo))}>Saldo total: {lempiras(saldo)}</button>
          </div>
          <label className="monto-grande">
            Monto recibido (L)
            <input inputMode="decimal" value={monto} onChange={(e) => { setMonto(e.target.value); setConfirmando(false); }} placeholder="0.00" />
          </label>
          <div className="segmentos" role="group" aria-label="Forma de pago" style={{ marginTop: '.9rem' }}>
            <button type="button" aria-pressed={metodoPago === 'EFECTIVO'} onClick={() => setMetodoPago('EFECTIVO')}>Efectivo</button>
            <button type="button" aria-pressed={metodoPago === 'TRANSFERENCIA'} onClick={() => setMetodoPago('TRANSFERENCIA')}>Transferencia</button>
          </div>

          {reparto && (
            <div className="vista-previa">
              <h3>Así se aplicaría este pago</h3>
              <ReparteBarra mora={reparto.mora} interes={reparto.interes} capital={reparto.capital} />
              {excede && <p className="error" style={{ margin: '.6rem 0 0' }}>El monto excede la deuda por {lempiras(reparto.sobrante)}. Baja el monto para poder registrarlo.</p>}
            </div>
          )}

          {errorPago && <p className="error" role="alert">{errorPago}</p>}
          <div className="acciones">
            {!confirmando ? (
              <button className="primario" disabled={!montoValido || excede} onClick={() => setConfirmando(true)}>Registrar pago</button>
            ) : (
              <>
                <button className="primario" disabled={enviando} onClick={registrar}>{enviando ? 'Registrando...' : `Confirmar pago de ${lempiras(montoNum)}`}</button>
                <button className="secundario" disabled={enviando} onClick={() => setConfirmando(false)}>Corregir monto</button>
              </>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Cuotas</h2>
        <ul className="libreta">
          {cuotas.map((c) => {
            const e = estadoCuota(c);
            const pagada = c.estado === 'PAGADO';
            return (
              <li key={c.numero} id={`cuota-${c.numero}`} className={`fila ${e.fila} ${resaltada === c.numero ? 'resaltada' : ''}`}>
                <div className="fila-principal">
                  <div>
                    <div className="nombre">Cuota {c.numero}, vence {fecha(c.fechaVencimiento)}</div>
                    <div className="sub">
                      Capital {lempiras(c.capital)}, interés {lempiras(c.interes)}
                      {c.moraPendiente > 0 && <>, mora <span className="texto-mora">{lempiras(c.moraPendiente)}</span></>}
                    </div>
                  </div>
                  <div className="derecha">
                    <div className={`monto ${pagada ? 'pagado' : ''}`}>{lempiras(pagada ? c.capital + c.interes : c.pendienteTotal)}</div>
                    <span className={`etiqueta ${e.etiqueta}`}>{e.texto}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Pagos registrados</h2>
        {pagos.error && <p className="error" role="alert">{pagos.error}</p>}
        {pagos.cargando && !pagos.datos && <Cargando filas={2} />}
        {pagos.datos && pagos.datos.length === 0 && <p className="vacio">Este crédito todavía no tiene pagos.</p>}
        {pagos.datos && pagos.datos.length > 0 && (
          <ul className="libreta">
            {pagos.datos.map((p) => (
              <li key={p.id} className={`fila ${p.anulado ? 'mora' : 'ok'}`}>
                <a className="fila-principal" href={`#/pagos/${p.id}`}>
                  <div>
                    <div className={`nombre ${p.anulado ? 'tachado' : ''}`}>{lempiras(p.monto)}</div>
                    <div className="sub">{fechaHora(p.fecha_pago)}. {ETIQUETA_PAGO[p.metodo_pago]}, recibido por {p.registrado_por}</div>
                  </div>
                  <div className="derecha"><span className={`etiqueta ${p.anulado ? 'mora' : ''}`}>{p.anulado ? 'Anulado' : 'Ver recibo'}</span></div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resultado && (
        <Modal onCerrar={() => setResultado(null)} etiqueta="Pago registrado">
          <ExitoPago resultado={resultado} mora={sumar('mora')} interes={sumar('interes')} capital={sumar('capital')} cerrar={() => setResultado(null)} />
        </Modal>
      )}
    </>
  );
}

function ExitoPago({ resultado, mora, interes, capital, cerrar }: { resultado: PagoResultado; mora: number; interes: number; capital: number; cerrar: () => void }) {
  const v = useContar(resultado.monto, 800);
  return (
    <>
      <CheckAnimado />
      <p className="suave" style={{ margin: 0 }}>Pago registrado</p>
      <div className="total-exito">{lempiras(v)}</div>
      <ReparteBarra mora={mora} interes={interes} capital={capital} />
      {resultado.estadoCredito === 'FINALIZADO' && <p className="exito" style={{ marginTop: '.6rem' }}>El crédito quedó totalmente pagado.</p>}
      <div className="acciones">
        <a className="boton primario" href={`#/pagos/${resultado.pagoId}`} onClick={cerrar}>Ver recibo para enviar o imprimir</a>
        <button className="secundario" onClick={cerrar}>Seguir en este crédito</button>
      </div>
    </>
  );
}
