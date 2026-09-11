// Botón flotante de recarga, arriba a la derecha de todas las pantallas.
//
// Hace dos cosas distintas según el momento:
//
//   Normal        -> recarga la página.
//   Version nueva -> cuando el service worker ya bajó una versión nueva pero
//                    está esperando para tomar el control, el botón cambia de
//                    color y dice "Actualizar". Al tocarlo le da permiso de
//                    entrar y recarga con el código nuevo.
//
// Lo segundo es lo que evita andar borrando datos del sitio a mano: el
// service worker nuevo no se activa solo a propósito (para no cambiarle el
// código a un alumno a media prueba), así que hace falta un gesto explícito.

const EN_EXAMEN = () => window.__examenEnCurso === true;

const boton = document.createElement('button');
boton.type = 'button';
boton.id = 'btn-recargar-global';
boton.setAttribute('aria-label', 'Recargar la página');
boton.style.cssText = [
  'position:fixed',
  'top:calc(8px + env(safe-area-inset-top, 0px))',
  'right:8px',
  'z-index:45',
  'display:inline-flex',
  'align-items:center',
  'gap:6px',
  'padding:8px 12px',
  'border:1px solid #c2c6d4',
  'border-radius:9999px',
  'background:rgba(255,255,255,.92)',
  'color:#424752',
  'font:600 13px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  'box-shadow:0 2px 8px rgba(0,0,0,.12)',
  'cursor:pointer',
  '-webkit-backdrop-filter:blur(4px)',
  'backdrop-filter:blur(4px)',
].join(';');

// Ícono en SVG y no con la fuente de símbolos: si Google Fonts no carga
// (la razón de media pantalla en blanco en la escuela), el botón igual se ve.
const ICONO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>';

let registro = null;
let hayVersionNueva = false;

function pintar() {
  if (hayVersionNueva) {
    boton.innerHTML = `${ICONO}<span>Actualizar</span>`;
    boton.style.background = '#d02b2f';
    boton.style.color = '#ffffff';
    boton.style.borderColor = '#d02b2f';
    boton.setAttribute('aria-label', 'Hay una versión nueva: actualizar');
  } else {
    boton.innerHTML = `${ICONO}<span>Recargar</span>`;
    boton.style.background = 'rgba(255,255,255,.92)';
    boton.style.color = '#424752';
    boton.style.borderColor = '#c2c6d4';
    boton.setAttribute('aria-label', 'Recargar la página');
  }
}

boton.addEventListener('click', () => {
  if (hayVersionNueva && registro?.waiting) {
    // El service worker en espera recarga la página solo, desde
    // 'controllerchange', en cuanto toma el control.
    registro.waiting.postMessage('actualizar');
    return;
  }
  window.location.reload();
});

function marcarNueva() {
  // A media prueba no se ofrece cambiar de versión: sería cambiarle el código
  // al alumno con el examen abierto.
  if (EN_EXAMEN()) return;
  hayVersionNueva = true;
  pintar();
}

pintar();
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(boton));
if (document.readyState !== 'loading') document.body?.appendChild(boton);

if ('serviceWorker' in navigator) {
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    window.location.reload();
  });

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    registro = reg;
    if (reg.waiting && navigator.serviceWorker.controller) marcarNueva();

    reg.addEventListener('updatefound', () => {
      const entrante = reg.installing;
      entrante?.addEventListener('statechange', () => {
        if (entrante.state === 'installed' && navigator.serviceWorker.controller) marcarNueva();
      });
    });

    // Preguntar al servidor si hay algo nuevo, al abrir y cada 5 minutos.
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
  }).catch(() => {});
}
