// Calificacion de respuestas: lo unico que decide si un alumno acerto.
//
// Vive aparte de la Edge Function a proposito. La funcion califica cuando el
// alumno entrega, y scripts/recalificar.mjs vuelve a calificar un examen ya
// entregado cuando se corrige una regla. Si cada uno tuviera su copia, con el
// tiempo calificarian distinto y nadie se daria cuenta. Aqui hay una sola.
//
// Es JavaScript plano, sin tipos, para que lo puedan importar los dos: Deno
// en la Edge Function y Node en el script.

// Comparacion tolerante de respuestas escritas.
//
// Antes se comparaba texto exacto en minusculas, asi que "0.5" y "1/2" se
// consideraban distintos aunque valgan lo mismo: el alumno escribia bien y
// perdia el punto. Estas reglas solo AMPLIAN lo que se acepta, nunca
// restringen, asi que ninguna respuesta que antes contaba deja de contar.
const EQUIVALENTES = [
  [/\s+/g, ""],                 // "3 x" -> "3x"
  [/²/g, "^2"], [/³/g, "^3"],
  [/½/g, "1/2"], [/¼/g, "1/4"], [/¾/g, "3/4"],
  [/÷/g, "/"], [/×|·/g, "*"],
  [/−|–|—/g, "-"],              // guiones tipograficos -> signo menos
  [/π/g, "pi"],
  [/,/g, "."],                  // coma decimal: "0,5" -> "0.5"
];

// Apostrofes y comillas que se VEN iguales en pantalla pero son caracteres
// distintos. El teclado en espanol de Windows escribe ´ (acento agudo suelto,
// U+00B4), el iPad y el iPhone cambian ' por ’ (U+2019) mientras se escribe, y
// Word mete “ ”. Sin esto, el maestro captura "It´s two o´clock", el alumno
// escribe "It’s two o’clock" desde el iPad, se ven identicos, y la respuesta
// se marca mal.
const APOSTROFES = /[\u0060\u00B4\u02B9\u02BC\u02C8\u2018\u2019\u201A\u201B\u2032\u2035\uFF07]/g;
const COMILLAS = /[\u201C\u201D\u201E\u201F\u2033\u2036\uFF02]/g;

// Quita acentos ("esta" = "está") pero respeta la enie, porque "ano" y "año"
// si son palabras distintas y marcar una por la otra seria peor que el error
// que estamos arreglando.
function sinAcentos(t) {
  return t
    .replace(/ñ/g, "\u0001")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0001/g, "ñ");
}

