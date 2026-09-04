/* GINapp — Service Worker v0.9.17
 *
 * HTML: network-first  → los despliegues se ven sin trucos de caché.
 * Resto (iconos, manifest): stale-while-revalidate.
 * Nunca cachea las llamadas al backend de Apps Script.
 *
 * Rutas RELATIVAS a propósito: así funciona igual en /ginapp/, en la raíz
 * de un dominio propio o en local, sin tocar este archivo.
 *
 * Al subir una versión: cambiar CACHE y APP_VERSION en index.html a la vez.
 */
const CACHE = 'ginapp-v0.9.17';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* El backend nunca se cachea */
  if (url.hostname.indexOf('script.google') >= 0) return;
  if (url.hostname.indexOf('googleusercontent') >= 0) return;
  if (url.origin !== location.origin) return;

  const esHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  /* Solo se guarda lo que vino BIEN. Guardar un 404 era el bug de la foto
     que no aparecía: si abres la app antes de subir la imagen, el 404 se
     quedaba en la caché y se servía como si fuera la foto. */
  function guardar(r, request) {
    if (r && r.ok && r.type !== 'opaque') {
      const c = r.clone();
      caches.open(CACHE).then(function (ch) { ch.put(request, c); });
    }
    return r;
  }

  if (esHTML) {
    e.respondWith(
      fetch(req)
        .then(function (r) { return guardar(r, req); })
        .catch(function () {
          return caches.match(req).then(function (r) { return r || caches.match('./index.html'); });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      const net = fetch(req)
        .then(function (r) { return guardar(r, req); })
        .catch(function () { return cached; });
      return cached || net;
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
