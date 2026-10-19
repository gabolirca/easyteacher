import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { ordenDerecha, relacionarConBurbujas } from './hoja-geometria.js';

// El examen impreso (las preguntas), para contestarlo con la hoja de
// respuestas. Las letras salen en el MISMO orden que usan la hoja y el
// lector: opciones por su orden, y en relacionar la columna derecha en el
// orden fijo de ordenDerecha(). Si aqui se cambia el orden, la hoja se
// calificaria con otra clave.
//
// Se arma en hojas tamano carta: cada pregunta se mide y se acomoda en la
// hoja que le toca, sin partirla entre dos hojas. Lo que se ve en pantalla es
// lo que sale de la impresora.

const params = new URLSearchParams(window.location.search);
const examenId = params.get('examen_id');
const LETRAS = 'ABCDEFGHIJKLMNOP'.split('');

// Medidas de la hoja (mm). El margen y el pie deben coincidir con el CSS de
// .pagina; el alto depende del tamano elegido (carta u oficio mexicano).
const TAMANOS = {
  carta: { alto: 279.4, nombre: 'Carta' },
  oficio: { alto: 340, nombre: 'Oficio' },
};
const CLAVE_TAMANO = 'aulafacil-tamano-examen';
let tamano = 'carta';
try { if (TAMANOS[localStorage.getItem(CLAVE_TAMANO)]) tamano = localStorage.getItem(CLAVE_TAMANO); } catch { /* sin almacenamiento */ }
let bloquesActuales = [];
const MARGEN_V = 14;      // arriba y abajo
const PIE = 8;            // espacio para "Página x de n"
const SEPARACION = 5;     // entre preguntas

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function aviso(msg) {
  const box = document.getElementById('aviso');
  box.textContent = msg;
  box.style.display = msg ? '' : 'none';
}

// Enunciado con su numero y sus puntos. Respeta los saltos de linea, y los
// renglones que traen tabuladores (lo que queda al pegar una tabla de Word)
// se dibujan como tabla.
function enunciado(texto, num, puntos) {
  const lineas = String(texto ?? '').replace(/\r/g, '').split('\n');
  const partes = [];   // { tabla: bool, html }
  let tabla = [];
  const cerrarTabla = () => {
    if (!tabla.length) return;
    partes.push({ tabla: true, html: `<table class="tabla">${tabla.map((fila, i) =>
      `<tr>${fila.map((c) => (i === 0 ? `<th>${escapeHtml(c.trim())}</th>` : `<td>${escapeHtml(c.trim())}</td>`)).join('')}</tr>`).join('')}</table>` });
    tabla = [];
  };
  lineas.forEach((l) => {
    if (l.includes('\t')) { tabla.push(l.split('\t')); return; }
    cerrarTabla();
    if (l.trim()) partes.push({ tabla: false, html: escapeHtml(l) });
  });
  cerrarTabla();

  const pts = `<span class="pts">(${puntos} ${puntos === 1 ? 'pt' : 'pts'})</span>`;
  const n = `<span class="num">${num}.</span>`;
  if (!partes.length || partes[0].tabla) partes.unshift({ tabla: false, html: '' });
  partes[0].html = `${n} ${partes[0].html}`;
  const ultimoTexto = [...partes].reverse().find((x) => !x.tabla);
  ultimoTexto.html += ` ${pts}`;
  return partes.map((x) => (x.tabla ? x.html : `<div class="enc">${x.html}</div>`)).join('');
}

function renglones(n) {
  return n > 0 ? `<div class="renglones">${'<div class="renglon"></div>'.repeat(n)}</div>` : '';
}

