import { useState } from 'react';
import { api, mensajeError } from '../api';
import { DESCRIPCION_ROL, ETIQUETA_ROL, fecha, generarClave } from '../format';
import { useCarga } from '../hooks';
import { Cargando } from '../ui';
import type { Rol, Usuario } from '../types';

const ROLES: Rol[] = ['ADMIN', 'EVALUADOR', 'COBRADOR', 'CONTADOR'];
const VACIO = { nombre: '', email: '', rol: 'COBRADOR' as Rol, password: '' };

export default function Usuarios({ yoId }: { yoId: string }) {
  const { datos, error, cargando, recargar } = useCarga(() => api<Usuario[]>('/usuarios'), []);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState<{ nombre: string; email: string; password: string } | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [rolNuevo, setRolNuevo] = useState<Rol>('COBRADOR');
  const [claveNueva, setClaveNueva] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrorForm(null);
    try {
      await api('/usuarios', { cuerpo: form });
      setCreado({ nombre: form.nombre, email: form.email.toLowerCase(), password: form.password });
      setForm(VACIO);
      setAbierto(false);
      recargar();
    } catch (err) {
      setErrorForm(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  function abrirEdicion(u: Usuario) {
    setAviso(null);
    setClaveNueva('');
    setRolNuevo(u.rol);
    setEditando(editando === u.id ? null : u.id);
  }

  async function accion(texto: string, f: () => Promise<unknown>) {
    setTrabajando(true);
    setAviso(null);
    try {
      await f();
      setAviso({ tipo: 'ok', texto });
      recargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: mensajeError(err) });
    } finally {
      setTrabajando(false);
    }
  }

  const cambiarRol = (u: Usuario) =>
    accion(`Rol de ${u.nombre} cambiado a ${ETIQUETA_ROL[rolNuevo]}.`, () =>
      api(`/usuarios/${u.id}`, { metodo: 'PATCH', cuerpo: { rol: rolNuevo } }),
    );

  const cambiarClave = (u: Usuario) =>
    accion(`Contraseña de ${u.nombre} cambiada. Nueva clave: ${claveNueva}`, async () => {
      await api(`/usuarios/${u.id}/clave`, { cuerpo: { password: claveNueva } });
      setClaveNueva('');
    });

  const cambiarActivo = (u: Usuario) => {
    if (u.activo && !window.confirm(`¿Desactivar a ${u.nombre}? No podrá entrar al sistema.`)) return;
    return accion(u.activo ? `${u.nombre} fue desactivado.` : `${u.nombre} fue activado.`, () =>
      api(`/usuarios/${u.id}/activo`, { metodo: 'PATCH', cuerpo: { activo: !u.activo } }),
    );
  };

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Usuarios</h1>
          <p className="suave">Quién puede entrar al sistema y qué puede hacer</p>
        </div>
        {!abierto && <button className="primario" onClick={() => { setAbierto(true); setCreado(null); }}>Agregar usuario</button>}
      </header>

      {creado && (
        <div className="panel aviso-credenciales" role="status">
          <h3>Usuario creado: {creado.nombre}</h3>
          <p>Entrégale estos datos. La contraseña no se vuelve a mostrar.</p>
          <p><strong>Correo:</strong> {creado.email}<br /><strong>Contraseña:</strong> {creado.password}</p>
          <button className="secundario chico" onClick={() => setCreado(null)}>Listo, ya los anoté</button>
        </div>
      )}

      {abierto && (
        <form className="panel" onSubmit={crear}>
          <h2>Nuevo usuario</h2>
          <div className="rejilla">
            <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required autoFocus /></label>
            <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Rol
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })}>
                {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
              </select>
              <span className="sub">{DESCRIPCION_ROL[form.rol]}</span>
            </label>
            <label>Contraseña inicial (mínimo 8 caracteres)
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete="off" />
              <button type="button" className="secundario chico" style={{ alignSelf: 'flex-start' }} onClick={() => setForm({ ...form, password: generarClave() })}>Generar una</button>
            </label>
          </div>
          {errorForm && <p className="error" role="alert">{errorForm}</p>}
          <div className="acciones">
            <button className="primario" disabled={enviando}>{enviando ? 'Creando...' : 'Crear usuario'}</button>
            <button type="button" className="secundario" onClick={() => { setAbierto(false); setForm(VACIO); setErrorForm(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && !datos && <Cargando />}

      {datos && (
        <ul className="libreta">
          {datos.map((u) => {
            const soyYo = u.id === yoId;
            const abiertoAqui = editando === u.id;
            return (
              <li key={u.id} className={`fila ${u.activo ? '' : 'mora'}`}>
                <button className="fila-principal fila-boton" onClick={() => abrirEdicion(u)} aria-expanded={abiertoAqui}>
                  <div>
                    <div className="nombre">{u.nombre}{soyYo ? ' (tú)' : ''}</div>
                    <div className="sub">{u.email}. Creado el {fecha(u.creado_en)}</div>
                  </div>
                  <div className="derecha">
                    <span className="etiqueta">{ETIQUETA_ROL[u.rol]}</span>
                    {!u.activo && <span className="etiqueta mora">Desactivado</span>}
                  </div>
                </button>

                {abiertoAqui && (
                  <div className="fila-detalle">
                    {!soyYo && (
                      <div className="bloque">
                        <label>Rol
                          <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as Rol)}>
                            {ROLES.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
                          </select>
                          <span className="sub">{DESCRIPCION_ROL[rolNuevo]}</span>
                        </label>
                        <button className="secundario chico" disabled={trabajando || rolNuevo === u.rol} onClick={() => cambiarRol(u)}>Guardar rol</button>
                      </div>
                    )}

                    <div className="bloque">
                      <label>Restablecer contraseña
                        <input value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="off" />
                      </label>
                      <div className="acciones" style={{ marginTop: '.2rem' }}>
                        <button className="secundario chico" type="button" onClick={() => setClaveNueva(generarClave())}>Generar una</button>
                        <button className="secundario chico" disabled={trabajando || claveNueva.length < 8} onClick={() => cambiarClave(u)}>Cambiar contraseña</button>
                      </div>
                    </div>

                    {!soyYo && (
                      <button className="secundario chico" disabled={trabajando} onClick={() => cambiarActivo(u)}>
                        {u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                      </button>
                    )}
                    {soyYo && <p className="sub">Tu propio usuario no puede cambiar su rol ni desactivarse.</p>}
                    {aviso && <p className={aviso.tipo === 'ok' ? 'exito' : 'error'} role="status">{aviso.texto}</p>}
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
