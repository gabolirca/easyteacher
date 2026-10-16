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

export function textoQr(examenId, alumnoId) {
  return `${VERSION_HOJA}|${examenId}|${alumnoId}`;
}

export function leerTextoQr(texto) {
  const partes = String(texto || '').split('|');
  if (partes.length !== 3 || partes[0] !== VERSION_HOJA) return null;
  return { examenId: partes[1], alumnoId: partes[2] };
}
