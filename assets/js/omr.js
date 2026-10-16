// Lector de hojas de respuestas (OMR) a partir de una foto.
//
// Todo corre en el navegador, sin servidor y sin librerias pesadas: la foto
// nunca sale del telefono. Pasos:
//   1. Encontrar los cuatro cuadros negros de las esquinas.
//   2. Calcular la transformacion (homografia) que lleva la hoja ideal, en
//      milimetros, a la foto. Con eso da igual que la foto salga chueca, de
//      lado o con perspectiva.
//   3. "Enderezar" la hoja: una imagen nueva en la que cada milimetro de la
//      hoja ocupa los mismos pixeles.
//   4. Leer el QR (quien es el alumno) y medir que tan oscura esta cada
//      burbuja.
//
// No decide a ciegas: cada respuesta sale con un estado (ok, vacia, doble,
// dudosa) y la pantalla de revision le pide al maestro que confirme las que
// no estan claras.
//
// Funciones puras sobre {data, width, height} (RGBA), para poder probarlas
// fuera del navegador.

import { MARCAS, MARCA, QR, RETICULA, PAGINA, centroBurbuja } from './hoja-geometria.js';

const PX_MM = 4;               // resolucion de la hoja enderezada
const MAX_DETECCION = 1500;    // lado mayor para buscar las marcas
const ORIGEN = MARCAS[0];      // las coordenadas "de marco" se miden desde aqui

// Umbrales de oscuridad (0 = papel, 1 = negro), relativos a lo que mide una
// burbuja vacia en ESA misma hoja. Asi una foto con poca luz o un lapiz
// tenue no cambian la decision.
const MARCADA = 0.26;
const DUDA = 0.13;

// ---------- utilidades de imagen ----------

function gris(img) {
  const { data, width, height } = img;
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return g;
}

function reducir(g, w, h, factor) {
  if (factor <= 1) return { g, w, h };
  const nw = Math.max(1, Math.floor(w / factor));
  const nh = Math.max(1, Math.floor(h / factor));
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * factor), y1 = Math.min(h, Math.floor((y + 1) * factor));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * factor), x1 = Math.min(w, Math.floor((x + 1) * factor));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * w + xx]; n++; }
      out[y * nw + x] = s / n;
    }
  }
  return { g: out, w: nw, h: nh };
}

// Umbral adaptativo: un pixel es "oscuro" si es bastante mas oscuro que su
// vecindario. Aguanta sombras y luz dispareja mejor que un umbral fijo.
function binarizar(g, w, h) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let fila = 0;
    for (let x = 0; x < w; x++) {
      fila += g[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + fila;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 16));
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      const suma = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1]
                 - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      bin[y * w + x] = g[y * w + x] < (suma / area) * 0.72 ? 1 : 0;
    }
  }
  return bin;
}

// Manchas oscuras conectadas, con su caja y cuanto de la caja llenan.
function componentes(bin, w, h) {
  const etiqueta = new Int32Array(w * h);
  const cola = new Int32Array(w * h);
  const salida = [];
  let actual = 0;
  for (let inicio = 0; inicio < bin.length; inicio++) {
    if (!bin[inicio] || etiqueta[inicio]) continue;
    actual++;
    let cab = 0, fin = 0;
    cola[fin++] = inicio;
    etiqueta[inicio] = actual;
    let minx = w, maxx = 0, miny = h, maxy = 0, area = 0, sx = 0, sy = 0;
    while (cab < fin) {
      const p = cola[cab++];
      const x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && bin[p - 1] && !etiqueta[p - 1]) { etiqueta[p - 1] = actual; cola[fin++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !etiqueta[p + 1]) { etiqueta[p + 1] = actual; cola[fin++] = p + 1; }
      if (y > 0 && bin[p - w] && !etiqueta[p - w]) { etiqueta[p - w] = actual; cola[fin++] = p - w; }
      if (y < h - 1 && bin[p + w] && !etiqueta[p + w]) { etiqueta[p + w] = actual; cola[fin++] = p + w; }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    salida.push({ area, bw, bh, cx: sx / area, cy: sy / area, lleno: area / (bw * bh) });
  }
  return salida;
}

// ---------- geometria ----------

// Homografia que lleva 4 puntos de origen a 4 de destino.
function homografia(origen, destino) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = origen[i], { x: u, y: v } = destino[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Eliminacion de Gauss con pivoteo.
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(A[f][c]) > Math.abs(A[piv][c])) piv = f;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let f = c + 1; f < n; f++) {
      const k = A[f][c] / A[c][c];
      for (let j = c; j < n; j++) A[f][j] -= k * A[c][j];
      b[f] -= k * b[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let f = n - 1; f >= 0; f--) {
    let s = b[f];
    for (let j = f + 1; j < n; j++) s -= A[f][j] * h[j];
    h[f] = s / A[f][f];
  }
  return [...h, 1];
}

