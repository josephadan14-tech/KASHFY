import { useState } from 'react';
import { api, mensajeError, puedeCrear } from '../api';
import { enlacesContacto } from '../format';
import { useCarga } from '../hooks';
import { Cargando, useAviso } from '../ui';
import type { Cliente, CobradorLista, Rol } from '../types';

const VACIO = { nombres: '', documento: '', telefono: '', direccion: '', zona: '', cobradorId: '' };

export default function Clientes({ rol }: { rol: Rol }) {
  const aviso = useAviso();
  const { datos, error, cargando, recargar } = useCarga(() => api<Cliente[]>('/clientes'), []);
  const cobradores = useCarga(() => (puedeCrear(rol) ? api<CobradorLista[]>('/clientes/cobradores') : Promise.resolve([])), [rol]);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [form, setForm] = useState(VACIO);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [editando, setEditando] = useState<string | null>(null);
  const [asigCobrador, setAsigCobrador] = useState('');
  const [asigZona, setAsigZona] = useState('');
  const [avisoAsig, setAvisoAsig] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardandoAsig, setGuardandoAsig] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrorForm(null);
    try {
      await api('/clientes', { cuerpo: { ...form, cobradorId: form.cobradorId || null } });
      setForm(VACIO);
      setAbierto(false);
      aviso.ok('Cliente guardado');
      recargar();
    } catch (err) {
      setErrorForm(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  function abrirAsignacion(c: Cliente) {
    setAvisoAsig(null);
    setAsigCobrador(c.cobrador_id ?? '');
    setAsigZona(c.zona ?? '');
    setEditando(editando === c.id ? null : c.id);
  }

  async function guardarAsignacion(c: Cliente) {
    setGuardandoAsig(true);
    setAvisoAsig(null);
    try {
      await api(`/clientes/${c.id}/asignacion`, { metodo: 'PATCH', cuerpo: { cobradorId: asigCobrador || null, zona: asigZona } });
      setAvisoAsig({ tipo: 'ok', texto: 'Asignación guardada.' });
      recargar();
    } catch (err) {
      setAvisoAsig({ tipo: 'error', texto: mensajeError(err) });
    } finally {
      setGuardandoAsig(false);
    }
  }

  const q = filtro.trim().toLowerCase();
  const lista = (datos ?? []).filter(
    (c) => !q || `${c.nombres} ${c.documento} ${c.zona ?? ''} ${c.cobrador ?? ''}`.toLowerCase().includes(q),
  );
  const listaCobradores = cobradores.datos ?? [];

  const detalleLinea = (c: Cliente) =>
    `Documento ${c.documento}${c.telefono ? `, tel. ${c.telefono}` : ''}${c.zona ? `. Zona: ${c.zona}` : ''}${puedeCrear(rol) ? `. Cobrador: ${c.cobrador ?? 'sin asignar'}` : ''}`;

  return (
    <>
      <header className="cabecera">
        <h1>Clientes</h1>
        {puedeCrear(rol) && !abierto && <button className="primario" onClick={() => setAbierto(true)}>Agregar cliente</button>}
      </header>

      {abierto && (
        <form className="panel" onSubmit={guardar}>
          <h2>Nuevo cliente</h2>
          <div className="rejilla">
            <label>Nombre completo<input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} required autoFocus /></label>
            <label>Documento de identidad<input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} required /></label>
            <label>Teléfono<input type="tel" inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
            <label>Dirección<input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></label>
            <label>Zona o barrio (opcional)<input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} /></label>
            <label>Cobrador asignado
              <select value={form.cobradorId} onChange={(e) => setForm({ ...form, cobradorId: e.target.value })}>
                <option value="">Sin asignar por ahora</option>
                {listaCobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          </div>
          {errorForm && <p className="error" role="alert">{errorForm}</p>}
          <div className="acciones">
            <button className="primario" disabled={enviando}>{enviando ? 'Guardando...' : 'Guardar cliente'}</button>
            <button type="button" className="secundario" onClick={() => { setAbierto(false); setForm(VACIO); setErrorForm(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <input className="buscador" placeholder="Buscar por nombre, documento, zona o cobrador" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar cliente" />

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando />}
      {datos && lista.length === 0 && (
        <p className="vacio">
          {datos.length > 0
            ? 'Ningún cliente coincide con la búsqueda.'
            : rol === 'COBRADOR'
              ? 'Todavía no tienes clientes asignados. Pídele al administrador que te asigne tu ruta.'
              : 'Aún no hay clientes. Agrega el primero para poder darle un crédito.'}
        </p>
      )}

      {lista.length > 0 && (
        <ul className="libreta">
          {lista.map((c) => {
            const contacto = enlacesContacto(c.telefono);
            const abiertoAqui = editando === c.id;
            const contenido = (
              <>
                <div>
                  <div className="nombre">{c.nombres}</div>
                  <div className="sub">{detalleLinea(c)}</div>
                </div>
                {c.estado === 'LISTA_NEGRA' && <span className="etiqueta mora">Lista negra</span>}
              </>
            );
            return (
              <li key={c.id} className={`fila ${c.estado === 'LISTA_NEGRA' ? 'mora' : ''}`}>
                {puedeCrear(rol) ? (
                  <button className="fila-principal fila-boton" onClick={() => abrirAsignacion(c)} aria-expanded={abiertoAqui}>{contenido}</button>
                ) : (
                  <div className="fila-principal">{contenido}</div>
                )}

                {abiertoAqui && (
                  <div className="fila-detalle">
                    <label>Cobrador asignado
                      <select value={asigCobrador} onChange={(e) => setAsigCobrador(e.target.value)}>
                        <option value="">Sin asignar</option>
                        {listaCobradores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                      </select>
                    </label>
                    <label>Zona o barrio<input value={asigZona} onChange={(e) => setAsigZona(e.target.value)} /></label>
                    <button className="secundario chico" style={{ alignSelf: 'flex-start' }} disabled={guardandoAsig} onClick={() => guardarAsignacion(c)}>
                      {guardandoAsig ? 'Guardando...' : 'Guardar asignación'}
                    </button>
                    {avisoAsig && <p className={avisoAsig.tipo === 'ok' ? 'exito' : 'error'} role="status">{avisoAsig.texto}</p>}
                  </div>
                )}

                {contacto && (
                  <div className="fila-acciones">
                    <a className="boton secundario chico" href={contacto.llamar}>Llamar</a>
                    <a className="boton secundario chico" href={contacto.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
