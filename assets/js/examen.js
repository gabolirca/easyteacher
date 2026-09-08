import { supabase, SUPABASE_URL } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

let examenInfo = null;
let intentoId = null;
let preguntas = [];
let indiceActual = 0;
let respuestasEstado = {}; // { pregunta_id: valor-según-tipo }
let cronometroInterval = null;
let segundosRestantes = null;
let enviando = false; // evita doble envío
let examenTerminado = false; // ya se entregó o bloqueó, ignorar más eventos de salida

function mostrarVista(id) {
  ['vista-login', 'vista-entrada', 'vista-examen', 'vista-bloqueo', 'vista-entregado', 'vista-error']
    .forEach((v) => document.getElementById(v).classList.toggle('hidden', v !== id));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarErrorFatal(mensaje) {
  document.getElementById('error-mensaje').textContent = mensaje;
  mostrarVista('vista-error');
}

// ---------- Autenticación del alumno ----------

async function revisarSesion() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await cargarExamen();
  } else {
    mostrarVista('vista-login');
  }
}

document.getElementById('form-login-alumno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('login-error');
  errorBox.classList.add('hidden');

  const usuario = document.getElementById('alumno-usuario').value.trim();
  const password = document.getElementById('alumno-password').value;
  const email = usuario.includes('@') ? usuario : `${usuario.toLowerCase()}@alumnos.easyteacher.app`;

  const btn = document.getElementById('btn-login-alumno');
  btn.disabled = true;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = 'Matrícula/correo o contraseña incorrectos';
    errorBox.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  await cargarExamen();
});

// ---------- Cargar el examen desde la Edge Function ----------

