import { useEffect, useRef, useState } from 'react';
import { api, cerrarSesion, leerSesion } from './api';
import { ETIQUETA_ROL, lempiras } from './format';
import { MARCA } from './marca';
import type { CreditoResumen, Rol, Sesion } from './types';
import { Icono } from './ui';
import { InvitacionInstalar, useEnLinea } from './pwa';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Cobros from './pages/Cobros';
import Clientes from './pages/Clientes';
import Creditos from './pages/Creditos';
import NuevoCredito from './pages/NuevoCredito';
import CreditoDetalle from './pages/CreditoDetalle';
import Usuarios from './pages/Usuarios';
import Recibo from './pages/Recibo';
import Caja from './pages/Caja';
import Reportes from './pages/Reportes';

const PESTANAS: { ruta: string; texto: string; icono: string; roles?: Rol[] }[] = [
  { ruta: '/inicio', texto: 'Inicio', icono: 'inicio' },
  { ruta: '/cobros', texto: 'Cobros', icono: 'cobros' },
  { ruta: '/creditos', texto: 'Créditos', icono: 'creditos' },
  { ruta: '/clientes', texto: 'Clientes', icono: 'clientes' },
  { ruta: '/caja', texto: 'Caja', icono: 'caja' },
  { ruta: '/reportes', texto: 'Reportes', icono: 'reportes', roles: ['ADMIN', 'CONTADOR'] },
  { ruta: '/usuarios', texto: 'Usuarios', icono: 'usuarios', roles: ['ADMIN'] },
];

function useRuta(): { ruta: string; params: URLSearchParams } {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const [ruta, consulta = ''] = (hash.replace(/^#/, '') || '/').split('?');
  return { ruta, params: new URLSearchParams(consulta) };
}

function useTema(): [string, () => void] {
  const [tema, setTema] = useState<string>(() => {
    try {
      const guardado = localStorage.getItem('tema');
      if (guardado) return guardado;
    } catch { /* sin almacenamiento */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  });
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem('tema', tema); } catch { /* sin almacenamiento */ }
  }, [tema]);
  return [tema, () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))];
}

