import { useState } from 'react';
import { api, guardarSesion, mensajeError } from '../api';
import { MARCA } from '../marca';
import type { Sesion } from '../types';
import { Guilloche } from '../ui';

export default function Login({ onEntrar }: { onEntrar: (s: Sesion) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const s = await api<Sesion>('/auth/login', { cuerpo: { email, password } });
      guardarSesion(s);
      onEntrar(s);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="acceso">
      <div className="acceso-marca">
        <Guilloche />
        <div className="nombre-marca">{MARCA.nombre}</div>
        <p>{MARCA.lema}</p>
      </div>
      <form className="acceso-form" onSubmit={entrar}>
        <h1>Ingresar</h1>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primario" disabled={enviando}>{enviando ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
