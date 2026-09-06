import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const intentoId = params.get('intento_id');

const ETIQUETAS_ESTADO = { en_curso: 'En curso', bloqueado: 'Bloqueado', entregado: 'Entregado' };
const ESTILOS_ESTADO = {
  en_curso: 'bg-tertiary-container text-on-tertiary-container',
  bloqueado: 'bg-error-container text-on-error-container',
  entregado: 'bg-secondary-container text-on-secondary-container',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
}

function iconoCorrecto() {
  return '<span class="material-symbols-outlined text-sm" style="color:#2c694e;">check_circle</span>';
}
function iconoIncorrecto() {
  return '<span class="material-symbols-outlined text-sm" style="color:#ba1a1a;">cancel</span>';
}

function badgePuntos(obtenidos, totales) {
  const ok = Number(obtenidos) >= Number(totales);
  const parcial = Number(obtenidos) > 0 && Number(obtenidos) < Number(totales);
  const bg = ok ? '#d7f0e2' : parcial ? '#fff3cd' : '#ffe9e7';
  const color = ok ? '#2c694e' : parcial ? '#8a6d1a' : '#ba1a1a';
  return `<span class="badge-puntos" style="background:${bg};color:${color};">${obtenidos ?? 0} / ${totales} pts</span>`;
}

