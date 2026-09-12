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

const VERSION = 'v12';
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
  './assets/js/recargar.js',
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

// El boton "Actualizar" de recargar.js manda esto cuando el usuario acepta
// pasarse a la version nueva. Es la unica forma de que un service worker en
// espera tome el control: a proposito no se llama skipWaiting solo, para no
// cambiarle el codigo a un alumno con el examen abierto.
self.addEventListener('message', (event) => {
  if (event.data === 'actualizar') self.skipWaiting();
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

  // 3) Mismo origen.
  //
  // El codigo (HTML, JS, CSS) va a RED PRIMERO, con la cache como respaldo.
  // Antes era al reves y tenia un defecto feo: cada despliegue se veia un
  // recargado tarde, porque se servia la copia vieja mientras la nueva se
  // bajaba por detras. Eso hizo que el perfil siguiera mostrando una opcion
  // que la base ya no aceptaba.
  //
  // Con red primero, estando en linea siempre se ve la version actual; si la
  // red falla o tarda mas de LIMITE_MS, entra la copia guardada y el salon
  // sigue funcionando. La proteccion del examen no depende de esto: viene de
  // que el service worker nuevo no toma el control hasta cerrar las pestanas.
  //
  // Imagenes, fuentes y bundles de vendor si van de cache primero: no cambian
  // y no vale la pena esperarlos.
  const LIMITE_MS = 3000;
  const esEstatico = /\.(png|jpg|jpeg|svg|ico|webp|woff2?|ttf)$/i.test(url.pathname)
                     || url.pathname.includes('/assets/vendor/');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_APP);
    const guardada = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));

    if (esEstatico && guardada) {
      event.waitUntil(fetch(req).then((r) => {
        if (r && r.ok && r.type === 'basic') cache.put(new Request(url.pathname), r.clone());
      }).catch(() => null));
      return guardada;
    }

    try {
      const resp = await Promise.race([
        fetch(req),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lento')), LIMITE_MS)),
      ]);
      if (resp && resp.ok && resp.type === 'basic') {
        cache.put(new Request(url.pathname), resp.clone()).catch(() => {});
      }
      return resp;
    } catch {
      if (guardada) return guardada;
      if (req.mode === 'navigate') {
        const respaldo = await cache.match('./examen.html');
        if (respaldo) return respaldo;
      }
      return Response.error();
    }
  })());
});