function cuerpoPregunta(p, num) {
  const opciones = [...(p.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  if (p.tipo === 'opcion_multiple') {
    // Opciones cortas (Lewis / Jade / Lewis and Jade) van en un solo renglon
    // para que el examen ocupe menos hojas.
    const cortas = opciones.every((o) => String(o.texto).length <= 22)
      && opciones.reduce((t, o) => t + String(o.texto).length, 0) <= 60;
    return `<div class="opciones${cortas ? ' en-linea' : ''}">${opciones.map((o, k) =>
      `<div><span class="letra">${LETRAS[k]})</span>${escapeHtml(o.texto)}</div>`).join('')}</div>`;
  }

  if (p.tipo === 'verdadero_falso') {
    return '<div class="donde">Rellena <b>V</b> o <b>F</b> en tu hoja de respuestas.</div>';
  }

  if (p.tipo === 'relacionar') {
    const pares = p.contenido_json?.pares || [];
    const orden = ordenDerecha(p);
    const conBurbujas = relacionarConBurbujas(p);
    const filas = Math.max(pares.length, orden.length);
    let celdas = '';
    for (let i = 0; i < filas; i++) {
      const izq = pares[i]
        ? `<div class="izq">${conBurbujas ? `<b>${num}.${i + 1}</b>` : '<span class="blanco" style="min-width:10mm"></span>'} ${escapeHtml(pares[i].izquierda)}</div>`
        : '<div></div>';
      const der = orden[i] !== undefined
        ? `<div><span class="letra">${LETRAS[i]})</span>${escapeHtml(pares[orden[i]].derecha)}</div>`
        : '<div></div>';
      celdas += izq + der;
    }
    const donde = conBurbujas
      ? `En tu hoja, en cada renglón ${num}.1, ${num}.2… rellena la letra que le corresponde.`
      : 'Escribe la letra en la línea de cada elemento (aquí, en el examen).';
    return `<div class="columnas">${celdas}</div><div class="donde">${donde}</div>`;
  }

  if (p.tipo === 'completar') {
    const partes = String(p.contenido_json?.plantilla || '').replace(/\r/g, '').split('___');
    const texto = partes.map((t, i) => escapeHtml(t) + (i < partes.length - 1 ? '<span class="blanco"></span>' : '')).join('');
    return `<div class="opciones plantilla">${texto}</div>
      ${renglones(Number(p.contenido_json?.renglones) || 0)}
      ${p.pide_procedimiento ? '<div class="procedimiento">Procedimiento</div>' : ''}
      <div class="donde">Contesta aquí, en el examen.</div>`;
  }

  return '<div class="donde">Contesta aquí, en el examen.</div>';
}

// Reparte los bloques en hojas carta. Se miden ya dibujados (con el ancho
// real de la hoja) y se van llenando las hojas en orden. Una pregunta que no
// cabe en lo que queda pasa completa a la hoja siguiente; si una sola no
// cabe ni en una hoja vacia, va sola y se deja crecer.
function paginar(bloques) {
  const cont = document.getElementById('paginas');
  const regla = document.createElement('div');
  regla.style.cssText = 'position:absolute;visibility:hidden;height:100mm;width:1px';
  document.body.appendChild(regla);
  const pxPorMm = regla.getBoundingClientRect().height / 100;
  regla.remove();

  const medidor = document.createElement('div');
  medidor.className = 'pagina medidor';
  medidor.innerHTML = bloques.map((b) => `<div class="bloque">${b}</div>`).join('');
  cont.appendChild(medidor);
  const altos = [...medidor.children].map((el) => el.getBoundingClientRect().height / pxPorMm);
  medidor.remove();

  const ALTO_HOJA = TAMANOS[tamano].alto;
  const util = ALTO_HOJA - 2 * MARGEN_V - PIE;
  const hojas = [];
  let actual = [];
  let usado = 0;
  bloques.forEach((b, i) => {
    const alto = altos[i] + (actual.length ? SEPARACION : 0);
    if (actual.length && usado + alto > util) {
      hojas.push(actual);
      actual = [];
      usado = 0;
    }
    actual.push(b);
    usado += altos[i] + (actual.length > 1 ? SEPARACION : 0);
  });
  if (actual.length) hojas.push(actual);

  const larga = (h) => h.length === 1 && altos[bloques.indexOf(h[0])] > util;
  cont.innerHTML = hojas.map((h, n) => `
    <section class="pagina${larga(h) ? ' larga' : ''}">
      ${h.map((b) => `<div class="bloque">${b}</div>`).join('')}
      <div class="pie">Página ${n + 1} de ${hojas.length}</div>
    </section>`).join('');
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;
  if (!examenId) { aviso('Falta el examen en la dirección.'); return; }

  const { data: examen, error } = await supabase
    .from('examenes').select('id, titulo, grupo_id, modo, grupos(nombre)').eq('id', examenId).maybeSingle();
  if (error || !examen) { aviso('No se pudo cargar el examen (o no es de uno de tus grupos).'); return; }
  document.getElementById('link-volver').href = `grupo.html?id=${examen.grupo_id}`;
  document.getElementById('link-hojas').href = `hoja-respuestas.html?examen_id=${examen.id}`;
  document.title = `AulaFácil - Examen - ${examen.titulo}`;

  const { data: preguntas, error: errP } = await supabase
    .from('preguntas').select('*, opciones(*)').eq('examen_id', examenId).order('orden', { ascending: true });
  if (errP) { aviso(`No se pudieron cargar las preguntas: ${errP.message}`); return; }
  if (!preguntas?.length) { aviso('El examen todavía no tiene preguntas.'); return; }

  const bloques = [`
    <div class="cabeza">
      <img src="assets/img/logo-escuela.png" alt="">
      <div>
        <div class="titulo">${escapeHtml(examen.titulo)}</div>
        <div>Grupo: <b>${escapeHtml(examen.grupos?.nombre || '')}</b></div>
        <div>Alumno: <span class="linea"></span> &nbsp; Fecha: <span class="linea corta"></span></div>
      </div>
    </div>
    <div class="indicacion">Marca tus respuestas de opción múltiple, verdadero/falso y relacionar en la <b>hoja de respuestas</b>.
      Las preguntas que dicen "Contesta aquí" se responden en este examen.</div>`];

  preguntas.forEach((p, i) => {
    const num = i + 1;
    const puntos = Number(p.puntos) || 0;
    // El constructor llama "Enunciado" al texto de relacionar; es el mismo campo.
    bloques.push(`<div class="pregunta">
      ${p.instrucciones ? `<div class="instr">${escapeHtml(p.instrucciones)}</div>` : ''}
      ${enunciado(p.texto, num, puntos)}
      ${p.imagen_url ? `<img class="ilustr" src="${escapeHtml(p.imagen_url)}" alt="">` : ''}
      ${cuerpoPregunta(p, num)}
    </div>`);
  });

  // Las imagenes cambian el alto: se espera a que carguen antes de medir.
  const tmp = document.createElement('div');
  tmp.innerHTML = bloques.join('');
  await Promise.all([...tmp.querySelectorAll('img')].map((img) => new Promise((ok) => {
    const i = new Image(); i.onload = ok; i.onerror = ok; i.src = img.getAttribute('src');
  })));
  if (document.fonts?.ready) await document.fonts.ready;

  bloquesActuales = bloques;
  aplicarTamano();
}

// El tamano de hoja cambia el CSS de impresion (@page) y el alto de cada
// hoja en pantalla, y vuelve a repartir las preguntas.
function aplicarTamano() {
  const alto = TAMANOS[tamano].alto;
  let estilo = document.getElementById('estilo-tamano');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'estilo-tamano';
    document.head.appendChild(estilo);
  }
  estilo.textContent = `
    @page { size: 215.9mm ${alto}mm; margin: 0; }
    .pagina { min-height: ${alto}mm; }
    @media print { .pagina { height: ${alto - 0.1}mm; } .pagina.larga { height: auto; } }`;
  document.getElementById('tamano').value = tamano;
  if (bloquesActuales.length) paginar(bloquesActuales);
}

document.getElementById('tamano').addEventListener('change', (e) => {
  tamano = TAMANOS[e.target.value] ? e.target.value : 'carta';
  try { localStorage.setItem(CLAVE_TAMANO, tamano); } catch { /* sin almacenamiento */ }
  aplicarTamano();
});

document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

init();
