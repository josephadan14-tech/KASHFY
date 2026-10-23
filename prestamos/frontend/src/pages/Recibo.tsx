import { useState } from 'react';
import { api, mensajeError } from '../api';
import { ETIQUETA_PAGO, enlacesContacto, fechaHora, lempiras } from '../format';
import { useCarga } from '../hooks';
import { Cargando } from '../ui';
import type { ReciboDatos, Rol } from '../types';

function partesCuota(d: { mora: number; interes: number; capital: number }): string {
  return [d.mora > 0 && `mora ${lempiras(d.mora)}`, d.interes > 0 && `interés ${lempiras(d.interes)}`, d.capital > 0 && `capital ${lempiras(d.capital)}`]
    .filter(Boolean)
    .join(', ');
}

/** Texto del recibo para enviar por WhatsApp. */
function textoRecibo(r: ReciboDatos): string {
  return [
    `*${r.empresa}*`,
    `Recibo ${r.numero}`,
    fechaHora(r.fecha),
    '',
    `Cliente: ${r.cliente.nombres}`,
    `Monto recibido: ${lempiras(r.monto)} (${ETIQUETA_PAGO[r.metodoPago].toLowerCase()})`,
    ...r.detalle.map((d) => `Cuota ${d.cuota}: ${partesCuota(d)}`),
    '',
    `Saldo pendiente de capital e interés: ${lempiras(r.saldoDespues)}`,
    'Gracias por su pago.',
  ].join('\n');
}

export default function Recibo({ id, rol }: { id: string; rol: Rol }) {
  const { datos: r, error, cargando, recargar } = useCarga(() => api<ReciboDatos>(`/pagos/${id}`), [id]);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const volver = (
    <button className="volver no-imprimir" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.hash = '#/creditos'))}>
      Volver
    </button>
  );

  if (error) return <>{volver}<p className="error" role="alert">{error}</p></>;
  if (cargando && !r) return <>{volver}<Cargando filas={3} /></>;
  if (!r) return null;

  const contacto = enlacesContacto(r.cliente.telefono);
  const base = contacto ? contacto.whatsapp : 'https://wa.me/';
  const enlaceWhatsApp = `${base}?text=${encodeURIComponent(textoRecibo(r))}`;

  async function anular() {
    setEnviando(true);
    setErrorAnular(null);
    try {
      await api(`/pagos/${id}/anular`, { cuerpo: { motivo } });
      setAnulando(false);
      setMotivo('');
      recargar();
    } catch (e) {
      setErrorAnular(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {volver}
      <article className="recibo">
        <header>
          <div className="recibo-empresa">{r.empresa}</div>
          <div className="sub">Recibo {r.numero}</div>
          <div className="sub">{fechaHora(r.fecha)}</div>
        </header>

        <div className="linea-punteada" />
        <div className="fila-dato"><span>Cliente</span><strong>{r.cliente.nombres}</strong></div>
        <div className="fila-dato"><span>Documento</span><span>{r.cliente.documento}</span></div>
        <div className="fila-dato"><span>Forma de pago</span><span>{ETIQUETA_PAGO[r.metodoPago]}</span></div>
        <div className="fila-dato"><span>Recibido por</span><span>{r.registradoPor}</span></div>

        <div className="linea-punteada" />
        <div className="monto-bloque">
          <div className="sub">Monto recibido</div>
          <div className={`total ${r.anulado ? 'tachado' : ''}`}>{lempiras(r.monto)}</div>
          {r.anulado ? <div className="sello">ANULADO</div> : <div className="sello recibido">RECIBIDO</div>}
        </div>

        <div className="linea-punteada" />
        <div className="sub" style={{ marginBottom: '.4rem' }}>A qué se aplicó</div>
        {r.detalle.map((d) => (
          <div className="fila-dato" key={d.cuota}><span className="cuota-lbl">Cuota {d.cuota}</span><span className="der">{partesCuota(d)}</span></div>
        ))}
        <div className="fila-dato total-linea"><span>Mora</span><span>{lempiras(r.totales.mora)}</span></div>
        <div className="fila-dato total-linea"><span>Interés</span><span>{lempiras(r.totales.interes)}</span></div>
        <div className="fila-dato total-linea"><span>Capital</span><span>{lempiras(r.totales.capital)}</span></div>

        <div className="linea-punteada" />
        <div className="fila-dato"><span>Saldo pendiente de capital e interés</span><strong>{lempiras(r.saldoDespues)}</strong></div>
        <p className="sub" style={{ marginTop: '.8rem' }}>Gracias por su pago.</p>

        {r.anulado && r.motivoAnulacion && <p className="error">Anulado. Motivo: {r.motivoAnulacion}</p>}
      </article>

      <div className="acciones no-imprimir" style={{ maxWidth: 460 }}>
        {!r.anulado && <a className="boton primario" href={enlaceWhatsApp} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
        <button className="secundario" onClick={() => window.print()}>Imprimir</button>
        <a className="boton secundario" href={`#/creditos/${r.creditoId}`}>Ver el crédito</a>
      </div>

      {rol === 'ADMIN' && !r.anulado && (
        <section className="panel no-imprimir" style={{ maxWidth: 460, marginTop: '1.4rem' }}>
          {!anulando ? (
            <button className="secundario chico" onClick={() => setAnulando(true)}>Anular este pago</button>
          ) : (
            <>
              <h3>Anular pago {r.numero}</h3>
              <p className="sub">Las cuotas vuelven a deber lo que este pago había cubierto. Solo se puede anular el último pago del crédito. Queda registrado quién lo hizo y por qué.</p>
              <label>Motivo (obligatorio)
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ejemplo: se digitó L 5,000 en vez de L 500" />
              </label>
              {errorAnular && <p className="error" role="alert">{errorAnular}</p>}
              <div className="acciones">
                <button className="primario" disabled={enviando || motivo.trim().length < 5} onClick={anular}>{enviando ? 'Anulando...' : 'Confirmar anulación'}</button>
                <button className="secundario" disabled={enviando} onClick={() => { setAnulando(false); setErrorAnular(null); }}>Cancelar</button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