function aplicar(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
}

const MARCO = MARCAS.map((m) => ({ x: m.x - ORIGEN.x, y: m.y - ORIGEN.y }));
const RAZON = (MARCAS[1].x - MARCAS[0].x) / (MARCAS[3].y - MARCAS[0].y); // ancho/alto ~0.75

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// De todas las manchas cuadradas, el cuarteto que mejor parece las cuatro
// esquinas de la hoja. Devuelve sus centros en orden horario.
function buscarMarcas(comps, w, h) {
  const minLado = Math.max(5, Math.min(w, h) * 0.008);
  const candidatos = comps
    .filter((c) => c.bw >= minLado && c.bh >= minLado
      && c.bw / c.bh > 0.7 && c.bw / c.bh < 1.43
      && c.lleno > 0.8 && c.area < w * h * 0.02)
    .sort((a, b) => b.area - a.area)
    .slice(0, 18);
  if (candidatos.length < 4) return [];

  const cuartetos = [];
  const n = candidatos.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++)
    for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const grupo = [candidatos[a], candidatos[b], candidatos[c], candidatos[d]];
      const areas = grupo.map((g) => g.area);
      if (Math.max(...areas) / Math.min(...areas) > 3.5) continue;
      const cx = grupo.reduce((s, g) => s + g.cx, 0) / 4;
      const cy = grupo.reduce((s, g) => s + g.cy, 0) / 4;
      const pts = grupo.map((g) => ({ x: g.cx, y: g.cy, lado: Math.sqrt(g.area) }))
        .sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
      const lados = [0, 1, 2, 3].map((i) => dist(pts[i], pts[(i + 1) % 4]));
      const corto = Math.min(lados[0] + lados[2], lados[1] + lados[3]);
      const largo = Math.max(lados[0] + lados[2], lados[1] + lados[3]);
      const razon = corto / largo;
      if (razon < 0.5 || razon > 1) continue;
      // Lados opuestos parecidos (perspectiva moderada) y una hoja grande en
      // la foto: un cuarteto chiquito suele ser basura del fondo.
      const opuestos = Math.abs(lados[0] - lados[2]) / (lados[0] + lados[2])
                     + Math.abs(lados[1] - lados[3]) / (lados[1] + lados[3]);
      const tam = largo / (2 * Math.max(w, h));
      // Las marcas miden 7 mm en una hoja de ~250 mm entre centros.
      const ladoMedio = pts.reduce((s, p) => s + p.lado, 0) / 4;
      const escala = ladoMedio / (largo / 2) / (MARCA.lado / (MARCAS[3].y - MARCAS[0].y));
      const puntaje = Math.abs(razon - RAZON) * 3 + opuestos * 2 + Math.abs(Math.log(escala)) - tam;
      cuartetos.push({ puntaje, pts, lados });
    }
  return cuartetos.sort((a, b) => a.puntaje - b.puntaje).slice(0, 10);
}

