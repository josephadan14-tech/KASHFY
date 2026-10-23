import { useEffect, useState } from 'react';
import { MARCA } from './marca';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

const yaInstalada = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const esIOS = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true);
    const no = () => setEnLinea(false);
    window.addEventListener('online', si);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', si);
      window.removeEventListener('offline', no);
    };
  }, []);
  return enLinea;
}

/** Tarjeta que invita a instalar la app. Android/Chrome: botón "Instalar". iPhone: explica cómo hacerlo desde Safari. */
export function InvitacionInstalar() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [oculta, setOculta] = useState<boolean>(() => {
    try { return localStorage.getItem('instalar-oculta') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const antes = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    const despues = () => setEvento(null);
    window.addEventListener('beforeinstallprompt', antes);
    window.addEventListener('appinstalled', despues);
    return () => {
      window.removeEventListener('beforeinstallprompt', antes);
      window.removeEventListener('appinstalled', despues);
    };
  }, []);

  if (oculta || yaInstalada()) return null;
  const ios = esIOS();
  if (!evento && !ios) return null;

  const ocultar = () => {
    setOculta(true);
    try { localStorage.setItem('instalar-oculta', '1'); } catch { /* sin almacenamiento */ }
  };
  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    setEvento(null);
  };

  return (
    <div className="invitacion no-imprimir" role="region" aria-label="Instalar la aplicación">
      <img src="/icono.svg" alt="" width="48" height="48" />
      <div className="texto">
        <strong>Instala {MARCA.nombre} en tu teléfono</strong>
        <span className="sub">
          {evento
            ? 'Se abre como una app, a pantalla completa y más rápido.'
            : 'Toca el botón Compartir de Safari y elige "Añadir a pantalla de inicio".'}
        </span>
        <div className="acciones-inv">
          {evento && <button className="primario chico" onClick={instalar}>Instalar</button>}
          <button className="secundario chico" onClick={ocultar}>Ahora no</button>
        </div>
      </div>
    </div>
  );
}