function renderOpcionMultiple(pregunta, respuestaJson) {
  const opciones = [...(pregunta.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const elegidaId = respuestaJson || null;

  return opciones.map((o) => {
    const esElegida = o.id === elegidaId;
    let clase = '';
    let icono = '';
    if (o.es_correcta) { clase = 'opcion-correcta'; icono = iconoCorrecto(); }
    if (esElegida && !o.es_correcta) { clase = 'opcion-elegida-mala'; icono = iconoIncorrecto(); }
    if (esElegida && o.es_correcta) { clase = 'opcion-elegida-buena'; }

    return `
      <div class="opcion-linea ${clase}">
        ${icono || '<span class="w-5"></span>'}
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(o.texto)}</span>
        ${esElegida ? '<span class="text-sm text-on-surface-variant ml-auto">(respuesta del alumno)</span>' : ''}
      </div>`;
  }).join('');
}

function renderRelacionar(pregunta, respuestaJson, mapeoRelacionar) {
  const pares = pregunta.contenido_json?.pares || [];
  const mapeo = mapeoRelacionar?.[pregunta.id] || {};

  return pares.map((par, i) => {
    const elegidoOpcionId = respuestaJson?.[String(i)];
    const elegidoIndex = elegidoOpcionId != null ? mapeo[elegidoOpcionId] : undefined;
    const elegidoTexto = elegidoIndex !== undefined ? pares[elegidoIndex]?.derecha : null;
    const esCorrecta = elegidoIndex === i;

    return `
      <div class="opcion-linea ${esCorrecta ? 'opcion-elegida-buena' : elegidoTexto !== null ? 'opcion-elegida-mala' : ''}">
        ${esCorrecta ? iconoCorrecto() : elegidoTexto !== null ? iconoIncorrecto() : '<span class="w-5"></span>'}
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(par.izquierda)} → ${elegidoTexto ? escapeHtml(elegidoTexto) : '<em>sin responder</em>'}</span>
        ${!esCorrecta ? `<span class="text-sm text-on-surface-variant ml-auto">correcta: ${escapeHtml(par.derecha)}</span>` : ''}
      </div>`;
  }).join('');
}

function renderCompletar(pregunta, respuestaJson) {
  const plantilla = pregunta.contenido_json?.plantilla || '';
  const correctas = pregunta.contenido_json?.respuestas || [];
  const partes = plantilla.split('___');

  let textoConBlancos = escapeHtml(partes[0] || '');
  for (let i = 1; i < partes.length; i++) {
    const dado = respuestaJson?.[i - 1] ?? '';
    const correcto = (correctas[i - 1] ?? '').toString().trim().toLowerCase() === (dado ?? '').toString().trim().toLowerCase();
    const color = dado ? (correcto ? '#2c694e' : '#ba1a1a') : '#727784';
    textoConBlancos += `<span style="border-bottom:2px solid ${color};color:${color};font-weight:700;padding:0 4px;">${escapeHtml(dado || '—')}</span>`;
    textoConBlancos += escapeHtml(partes[i] || '');
  }

  const clave = correctas.map((c, i) => `<span class="text-sm text-on-surface-variant">Blanco ${i + 1}: <strong>${escapeHtml(c)}</strong></span>`).join(' · ');

  return `
    <p class="font-body-lg text-body-lg text-on-surface leading-relaxed">${textoConBlancos}</p>
    <p class="mt-2">${clave}</p>`;
}

async function cargarYRenderizar() {
  const { data: intento, error: errorIntento } = await supabase
    .from('intentos')
    .select('id, examen_id, alumno_id, estado, motivo_bloqueo, calificacion, fecha_inicio, fecha_fin, mapeo_relacionar, alumnos(nombre), examenes(titulo, grupo_id)')
    .eq('id', intentoId)
    .maybeSingle();

  if (errorIntento || !intento) {
    mostrarError('No se pudo cargar este intento (o no tienes permiso sobre él)');
    return;
  }

  document.getElementById('alumno-nombre').textContent = intento.alumnos?.nombre || 'Alumno';
  document.getElementById('respuesta-info').textContent = intento.examenes?.titulo || '';
  document.getElementById('link-volver').href = `resultados-examen.html?examen_id=${intento.examen_id}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Respuestas - ${intento.alumnos?.nombre || ''}`;

  document.getElementById('resumen-container').innerHTML = `
    <div class="flex items-center gap-3 flex-wrap">
      <span class="px-3 py-1 rounded-full text-sm font-label-lg ${ESTILOS_ESTADO[intento.estado] || ''}">${ETIQUETAS_ESTADO[intento.estado] || intento.estado}</span>
      <span class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${intento.calificacion != null ? `${Number(intento.calificacion).toFixed(0)}% (${(Number(intento.calificacion) / 10).toFixed(1)}/10)` : 'Sin calificación'}</span>
      ${intento.motivo_bloqueo ? `<span class="text-sm text-error">Motivo del bloqueo: ${escapeHtml(intento.motivo_bloqueo)}</span>` : ''}
    </div>`;

  const { data: preguntas, error: errorPreguntas } = await supabase
    .from('preguntas')
    .select('*, opciones(*)')
    .eq('examen_id', intento.examen_id)
    .order('orden', { ascending: true });

  if (errorPreguntas) {
    mostrarError(`No se pudieron cargar las preguntas: ${errorPreguntas.message}`);
    return;
  }

  const { data: respuestas, error: errorRespuestas } = await supabase
    .from('respuestas')
    .select('pregunta_id, respuesta_json, puntos_obtenidos')
    .eq('intento_id', intentoId);

  if (errorRespuestas) {
    mostrarError(`No se pudieron cargar las respuestas: ${errorRespuestas.message}`);
    return;
  }

  const respuestaPorPregunta = {};
  (respuestas || []).forEach((r) => { respuestaPorPregunta[r.pregunta_id] = r; });

  const cont = document.getElementById('preguntas-container');

  if (!preguntas || preguntas.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Este examen no tiene preguntas.</p>';
    return;
  }

  cont.innerHTML = preguntas.map((p, i) => {
    const r = respuestaPorPregunta[p.id];
    const respuestaJson = r?.respuesta_json;

    let cuerpo = '';
    if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
      cuerpo = `<div class="flex flex-col gap-2">${renderOpcionMultiple(p, respuestaJson)}</div>`;
    } else if (p.tipo === 'relacionar') {
      cuerpo = `<div class="flex flex-col gap-2">${renderRelacionar(p, respuestaJson, intento.mapeo_relacionar)}</div>`;
    } else if (p.tipo === 'completar') {
      cuerpo = renderCompletar(p, respuestaJson);
    } else {
      cuerpo = '<p class="text-on-surface-variant">Tipo de pregunta no reconocido.</p>';
    }

    return `
      <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6" style="animation: fadeIn 0.4s ease-out ${i * 0.04}s both;">
        <div class="flex items-start justify-between gap-4 mb-stack-md">
          <h3 class="font-body-lg text-body-lg text-on-surface">${i + 1}. ${escapeHtml(p.texto)}</h3>
          ${badgePuntos(r?.puntos_obtenidos ?? 0, p.puntos)}
        </div>
        ${cuerpo}
      </div>`;
  }).join('');
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!intentoId) {
    mostrarError('Falta el id del intento en la URL');
    return;
  }

  await cargarYRenderizar();
}

init();