// Confirma un cuarteto: en la hoja enderezada, cada marca debe ser un cuadro
// casi negro rodeado de papel. Una burbuja rellena que se colo como "esquina"
// no pasa: ocupa menos de la mitad del cuadro y deja la orilla manchada.
function marcasCoinciden(H, muestra) {
  const pxmm = 3;
  for (const m of MARCAS) {
    const lado = MARCA.lado, orilla = 2.2;
    const zona = enderezar(H, muestra, m.x - lado / 2 - orilla, m.y - lado / 2 - orilla, lado + 2 * orilla, lado + 2 * orilla, pxmm);
    const W = zona.width;
    let dentro = 0, nd = 0, fuera = 0, nf = 0, claro = 0;
    const vals = [];
    for (let v = 0; v < zona.height; v++) for (let u = 0; u < W; u++) {
      const x = u / pxmm - orilla, y = v / pxmm - orilla;
      const g = zona.gris[v * W + u];
      vals.push(g);
      if (x > 1 && x < lado - 1 && y > 1 && y < lado - 1) { dentro += g; nd++; }
      else if (x < -0.8 || x > lado + 0.8 || y < -0.8 || y > lado + 0.8) { fuera += g; nf++; }
    }
    vals.sort((a, b) => a - b);
    claro = vals[Math.floor(vals.length * 0.95)] || 255;
    const oscDentro = 1 - (dentro / nd) / claro;
    const oscFuera = 1 - (fuera / nf) / claro;
    if (oscDentro < 0.5 || oscFuera > 0.25) return false;
    // Las cuatro esquinas del cuadro tambien negras: asi un circulo relleno
    // (que deja las esquinas en blanco) no pasa por marca.
    for (const [ex, ey] of [[1, 1], [lado - 1, 1], [1, lado - 1], [lado - 1, lado - 1]]) {
      let s = 0, n = 0;
      for (let v = 0; v < zona.height; v++) for (let u = 0; u < W; u++) {
        const x = u / pxmm - orilla, y = v / pxmm - orilla;
        if (Math.abs(x - ex) <= 0.7 && Math.abs(y - ey) <= 0.7) { s += zona.gris[v * W + u]; n++; }
      }
      if (!n || 1 - (s / n) / claro < 0.45) return false;
    }
  }
  return true;
}

// La hoja es vertical: el primer lado del recorrido debe ser uno corto
// (arriba o abajo). Devuelve el orden de los puntos que lo cumple.
function ordenBase(c) {
  return c.lados[0] + c.lados[2] < c.lados[1] + c.lados[3] ? [0, 1, 2, 3] : [1, 2, 3, 0];
}

// ---------- lectura ----------

function muestreador(g, w, h) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i = y0 * w + x0;
    return g[i] * (1 - fx) * (1 - fy) + g[i + 1] * fx * (1 - fy)
         + g[i + w] * (1 - fx) * fy + g[i + w + 1] * fx * fy;
  };
}

// Imagen en escala de grises de un rectangulo de la hoja (en mm de pagina).
function enderezar(H, muestra, x0, y0, ancho, alto, pxmm) {
  const W = Math.round(ancho * pxmm), Hh = Math.round(alto * pxmm);
  const out = new Uint8ClampedArray(W * Hh);
  for (let v = 0; v < Hh; v++) {
    for (let u = 0; u < W; u++) {
      const px = x0 + (u + 0.5) / pxmm - ORIGEN.x;
      const py = y0 + (v + 0.5) / pxmm - ORIGEN.y;
      const p = aplicar(H, px, py);
      out[v * W + u] = muestra(p.x, p.y);
    }
  }
  return { gris: out, width: W, height: Hh };
}

export function aRGBA({ gris: g, width, height }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < g.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g[i];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function oscuridadEn(hoja, cx, cy, radioMm, blanco) {
  const r = radioMm * PX_MM, r2 = r * r;
  const x = cx * PX_MM, y = cy * PX_MM;
  let s = 0, n = 0;
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
    for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > r2) continue;
      if (xx < 0 || yy < 0 || xx >= hoja.width || yy >= hoja.height) continue;
      s += hoja.gris[yy * hoja.width + xx]; n++;
    }
  }
  if (!n) return 0;
  return Math.min(1, Math.max(0, 1 - (s / n) / blanco));
}

function percentil(valores, p) {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
}

/**
 * Lee una hoja.
 * @param img        {data,width,height} RGBA de la foto
 * @param burbujasPorFila  arreglo, por pregunta, con cuantas burbujas tiene (0 = a mano)
 * @param leerQr     async (rgba) => texto | null
 */
