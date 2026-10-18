import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { ordenDerecha, relacionarConBurbujas } from './hoja-geometria.js';

// El examen impreso (las preguntas), para contestarlo con la hoja de
// respuestas. Las letras salen en el MISMO orden que usan la hoja y el
// lector: opciones por su orden, y en relacionar la columna derecha en el
// orden fijo de ordenDerecha(). Si aqui se cambia el orden, la hoja se
// calificaria con otra clave.

const params = new URLSearchParams(window.location.search);
const examenId = params.get('examen_id');
const LETRAS = 'ABCDEFGHIJKLMNOP'.split('');

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

function cuerpoPregunta(p, num) {
  const opciones = [...(p.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  if (p.tipo === 'opcion_multiple') {
    return `<div class="opciones">${opciones.map((o, k) =>
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
    const partes = String(p.contenido_json?.plantilla || '').split('___');
    const texto = partes.map((t, i) => escapeHtml(t) + (i < partes.length - 1 ? '<span class="blanco"></span>' : '')).join('');
    return `<div class="opciones">${texto}</div>
      ${p.pide_procedimiento ? '<div class="procedimiento">Procedimiento</div>' : ''}
      <div class="donde">Contesta aquí, en el examen.</div>`;
  }

  return '<div class="donde">Contesta aquí, en el examen.</div>';
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

  const cuerpo = preguntas.map((p, i) => {
    const num = i + 1;
    const puntos = Number(p.puntos) || 0;
    // El constructor llama "Enunciado" al texto de relacionar; es el mismo campo.
    return `<div class="pregunta">
      <div class="enc">${num}. ${escapeHtml(p.texto)} <span style="font-weight:400;color:#777;font-size:9pt">(${puntos} ${puntos === 1 ? 'punto' : 'puntos'})</span></div>
      ${p.instrucciones ? `<div class="instr">${escapeHtml(p.instrucciones)}</div>` : ''}
      ${p.imagen_url ? `<img class="ilustr" src="${escapeHtml(p.imagen_url)}" alt="">` : ''}
      ${cuerpoPregunta(p, num)}
    </div>`;
  }).join('');

  const papel = document.getElementById('papel');
  papel.innerHTML = `
    <div class="cabeza">
      <img src="assets/img/logo-escuela.png" alt="">
      <div>
        <div class="titulo">${escapeHtml(examen.titulo)}</div>
        <div>Grupo: <b>${escapeHtml(examen.grupos?.nombre || '')}</b></div>
        <div>Alumno: <span class="linea"></span> &nbsp; Fecha: <span class="linea corta"></span></div>
      </div>
    </div>
    <div class="indicacion">Marca tus respuestas de opción múltiple, verdadero/falso y relacionar en la <b>hoja de respuestas</b>.
      Las preguntas que dicen "Contesta aquí" se responden en este examen.</div>
    ${cuerpo}`;
  papel.style.display = '';
}

document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

init();
