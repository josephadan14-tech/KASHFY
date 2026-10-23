import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AvisosProvider } from './ui';
import './estilos.css';

// Instalación como app y apertura sin conexión (solo en la versión publicada)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* si falla, la app funciona igual */ });
  });
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <AvisosProvider>
      <App />
    </AvisosProvider>
  </StrictMode>,
);
