/* Service worker: deja la app abrir rápido y sin conexión (solo la "carcasa").
 * Los datos NUNCA se guardan aquí: todo lo que va a /api/ pasa siempre por la red. */
const VERSION = 'v1';
const CACHE = `app-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const resp = await fetch('/', { cache: 'no-cache' });
        const html = await resp.clone().text();
        const archivos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.put('/', resp);
        await cache.addAll([...archivos, '/icono.svg']);
      } catch (_) {
        /* si algo falla, la app sigue funcionando con la red normal */
      }
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Datos de la API, otros sitios y todo lo que no sea lectura: red normal, sin guardar nada
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Páginas: primero la red (así siempre ves la versión más nueva); sin conexión, la carcasa guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }

  // Archivos de la app (con nombre único por versión): del caché y se refrescan en segundo plano
  e.respondWith(
    caches.match(req).then((guardado) => {
      const red = fetch(req)
        .then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
          return r;
        })
        .catch(() => guardado);
      return guardado || red;
    }),
  );
});