export async function leerHoja(img, burbujasPorFila, leerQr) {
  const gFull = gris(img);
  const factor = Math.max(1, Math.max(img.width, img.height) / MAX_DETECCION);
  const peq = reducir(gFull, img.width, img.height, factor);
  const bin = binarizar(peq.g, peq.w, peq.h);
  const cuartetos = buscarMarcas(componentes(bin, peq.w, peq.h), peq.w, peq.h);
  const muestra = muestreador(gFull, img.width, img.height);
  const aFoto = (p) => ({ x: p.x * factor + factor / 2, y: p.y * factor + factor / 2 });

  // El mejor cuarteto que de verdad parezca las cuatro marcas.
  let marcas = null;
  for (const c of cuartetos) {
    const pts = ordenBase(c).map((i) => aFoto(c.pts[i]));
    const H = homografia(MARCO, pts);
    if (H && marcasCoinciden(H, muestra)) { marcas = c; break; }
  }
  if (!marcas) {
    return { ok: false, error: 'No encontré los cuatro cuadros negros de las esquinas. Toma la foto con la hoja completa, de frente y con buena luz.' };
  }

  const pts = marcas.pts.map(aFoto);

  // La hoja es vertical: los lados cortos son arriba y abajo. Quedan dos
  // orientaciones posibles (derecha o de cabeza); decide el QR.
  const base = ordenBase(marcas);
  const orientaciones = [base, [base[2], base[3], base[0], base[1]]];

  let elegida = null;
  const margen = 3;
  for (const orden of orientaciones) {
    const H = homografia(MARCO, orden.map((i) => pts[i]));
    if (!H) continue;
    const zona = enderezar(H, muestra, QR.x - margen, QR.y - margen, QR.lado + 2 * margen, QR.lado + 2 * margen, 10);
    // Que tan "QR" se ve: mitad oscuro, mitad claro.
    let oscuros = 0;
    for (const v of zona.gris) if (v < 110) oscuros++;
    const fraccion = oscuros / zona.gris.length;
    let texto = null;
    try { texto = await leerQr(aRGBA(zona)); } catch { texto = null; }
    if (!texto) {
      // Segundo intento con la zona en blanco y negro puro: ayuda cuando la
      // foto es lejana o borrosa y los cuadritos del QR salen grises.
      let suma = 0;
      for (const v of zona.gris) suma += v;
      const corte = suma / zona.gris.length;
      const bn = { gris: zona.gris.map((v) => (v < corte ? 0 : 255)), width: zona.width, height: zona.height };
      try { texto = await leerQr(aRGBA(bn)); } catch { texto = null; }
    }
    const candidato = { H, texto, fraccion };
    if (texto) { elegida = candidato; break; }
    if (!elegida || Math.abs(fraccion - 0.45) < Math.abs(elegida.fraccion - 0.45)) elegida = candidato;
  }
  if (!elegida) return { ok: false, error: 'No pude enderezar la hoja. Intenta otra foto.' };

  const hoja = enderezar(elegida.H, muestra, 0, 0, PAGINA.ancho, PAGINA.alto, PX_MM);

  // Nivel del papel: casi blanco de la zona de respuestas.
  const zonaY0 = Math.round((RETICULA.y0 - 4) * PX_MM);
  const blancos = [];
  for (let i = zonaY0 * hoja.width; i < hoja.gris.length; i += 7) blancos.push(hoja.gris[i]);
  const blanco = Math.max(60, percentil(blancos, 0.9));

  const radio = RETICULA.diametro / 2 * 0.62;
  const medidas = burbujasPorFila.map((n, i) => {
    const vals = [];
    for (let k = 0; k < n; k++) {
      const c = centroBurbuja(i, k);
      vals.push(oscuridadEn(hoja, c.x, c.y, radio, blanco));
    }
    return vals;
  });
  const todas = medidas.flat();
  const vacia = percentil(todas, 0.25);

  const respuestas = medidas.map((vals) => {
    if (!vals.length) return { estado: 'mano', elegida: null, valores: [] };
    const rel = vals.map((v) => v - vacia);
    const orden = rel.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
    const [v1, k1] = orden[0];
    const v2 = orden[1] ? orden[1][0] : -1;
    const marcadas = rel.filter((v) => v >= MARCADA).length;
    let estado, elegidaK = k1;
    if (marcadas === 0) {
      if (v1 < DUDA) { estado = 'vacia'; elegidaK = null; } else estado = 'dudosa';
    } else if (marcadas === 1) {
      estado = v2 >= DUDA ? 'dudosa' : 'ok';
    } else if (v1 - v2 > 0.25) {
      estado = 'dudosa'; // una muy rellena y otra a medias: casi siempre un borron
    } else {
      estado = 'doble'; elegidaK = null;
    }
    return { estado, elegida: elegidaK, valores: rel.map((v) => Math.round(v * 100) / 100) };
  });

  return {
    ok: true,
    qr: elegida.texto,
    hoja,            // gris enderezado, para mostrarlo en la revision
    pxPorMm: PX_MM,
    respuestas,
  };
}

export { PX_MM };
