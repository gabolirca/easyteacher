// Geometria de la hoja de respuestas. La usan los DOS lados:
//   - hoja-respuestas.js la dibuja para imprimir
//   - omr.js la lee de la foto
// Si cambia algo aqui, cambia para ambos a la vez; por eso vive aparte.
//
// Todo en milimetros sobre una hoja tamano carta (215.9 x 279.4) vertical.
// El lector no confia en el tamano de impresion: se orienta por las cuatro
// marcas negras de las esquinas, asi que si la impresora escala la hoja (el
// clasico "ajustar a pagina") la lectura no se mueve.

export const VERSION_HOJA = 'AF1';

export const PAGINA = { ancho: 215.9, alto: 279.4 };

// Centros de las cuatro marcas de las esquinas, en orden:
// arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda.
export const MARCA = { lado: 7 };
export const MARCAS = [
  { x: 14, y: 14 },
  { x: 201.9, y: 14 },
  { x: 201.9, y: 265.4 },
  { x: 14, y: 265.4 },
];

// Recuadro del QR (esquina superior izquierda y lado).
export const QR = { x: 168, y: 21, lado: 27 };

// Reticula de preguntas.
export const RETICULA = {
  y0: 66,            // centro de la primera fila
  paso: 7.3,         // distancia entre filas
  filasPorColumna: 26,
  columnas: [20, 84, 148], // x donde empieza cada columna (el numero)
  dxPrimera: 11,     // del inicio de la columna al centro de la primera burbuja
  dxBurbuja: 7.6,    // entre burbujas
  diametro: 5.2,
};

export const MAX_PREGUNTAS = RETICULA.filasPorColumna * RETICULA.columnas.length; // 78
export const LETRAS = ['A', 'B', 'C', 'D', 'E'];

// Cuantos renglones caben (no preguntas: una de relacionar usa uno por par).
// Posicion de la fila i (0..77): {x del numero, y del centro}.
export function posicionFila(i) {
  const col = Math.floor(i / RETICULA.filasPorColumna);
  const fila = i % RETICULA.filasPorColumna;
  return { x: RETICULA.columnas[col], y: RETICULA.y0 + fila * RETICULA.paso };
}

// Centro de la burbuja k (0 = A) de la fila i.
export function centroBurbuja(i, k) {
  const f = posicionFila(i);
  return { x: f.x + RETICULA.dxPrimera + k * RETICULA.dxBurbuja, y: f.y };
}

// Cuantas burbujas lleva una pregunta y con que etiqueta. Las de opcion
// multiple usan tantas letras como opciones tenga (hasta 5); verdadero/falso
// usa V y F. Cualquier otro tipo no lleva burbujas: se califica a mano.
export function burbujasDePregunta(p) {
  const opciones = [...(p.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (p.tipo === 'verdadero_falso') {
    return opciones.slice(0, 2).map((o, k) => ({
      etiqueta: /^f/i.test(String(o.texto || '').trim()) ? 'F' : (k === 0 ? 'V' : 'F'),
      opcion: o,
    }));
  }
  if (p.tipo === 'opcion_multiple') {
    return opciones.slice(0, LETRAS.length).map((o, k) => ({ etiqueta: LETRAS[k], opcion: o }));
  }
  return [];
}

// ---------- Relacionar columnas ----------
//
// En papel la columna derecha va con letras (A, B, C...) en un orden fijo que
// sale del CONTENIDO de los pares: siempre el mismo para todos los alumnos y
// para el examen impreso, la hoja y el lector, pero sin quedar en el mismo
// orden que la izquierda (si no, la respuesta seria "A, B, C..." de arriba
// abajo). Antes salia del id de la pregunta, y una copia del examen (otro id)
// quedaba con otras letras que el original: si se imprimia el examen de uno y
// la hoja del otro, relacionar se calificaba mal.
// Con mas de MAX_DERECHA pares no caben las burbujas en un renglon: esa
// pregunta se califica a mano.
export const MAX_DERECHA = LETRAS.length;

function semilla(texto) {
  let h = 2166136261;
  for (const ch of String(texto || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Indices de los pares en el orden en que se imprime la columna derecha:
// la letra k corresponde a pares[orden[k]].derecha.
export function ordenDerecha(p) {
  const n = (p.contenido_json?.pares || []).length;
  const orden = [...Array(n).keys()];
  const pares = p.contenido_json?.pares || [];
  let h = semilla(pares.map((x) => `${x.izquierda}\u0001${x.derecha}`).join('\u0002')) || 1;
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [orden[i], orden[j]] = [orden[j], orden[i]];
  }
  if (n > 1 && orden.every((v, i) => v === i)) orden.push(orden.shift());
  return orden;
}

export function relacionarConBurbujas(p) {
  const n = (p.contenido_json?.pares || []).length;
  return p.tipo === 'relacionar' && n > 0 && n <= MAX_DERECHA;
}

// Renglones de la hoja para un examen. Casi todas las preguntas ocupan uno;
// una de relacionar con burbujas ocupa uno por cada elemento de la izquierda
// ("4.1", "4.2"...). Cada renglon:
//   { pi: indice de la pregunta, sub: indice del par o null, etiqueta, burbujas }
// burbujas: [{ etiqueta, opcion }] en opcion multiple y V/F,
//           [{ etiqueta, derecha: indice del par }] en relacionar,
//           [] = se califica a mano.
export function filasDeExamen(preguntas) {
  const filas = [];
  preguntas.forEach((p, pi) => {
    const num = String(pi + 1);
    if (relacionarConBurbujas(p)) {
      const orden = ordenDerecha(p);
      const letras = orden.map((derecha, k) => ({ etiqueta: LETRAS[k], derecha }));
      p.contenido_json.pares.forEach((_, sub) => {
        filas.push({ pi, sub, etiqueta: `${num}.${sub + 1}`, burbujas: letras });
      });
      return;
    }
    filas.push({ pi, sub: null, etiqueta: num, burbujas: burbujasDePregunta(p) });
  });
  return filas;
}

export function textoQr(examenId, alumnoId) {
  return `${VERSION_HOJA}|${examenId}|${alumnoId}`;
}

export function leerTextoQr(texto) {
  const partes = String(texto || '').split('|');
  if (partes.length !== 3 || partes[0] !== VERSION_HOJA) return null;
  return { examenId: partes[1], alumnoId: partes[2] };
}
