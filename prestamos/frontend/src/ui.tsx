import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { lempiras, porcentaje } from './format';

/* ---------- Números que cuentan hasta su valor ---------- */
export function useContar(objetivo: number, ms = 900): number {
  const [valor, setValor] = useState(0);
  const actual = useRef(0);
  useEffect(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido || ms <= 0) {
      actual.current = objetivo;
      setValor(objetivo);
      return;
    }
    const desde = actual.current;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const v = desde + (objetivo - desde) * (1 - Math.pow(1 - p, 3));
      actual.current = v;
      setValor(v);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [objetivo, ms]);
  return valor;
}

export function Dinero({ valor, className }: { valor: number; className?: string }) {
  const v = useContar(valor);
  return <span className={className}>{lempiras(v)}</span>;
}
export function Entero({ valor, className }: { valor: number; className?: string }) {
  const v = useContar(valor, 700);
  return <span className={className}>{Math.round(v)}</span>;
}
export function Porcentaje({ valor, className }: { valor: number; className?: string }) {
  const v = useContar(valor, 900);
  return <span className={className}>{porcentaje(v)}</span>;
}

/* ---------- Iconos ---------- */
const ICONOS: Record<string, ReactNode> = {
  inicio: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  cobros: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.8" /><path d="M6 12h.01M18 12h.01" /></>,
  creditos: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  clientes: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.6 3 2.3 3 4.7" /></>,
  caja: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M3 11h18M7 4h10" /><circle cx="16.5" cy="15.5" r="1" /></>,
  usuarios: <><path d="M12 3 4.5 6v6c0 4.5 3 7.7 7.5 9 4.5-1.3 7.5-4.5 7.5-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  luna: <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14z" />,
  salir: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  mas: <path d="M12 5v14M5 12h14" />,
  reportes: <path d="M5 20v-7M12 20V5M19 20v-10M3 20h18" />,
  puntos: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
  menos: <path d="M5 12h14" />,
};
export function Icono({ nombre, tam = 22 }: { nombre: string; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

/* ---------- Fondo de líneas finas, como el de un billete ---------- */
export function Guilloche() {
  const caminos = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        let d = '';
        for (let x = 0; x <= 400; x += 6) {
          const y = 60 + Math.sin(x / 38 + i * 0.42) * 26 + Math.sin(x / 15 - i * 0.3) * 8 + (i - 9) * 6.5;
          d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)} `;
        }
        return d;
      }),
    [],
  );
  return (
    <svg className="guilloche" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
      {caminos.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* ---------- Dona interactiva ---------- */
export interface Tramo { clave: string; nombre: string; valor: number; color: string; href?: string }

export function Dona({
  tramos, activo, onActivo, onElegir, centro,
}: {
  tramos: Tramo[];
  activo: string | null;
  onActivo: (clave: string | null) => void;
  onElegir: (t: Tramo) => void;
  centro: ReactNode;
}) {
  const R = 48;
  const C = 2 * Math.PI * R;
  const total = tramos.reduce((s, t) => s + t.valor, 0) || 1;
  const hueco = tramos.filter((t) => t.valor > 0).length > 1 ? 1.6 : 0; // con un solo tramo no hay separación
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMontado(true), 40);
    return () => clearTimeout(t);
  }, []);
  let acumulado = 0;
  return (
    <div className="dona">
      <svg viewBox="0 0 120 120" role="group" aria-label="Composición de la cartera">
        <circle className="dona-fondo" cx="60" cy="60" r={R} />
        {tramos.filter((t) => t.valor > 0).map((t, i) => {
          const parte = (t.valor / total) * C;
          const largo = Math.max(0, parte - hueco);
          const inicio = acumulado;
          acumulado += parte;
          const esActivo = activo === t.clave;
          return (
            <circle
              key={t.clave}
              className={`dona-tramo ${esActivo ? 'activo' : ''} ${activo && !esActivo ? 'apagado' : ''}`}
              cx="60" cy="60" r={R}
              transform="rotate(-90 60 60)"
              strokeDasharray={montado ? `${largo} ${C - largo}` : `0 ${C}`}
              strokeDashoffset={-inicio}
              style={{ stroke: t.color, transitionDelay: `${i * 90}ms` }}
              tabIndex={t.href ? 0 : undefined}
              role={t.href ? 'link' : undefined}
              aria-label={`${t.nombre}: ${lempiras(t.valor)}`}
              onMouseEnter={() => onActivo(t.clave)}
              onMouseLeave={() => onActivo(null)}
              onFocus={() => onActivo(t.clave)}
              onBlur={() => onActivo(null)}
              onClick={() => onElegir(t)}
              onKeyDown={(e) => { if (e.key === 'Enter') onElegir(t); }}
            />
          );
        })}
      </svg>
      <div className="dona-centro">{centro}</div>
    </div>
  );
}

/* ---------- A dónde fue el dinero de un pago ---------- */
export function ReparteBarra({ mora, interes, capital }: { mora: number; interes: number; capital: number }) {
  const total = mora + interes + capital || 1;
  const partes = [
    { clase: 'p-mora', nombre: 'Mora', valor: mora },
    { clase: 'p-interes', nombre: 'Interés', valor: interes },
    { clase: 'p-capital', nombre: 'Capital', valor: capital },
  ];
  return (
    <div>
      <div className="edad" role="img" aria-label={partes.map((p) => `${p.nombre} ${lempiras(p.valor)}`).join(', ')}>
        {partes.filter((p) => p.valor > 0).map((p) => (
          <span key={p.clase} className={`tramo ${p.clase}`} style={{ width: `${(p.valor / total) * 100}%` }} />
        ))}
      </div>
      <ul className="leyenda">
        {partes.map((p) => (
          <li key={p.clase}><i className={`punto ${p.clase}`} />{p.nombre}<span className="cuanto">{lempiras(p.valor)}</span></li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Carga con esqueleto ---------- */
export function Cargando({ filas = 4 }: { filas?: number }) {
  return (
    <div className="esqueleto-lista" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => <div key={i} className="esqueleto" style={{ animationDelay: `${i * 90}ms` }} />)}
    </div>
  );
}

/* ---------- Ventana emergente ---------- */
export function Modal({ children, onCerrar, etiqueta }: { children: ReactNode; onCerrar: () => void; etiqueta: string }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CheckAnimado() {
  return (
    <svg className="check-grande" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M14 27l8 8 16-17" />
    </svg>
  );
}

/* ---------- Avisos breves ---------- */
interface Aviso { id: number; tipo: 'ok' | 'error'; texto: string }
const AvisosCtx = createContext<{ ok: (t: string) => void; error: (t: string) => void }>({ ok: () => {}, error: () => {} });
export const useAviso = () => useContext(AvisosCtx);

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const contador = useRef(0);
  const poner = (tipo: Aviso['tipo'], texto: string) => {
    const id = ++contador.current;
    setLista((l) => [...l, { id, tipo, texto }]);
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), 4200);
  };
  return (
    <AvisosCtx.Provider value={{ ok: (t) => poner('ok', t), error: (t) => poner('error', t) }}>
      {children}
      <div className="avisos" aria-live="polite">
        {lista.map((a) => <div key={a.id} className={`aviso-toast ${a.tipo}`}>{a.texto}</div>)}
      </div>
    </AvisosCtx.Provider>
  );
}
