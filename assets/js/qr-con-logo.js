// Dibuja un QR con la paloma del Colegio Pedro de Gante al centro.
//
// Por qué se puede tapar el centro: todo QR lleva corrección de errores, así
// que una parte del código se puede perder y el lector lo reconstruye. La
// paloma ocupa ~19 % del ancho (≈3.6 % del área), muy por debajo de lo que el
// nivel de corrección aguanta. Aun así el nivel se sube a Q (recupera 25 %)
// para que un celular malo, un reflejo o una mano encima no lo tumben.
//
// Si la imagen del logo no carga (caché frío, red caída), el QR se dibuja
// igual sin logo: nunca se deja de poder pasar lista por un adorno.

import { toCanvas } from '../vendor/qrcode.js';

const RUTA_MARCA = new URL('../img/marca-qr.png', import.meta.url).href;

let promesaMarca = null;

function marca() {
  if (!promesaMarca) {
    promesaMarca = new Promise((listo) => {
      const img = new Image();
      img.onload = () => listo(img);
      img.onerror = () => listo(null);
      img.src = RUTA_MARCA;
    });
  }
  return promesaMarca;
}

function rectangulo(ctx, x, y, ancho, alto, radio) {
  if (ctx.roundRect) {                 // Safari 16+, Chrome 99+
    ctx.beginPath();
    ctx.roundRect(x, y, ancho, alto, radio);
    return;
  }
  ctx.beginPath();                     // respaldo para navegadores viejos
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + ancho, y, x + ancho, y + alto, radio);
  ctx.arcTo(x + ancho, y + alto, x, y + alto, radio);
  ctx.arcTo(x, y + alto, x, y, radio);
  ctx.arcTo(x, y, x + ancho, y, radio);
  ctx.closePath();
}

/**
 * @param {HTMLCanvasElement} lienzo  canvas donde se pinta
 * @param {string} texto              la URL que codifica el QR
 * @param {{ancho?:number, correccion?:'M'|'Q'|'H', proporcion?:number}} opciones
 */
export async function dibujarQRConLogo(lienzo, texto, opciones = {}) {
  const ancho = opciones.ancho ?? 260;
  const correccion = opciones.correccion ?? 'Q';
  const proporcion = opciones.proporcion ?? 0.19;

  await toCanvas(lienzo, texto, {
    width: ancho,
    margin: 1,
    errorCorrectionLevel: correccion,
  });

  const img = await marca();
  if (!img) return;

  const ctx = lienzo.getContext('2d');
  const lado = Math.round(lienzo.width * proporcion);
  const plato = Math.round(lado * 1.30);          // marco blanco alrededor
  const centro = lienzo.width / 2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  rectangulo(ctx, centro - plato / 2, centro - plato / 2, plato, plato, plato * 0.22);
  ctx.fill();
  ctx.drawImage(img, centro - lado / 2, centro - lado / 2, lado, lado);
  ctx.restore();
}