async function cargarExamen() {
  if (!token) {
    mostrarErrorFatal('Este link no trae un examen válido.');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/iniciar-examen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ token }),
  });
  const data = await resp.json();

  if (!resp.ok) {
    mostrarErrorFatal(data.error || 'No se pudo cargar el examen.');
    return;
  }

  if (data.estado === 'entregado') {
    examenTerminado = true;
    mostrarVista('vista-entregado');
    return;
  }
  if (data.estado === 'bloqueado') {
    examenTerminado = true;
    document.getElementById('bloqueo-resumen').textContent = '';
    mostrarVista('vista-bloqueo');
    return;
  }
  examenInfo = data.examen;
  intentoId = data.intento_id;
  preguntas = data.preguntas;

  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${examenInfo.titulo}`;
  document.getElementById('entrada-titulo').textContent = examenInfo.titulo;
  document.getElementById('entrada-info').textContent =
    `${preguntas.length} pregunta${preguntas.length === 1 ? '' : 's'}` +
    (examenInfo.duracion_min ? ` · ${examenInfo.duracion_min} minutos` : '');

  mostrarVista('vista-entrada');
}

// ---------- Comenzar examen: pantalla completa + anti-salida ----------

document.getElementById('btn-comenzar').addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen();
  } catch {
    // Si el navegador rechaza pantalla completa, igual dejamos continuar
    // (mejor que bloquear al alumno por completo), pero el bloqueo por
    // "salir de pantalla completa" no podrá detectarse en ese caso.
  }

  if (examenInfo.duracion_min) {
    segundosRestantes = examenInfo.duracion_min * 60;
    iniciarCronometro();
  }

  indiceActual = 0;
  renderPregunta();
  mostrarVista('vista-examen');
  activarDeteccionSalida();
});

function iniciarCronometro() {
  actualizarCronometroUI();
  cronometroInterval = setInterval(() => {
    segundosRestantes--;
    actualizarCronometroUI();
    if (segundosRestantes <= 0) {
      clearInterval(cronometroInterval);
      entregar(false); // se acabó el tiempo: entrega normal con lo que haya
    }
  }, 1000);
}

function actualizarCronometroUI() {
  const m = Math.floor(segundosRestantes / 60).toString().padStart(2, '0');
  const s = (segundosRestantes % 60).toString().padStart(2, '0');
  document.getElementById('cronometro').innerHTML = `<span class="material-symbols-outlined text-lg">timer</span> ${m}:${s}`;
}

// ---------- Detección de salida (fullscreen / cambio de pestaña) ----------

function activarDeteccionSalida() {
  document.addEventListener('fullscreenchange', onPosibleSalida);
  document.addEventListener('visibilitychange', onPosibleSalida);
  window.addEventListener('blur', onPosibleSalida);
}

let temporizadorSalida = null;

function onPosibleSalida() {
  if (examenTerminado || enviando) return;

  // Algunos navegadores móviles (sobre todo Android) salen de pantalla
  // completa solos por una fracción de segundo al abrir un <select> nativo
  // (como en las preguntas de "relacionar") — no es que el alumno haya
  // salido de verdad. Por eso esperamos un momento corto y confirmamos que
  // SIGUE fuera antes de bloquear; si ya se recuperó solo, no pasa nada.
  if (temporizadorSalida) clearTimeout(temporizadorSalida);
  temporizadorSalida = setTimeout(() => {
    if (examenTerminado || enviando) return;
    const salioDeFullscreen = !document.fullscreenElement;
    const pestañaOculta = document.hidden;
    if (salioDeFullscreen || pestañaOculta) {
      entregar(true);
    }
  }, 700);
}

// ---------- Render de la pregunta actual ----------

function renderPregunta() {
  const p = preguntas[indiceActual];
  document.getElementById('contador-pregunta').textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
  document.getElementById('barra-progreso').style.width = `${((indiceActual + 1) / preguntas.length) * 100}%`;

  const cont = document.getElementById('pregunta-contenedor');
  let camposHtml = '';

  if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
    const seleccion = respuestasEstado[p.id];
    camposHtml = p.opciones.map((o) => `
      <label class="flex items-center gap-3 border border-outline-variant rounded-DEFAULT p-4 mb-3 cursor-pointer hover:bg-surface-container-high transition-colors ${seleccion === o.id ? 'border-primary bg-primary-fixed' : ''}">
        <input type="radio" name="opcion" value="${o.id}" class="input-respuesta" ${seleccion === o.id ? 'checked' : ''}/>
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(o.texto)}</span>
      </label>`).join('');
  } else if (p.tipo === 'completar') {
    const respuestasPrevias = respuestasEstado[p.id] || [];
    let i = 0;
    const partes = p.plantilla.split('___');
    camposHtml = '<p class="font-body-lg text-body-lg text-on-surface leading-loose">' + partes.map((parte, idx) => {
      if (idx === partes.length - 1) return escapeHtml(parte);
      const valor = escapeHtml(respuestasPrevias[idx] || '');
      return `${escapeHtml(parte)}<input type="text" class="input-blanco border-b-2 border-primary bg-transparent outline-none px-2 mx-1 font-bold text-primary" data-idx="${idx}" style="width:120px;" value="${valor}"/>`;
    }).join('') + '</p>';
  } else if (p.tipo === 'relacionar') {
    const seleccion = respuestasEstado[p.id] || {};
    camposHtml = `
      <div class="grid grid-cols-1 gap-3">
        ${p.izquierda.map((izq) => `
          <div class="flex items-center gap-3 border border-outline-variant rounded-DEFAULT p-3">
            <span class="font-body-md text-body-md text-on-surface flex-1">${escapeHtml(izq.texto)}</span>
            <span class="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
            <select class="select-relacionar border border-outline-variant rounded-DEFAULT p-2 flex-1" data-izq="${izq.id}">
              <option value="">Selecciona...</option>
              ${p.derecha.map((d) => `<option value="${d.id}" ${seleccion[izq.id] === d.id ? 'selected' : ''}>${escapeHtml(d.texto)}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>`;
  }

  cont.innerHTML = `
    <span class="inline-block bg-surface-container-high text-on-surface-variant text-sm px-3 py-1 rounded-full mb-3">${p.puntos} pts</span>
    <p class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-stack-md">${escapeHtml(p.texto)}</p>
    ${p.imagen_url ? `<img src="${escapeHtml(p.imagen_url)}" class="rounded-DEFAULT mb-stack-md w-full"/>` : ''}
    <div>${camposHtml}</div>`;

  cont.querySelectorAll('.input-respuesta').forEach((el) => {
    el.addEventListener('change', () => { respuestasEstado[p.id] = el.value; });
  });
  cont.querySelectorAll('.input-blanco').forEach((el) => {
    el.addEventListener('input', () => {
      const arr = respuestasEstado[p.id] || [];
      arr[Number(el.dataset.idx)] = el.value;
      respuestasEstado[p.id] = arr;
    });
  });
  cont.querySelectorAll('.select-relacionar').forEach((el) => {
    el.addEventListener('change', () => {
      const obj = respuestasEstado[p.id] || {};
      obj[el.dataset.izq] = el.value;
      respuestasEstado[p.id] = obj;
    });
  });

  document.getElementById('btn-anterior').style.visibility = indiceActual === 0 ? 'hidden' : 'visible';
  document.getElementById('btn-siguiente').innerHTML = indiceActual === preguntas.length - 1
    ? 'Entregar examen <span class="material-symbols-outlined">check</span>'
    : 'Siguiente <span class="material-symbols-outlined">arrow_forward</span>';
}

document.getElementById('btn-anterior').addEventListener('click', () => {
  if (indiceActual > 0) { indiceActual--; renderPregunta(); }
});

document.getElementById('btn-siguiente').addEventListener('click', () => {
  if (indiceActual < preguntas.length - 1) {
    indiceActual++;
    renderPregunta();
  } else {
    entregar(false);
  }
});

// ---------- Entregar (normal o por bloqueo) ----------

async function entregar(porBloqueo) {
  if (enviando || examenTerminado) return;
  enviando = true;
  if (cronometroInterval) clearInterval(cronometroInterval);

  const { data: { session } } = await supabase.auth.getSession();
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/enviar-respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        intento_id: intentoId,
        respuestas: respuestasEstado,
        motivo_bloqueo: porBloqueo ? 'Salió de pantalla completa o cambió de pestaña' : null,
      }),
    });
    await resp.json();
  } catch {
    // si falla la red en el momento del bloqueo, igual mostramos la pantalla
    // de bloqueo del lado del alumno; el profesor puede revisar el caso manualmente
  }

  examenTerminado = true;
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* noop */ }
  }
  mostrarVista(porBloqueo ? 'vista-bloqueo' : 'vista-entregado');
}

revisarSesion();