// Contracciones del ingles. El maestro captura "does not go" y el alumno
// escribe "doesn't go": es la misma respuesta y antes perdia el punto.
// Las irregulares van primero porque la regla general las partiria mal
// ("won't" daria "wo not").
const CONTRACCIONES = [
  [/\bwon't\b/g, "will not"],
  [/\bcan't\b/g, "can not"],
  [/\bshan't\b/g, "shall not"],
  [/\bcannot\b/g, "can not"],
  [/n't\b/g, " not"],
  [/'ll\b/g, " will"],
  [/'re\b/g, " are"],
  [/'ve\b/g, " have"],
  [/'m\b/g, " am"],
];

// "It's" puede ser "it is" o "it has", y "he'd" puede ser "he would" o
// "he had". Como no hay forma de saberlo, se prueban las dos lecturas.
function expandir(t, s_es, d_es) {
  let r = t;
  for (const [re, por] of CONTRACCIONES) r = r.replace(re, por);
  return r.replace(/'s\b/g, " " + s_es).replace(/'d\b/g, " " + d_es);
}

function normalizar(s) {
  let t = String(s ?? "").trim().toLowerCase();
  t = t.replace(APOSTROFES, "'").replace(COMILLAS, '"');
  t = sinAcentos(t);
  for (const [re, por] of EQUIVALENTES) t = t.replace(re, por);
  // Punto final que unos ponen y otros no: "It's one o'clock." = "It's one o'clock"
  t = t.replace(/[.,;:!?¡¿]+$/, "");
  // "x=2" debe valer lo mismo que "2": se descarta la incognita de la izquierda.
  const partes = t.split("=");
  if (partes.length === 2 && partes[0].length <= 3) t = partes[1];
  return t;
}

// Todas las lecturas validas de un mismo texto. Se comparan todas contra
// todas, asi que basta con que UNA coincida para dar el punto.
function formas(texto) {
  const crudo = String(texto ?? "").trim().toLowerCase()
    .replace(APOSTROFES, "'").replace(COMILLAS, '"');
  const salida = new Set();
  for (const [s_es, d_es] of [["is", "would"], ["has", "had"]]) {
    const base = normalizar(expandir(crudo, s_es, d_es));
    salida.add(base);
    // El maestro escribe "40 cm²" y el alumno "40 cm2" porque en el celular no
    // tiene el superindice. La variante sin "^" solo se genera cuando el texto
    // traia el superindice, para no volver iguales un "2^2" y un "22".
    if (/[²³]/.test(crudo)) salida.add(base.replace(/\^(\d)/g, "$1"));
  }
  return [...salida];
}

// Numero, o fraccion simple a/b. Null si no es ninguno de los dos.
function comoNumero(t) {
  if (/^-?\d+(\.\d+)?$/.test(t) || /^-?\.\d+$/.test(t)) return parseFloat(t);
  const f = t.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (f) {
    const b = parseFloat(f[2]);
    if (b !== 0) return parseFloat(f[1]) / b;
  }
  return null;
}

// El maestro puede separar con "|" varias respuestas que acepta como validas.
function coincide(dada, esperada) {
  const alumno = formas(dada).filter((f) => f !== "");
  if (alumno.length === 0) return false;
  for (const opcion of String(esperada ?? "").split("|")) {
    for (const buena of formas(opcion)) {
      if (buena === "") continue;
      for (const a of alumno) {
        if (a === buena) return true;
        const na = comoNumero(a), nb = comoNumero(buena);
        if (na !== null && nb !== null &&
            Math.abs(na - nb) <= Math.max(1e-9, Math.abs(nb) * 1e-9)) return true;
      }
    }
  }
  return false;
}

// Puntos de UNA pregunta. Es la misma cuenta que corre al entregar y al
// recalificar, por eso vive aqui y no dentro de la funcion.
//
// `pregunta` trae sus `opciones`; `mapeoRelacionar` es el mapa que se le
// guardo a ese intento (las preguntas de relacionar se barajan por alumno,
// asi que sin su mapa no se puede saber que emparejo).
export function puntosDePregunta(pregunta, respuestaAlumno, mapeoRelacionar = {}) {
  const vale = Number(pregunta.puntos) || 0;

  if (pregunta.tipo === "opcion_multiple" || pregunta.tipo === "verdadero_falso") {
    const correcta = (pregunta.opciones || []).find((o) => o.es_correcta);
    return correcta && respuestaAlumno === correcta.id ? vale : 0;
  }

  if (pregunta.tipo === "completar") {
    const correctas = pregunta.contenido_json?.respuestas || [];
    const dadas = Array.isArray(respuestaAlumno) ? respuestaAlumno : [];
    const total = correctas.length || 1;
    let aciertos = 0;
    correctas.forEach((c, i) => { if (coincide(dadas[i] || "", c)) aciertos++; });
    return vale * (aciertos / total);
  }

  if (pregunta.tipo === "relacionar") {
    const mapaPregunta = (mapeoRelacionar || {})[pregunta.id] || {};
    const pares = pregunta.contenido_json?.pares || [];
    const seleccion = respuestaAlumno && typeof respuestaAlumno === "object" ? respuestaAlumno : {};
    const total = pares.length || 1;
    let aciertos = 0;
    Object.entries(seleccion).forEach(([izqIndex, opaqueId]) => {
      const trueIndex = mapaPregunta[opaqueId];
      if (trueIndex !== undefined && String(trueIndex) === String(izqIndex)) aciertos++;
    });
    return vale * (aciertos / total);
  }

  return 0;
}

export { coincide, normalizar };
