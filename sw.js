/* Service worker de AulaFácil.
 *
 * Objetivo: que un corte de internet a media clase no rompa el examen.
 * Una vez que el alumno abrió el examen con señal, el "cascarón" de la app
 * (HTML, CSS, JS, fuentes, logo) queda guardado en el dispositivo, así que
 * recargar la página o perder la red ya no deja la pantalla en blanco.
 *
 * Lo que NUNCA se guarda en caché son las llamadas a Supabase: preguntas,
 * sesión y entrega siempre van a la red de verdad. Servir una respuesta vieja
 * ahí sería peor que fallar.
 *
 * Al cambiar archivos hay que subir VERSION para que los alumnos reciban la
 * versión nueva.
 */

const VERSION = 'v5';
const CACHE_APP = `aulafacil-app-${VERSION}`;
const CACHE_FUENTES = 'aulafacil-fuentes';

// Todo lo que necesita la pantalla del examen para arrancar sin red.
const PRECARGA = [
  './',
  './examen.html',
  './login.html',
  './manifest.json',
  './favicon.ico',
  './assets/css/app.css',
  './sesion.html',
  './panel-alumno.html',
  './assets/js/examen.js',
  './assets/js/sesion.js',
  './assets/js/panel-alumno.js',
  './assets/vendor/qrcode.js',
  './assets/js/login.js',
  './assets/js/supabase-client.js',
  './assets/vendor/supabase.js',
  './assets/img/logo-pdg.png',
  './assets/img/icon-180.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
];

const HOSTS_FUENTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function esApi(url) {
  // Cualquier cosa que hable con Supabase va directo a la red, siempre.
  return url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in');
}

function esFuente(url) {
  return HOSTS_FUENTES.includes(url.hostname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then(async (cache) => {
      // addAll falla entero si un solo archivo falla; los agregamos uno por uno
      // para que una imagen faltante no tire toda la instalación.
      await Promise.all(PRECARGA.map((ruta) => cache.add(ruta).catch(() => null)));
    })
  );
  // A propósito NO se llama skipWaiting: si un alumno está a media prueba,
  // no queremos cambiarle el JS por debajo. La versión nueva entra la
  // siguiente vez que abra la app.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((n) => n.startsWith('aulafacil-app-') && n !== CACHE_APP)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Supabase: nunca caché.
  if (esApi(url)) return;

  // 2) Fuentes de Google: se sirven de caché y se refrescan por detrás.
  if (esFuente(url)) {
    event.respondWith(
      caches.open(CACHE_FUENTES).then(async (cache) => {
        const guardada = await cache.match(req);
        const red = fetch(req)
          .then((resp) => {
            if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => null);
        return guardada || (await red) || Response.error();
      })
    );
    return;
  }

  // 3) Mismo origen: caché primero (rapidez y tolerancia a cortes), con
  //    actualización silenciosa en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_APP).then(async (cache) => {
        // El link del examen trae ?token=..., que haría fallar el match exacto;
        // se busca ignorando la query.
        const guardada =
          (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));

        const red = fetch(req)
          .then((resp) => {
            if (resp && resp.ok && resp.type === 'basic') {
              cache.put(new Request(url.pathname), resp.clone()).catch(() => {});
            }
            return resp;
          })
          .catch(() => null);

        if (guardada) {
          event.waitUntil(red);
          return guardada;
        }

        const resp = await red;
        if (resp) return resp;

        // Sin caché y sin red: si era una navegación, al menos damos el examen.
        if (req.mode === 'navigate') {
          const respaldo = await cache.match('./examen.html');
          if (respaldo) return respaldo;
        }
        return Response.error();
      })
    );
  }
});