/** Búsqueda rápida: Ctrl+K (o "/") para saltar a cualquier crédito por el nombre del cliente. */
function Buscador({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<CreditoResumen[] | null>(null);
  const [sel, setSel] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setQ('');
    setSel(0);
    const t = setTimeout(() => entrada.current?.focus(), 30);
    if (!lista) api<CreditoResumen[]>('/creditos').then(setLista).catch(() => setLista([]));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!abierto) return null;

  const texto = q.trim().toLowerCase();
  const atajos = [
    { titulo: 'Ir a Cobros', sub: 'Quién debe pagar hoy', href: '#/cobros' },
    { titulo: 'Ir a Caja', sub: 'Efectivo del día', href: '#/caja' },
    { titulo: 'Nuevo crédito', sub: 'Calcular y crear', href: '#/creditos/nuevo' },
  ];
  const encontrados = texto
    ? (lista ?? []).filter((c) => c.cliente.toLowerCase().includes(texto)).slice(0, 8).map((c) => ({
        titulo: c.cliente, sub: `Crédito de ${lempiras(c.monto)}`, href: `#/creditos/${c.id}`,
      }))
    : [];
  const items = texto ? encontrados : atajos;

  const ir = (href: string) => {
    window.location.hash = href;
    cerrar();
  };
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && items[sel]) ir(items[sel].href);
  };

  return (
    <div className="buscar-fondo" onClick={cerrar}>
      <div className="buscar-caja" role="dialog" aria-modal="true" aria-label="Buscar" onClick={(e) => e.stopPropagation()} onKeyDown={teclas}>
        <input ref={entrada} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Buscar un cliente o ir a..." aria-label="Buscar" />
        <ul className="buscar-lista">
          {!texto && <li className="titulo-grupo">Accesos rápidos</li>}
          {texto && lista === null && <li className="titulo-grupo">Buscando...</li>}
          {texto && lista !== null && encontrados.length === 0 && <li className="titulo-grupo">Ningún cliente coincide</li>}
          {items.map((it, i) => (
            <li key={it.href + it.titulo}>
              <a href={it.href} className={i === sel ? 'sel' : ''} onClick={(e) => { e.preventDefault(); ir(it.href); }} onMouseEnter={() => setSel(i)}>
                <strong>{it.titulo}</strong><span className="sub">{it.sub}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="buscar-pie">Flechas para moverte, Enter para abrir, Esc para cerrar</div>
      </div>
    </div>
  );
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion());
  const { ruta, params } = useRuta();
  const [tema, alternarTema] = useTema();
  const [buscando, setBuscando] = useState(false);
  const [menuMas, setMenuMas] = useState(false);
  const enLinea = useEnLinea();

  useEffect(() => {
    const f = () => setSesion(null);
    window.addEventListener('sesion-vencida', f);
    return () => window.removeEventListener('sesion-vencida', f);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setMenuMas(false);
  }, [ruta]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const enCampo = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscando(true); }
      else if (e.key === '/' && !enCampo) { e.preventDefault(); setBuscando(true); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  if (!sesion) return <Login onEntrar={setSesion} />;

  const { rol, nombre } = sesion.usuario;
  const salir = () => {
    cerrarSesion();
    window.location.hash = '#/';
    setSesion(null);
  };

  // El cobrador aterriza en Cobros; los demás en Inicio.
  const rutaEf = ruta === '/' ? (rol === 'COBRADOR' ? '/cobros' : '/inicio') : ruta;
  const pestanas = PESTANAS.filter((p) => !p.roles || p.roles.includes(rol));
  // En el celular caben 5 pestañas: si hay más, las últimas pasan al menú "Más"
  const hayMas = pestanas.length > 5;
  const extra = hayMas ? pestanas.slice(4) : [];
  const activa = (r: string) => rutaEf === r || rutaEf.startsWith(`${r}/`);
  const detalle = rutaEf.match(/^\/creditos\/(\d+)$/);
  const recibo = rutaEf.match(/^\/pagos\/(\d+)$/);

  let pagina;
  if (rutaEf === '/inicio') pagina = <Inicio nombre={nombre} />;
  else if (rutaEf === '/cobros') pagina = <Cobros params={params} />;
  else if (rutaEf === '/clientes') pagina = <Clientes rol={rol} />;
  else if (rutaEf === '/caja') pagina = <Caja rol={rol} />;
  else if (rutaEf === '/reportes') pagina = rol === 'ADMIN' || rol === 'CONTADOR' ? <Reportes /> : <p className="vacio">Solo el administrador o el contador pueden ver los reportes.</p>;
  else if (rutaEf === '/usuarios') pagina = rol === 'ADMIN' ? <Usuarios yoId={String(sesion.usuario.id)} /> : <p className="vacio">Solo el administrador puede ver esta pantalla.</p>;
  else if (rutaEf === '/creditos/nuevo') pagina = <NuevoCredito rol={rol} />;
  else if (recibo) pagina = <Recibo key={recibo[1]} id={recibo[1]} rol={rol} />;
  else if (detalle) pagina = <CreditoDetalle key={detalle[1]} id={detalle[1]} rol={rol} params={params} />;
  else pagina = <Creditos rol={rol} />;

  const botonTema = (
    <button className="icono-boton" onClick={alternarTema} aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
      <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} tam={20} />
    </button>
  );

  return (
    <div className="marco">
      <header className="tope">
        <span className="marca">{MARCA.nombre}</span>
        <span className="quien">
          <button className="icono-boton" onClick={() => setBuscando(true)} aria-label="Buscar"><Icono nombre="buscar" tam={20} /></button>
          {botonTema}
          <button className="icono-boton" onClick={salir} aria-label="Cerrar sesión"><Icono nombre="salir" tam={20} /></button>
        </span>
      </header>

      <nav className="lateral" aria-label="Principal">
        <div className="marca">{MARCA.nombre}</div>
        <button className="buscar-lateral" onClick={() => setBuscando(true)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}><Icono nombre="buscar" tam={18} /> Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>
        {pestanas.map((p, i) => (
          <a key={p.ruta} href={`#${p.ruta}`} className={`${activa(p.ruta) ? 'activo' : ''} ${hayMas && i >= 4 ? 'solo-escritorio' : ''}`}>
            <Icono nombre={p.icono} tam={22} />
            {p.texto}
          </a>
        ))}
        {hayMas && (
          <button className={`mas-movil ${extra.some((p) => activa(p.ruta)) || menuMas ? 'activo' : ''}`} onClick={() => setMenuMas(!menuMas)} aria-expanded={menuMas} aria-label="Más secciones">
            <Icono nombre="puntos" tam={22} />
            Más
          </button>
        )}
        <div className="usuario">
          <strong>{nombre}</strong>
          <span>{ETIQUETA_ROL[rol]}</span>
          <div className="fila-usuario">
            {botonTema}
            <button className="icono-boton" onClick={salir} aria-label="Cerrar sesión"><Icono nombre="salir" tam={20} /></button>
          </div>
        </div>
      </nav>

      <main className="contenido">
        {!enLinea && <div className="sin-conexion no-imprimir" role="status">Sin conexión. Lo que ves puede no estar al día y no podrás guardar cambios.</div>}
        <InvitacionInstalar />
        <div className="pagina" key={rutaEf}>{pagina}</div>
      </main>
      {menuMas && (
        <div className="hoja-mas" role="menu">
          {extra.map((p) => (
            <a key={p.ruta} href={`#${p.ruta}`} className={activa(p.ruta) ? 'activo' : ''} role="menuitem">
              <Icono nombre={p.icono} tam={22} />
              {p.texto}
            </a>
          ))}
        </div>
      )}
      <Buscador abierto={buscando} cerrar={() => setBuscando(false)} />
    </div>
  );
}
