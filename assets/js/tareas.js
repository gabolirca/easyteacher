import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

function mostrarOk(msg) {
  const box = document.getElementById('ok-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

function formatoFecha(f) {
  if (!f) return 'Sin fecha límite';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

const PALABRAS_A_ICONO = [
  [['examen', 'quiz', 'cuestionario'], 'quiz'],
  [['proyecto'], 'engineering'],
  [['ensayo', 'redaccion', 'redacción'], 'edit_note'],
  [['lectura', 'leer', 'libro', 'capitulo', 'capítulo'], 'menu_book'],
  [['investigacion', 'investigación'], 'science'],
  [['presentacion', 'presentación', 'expo', 'exposicion', 'exposición'], 'co_present'],
  [['resumen', 'sintesis', 'síntesis'], 'summarize'],
  [['mapa mental', 'mapa conceptual'], 'account_tree'],
  [['dibujo', 'dibuja', 'ilustra'], 'draw'],
  [['video', 'vídeo'], 'movie'],
  [['laboratorio', 'practica', 'práctica'], 'science'],
  [['problema', 'ejercicio', 'ejercicios'], 'calculate'],
  [['equipo', 'grupal'], 'groups'],
];

function iconoParaTarea(titulo) {
  const t = (titulo || '').toLowerCase();
  for (const [palabras, icono] of PALABRAS_A_ICONO) {
    if (palabras.some((p) => t.includes(p))) return icono;
  }
  return 'assignment';
}

async function cargarTareas() {
  const contenedor = document.getElementById('tareas-container');

  const { data: tareas, error } = await supabase
    .from('tareas')
    .select('id, titulo, fecha_limite, peso_ponderacion, created_at, calificaciones_tareas(count), periodos(nombre)')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: false });

  if (error) {
    contenedor.innerHTML = `<p class="text-error">No se pudieron cargar las tareas: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!tareas || tareas.length === 0) {
    contenedor.innerHTML = '<p class="text-on-surface-variant">Aún no hay tareas en este grupo. Da clic en "+ Nueva tarea" para crear la primera.</p>';
    return;
  }

  contenedor.innerHTML = tareas.map((t, i) => {
    const calificados = t.calificaciones_tareas?.[0]?.count ?? 0;
    return `
      <div class="card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6 flex items-center gap-4" style="animation: popIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.08}s both;">
        <div class="icono-tarea">
          <span class="material-symbols-outlined">${iconoParaTarea(t.titulo)}</span>
        </div>
        <div class="flex-1">
          <h3 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(t.titulo)}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mt-1">${formatoFecha(t.fecha_limite)} · peso ${t.peso_ponderacion} · ${calificados} alumno(s) calificados${t.periodos?.nombre ? ` · ${escapeHtml(t.periodos.nombre)}` : ''}</p>
        </div>
        <a class="border-2 border-primary text-primary font-button-text text-button-text py-2 px-6 rounded-full hover:bg-primary hover:text-on-primary transition-colors shrink-0" href="calificar-tarea.html?tarea_id=${t.id}">
          Calificar
        </a>
      </div>`;
  }).join('');
}

document.getElementById('btn-nueva-tarea').addEventListener('click', () => {
  document.getElementById('form-nueva-tarea').classList.remove('hidden');
});

document.getElementById('btn-cancelar-tarea').addEventListener('click', () => {
  document.getElementById('form-nueva-tarea').classList.add('hidden');
});

document.getElementById('btn-guardar-tarea').addEventListener('click', async () => {
  const titulo = document.getElementById('tarea-titulo').value.trim();
  const fechaLimite = document.getElementById('tarea-fecha-limite').value || null;
  const peso = parseFloat(document.getElementById('tarea-peso').value) || 1;
  const periodoId = document.getElementById('tarea-periodo').value || null;

  if (!titulo) {
    mostrarError('Ponle un título a la tarea');
    return;
  }

  const btn = document.getElementById('btn-guardar-tarea');
  btn.disabled = true;

  const { error } = await supabase
    .from('tareas')
    .insert({ grupo_id: grupoId, titulo, fecha_limite: fechaLimite, peso_ponderacion: peso, periodo_id: periodoId });

  btn.disabled = false;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  document.getElementById('tarea-titulo').value = '';
  document.getElementById('tarea-fecha-limite').value = '';
  document.getElementById('tarea-peso').value = '1';
  document.getElementById('form-nueva-tarea').classList.add('hidden');
  mostrarOk('Tarea creada.');
  await cargarTareas();
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!grupoId) {
    mostrarError('Falta el id del grupo en la URL');
    return;
  }

  const { data: grupo, error } = await supabase
    .from('grupos')
    .select('id, nombre')
    .eq('id', grupoId)
    .maybeSingle();

  if (error || !grupo) {
    mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)');
    return;
  }

  document.getElementById('grupo-nombre').textContent = grupo.nombre;
  document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Tareas - ${grupo.nombre}`;

  await cargarPeriodos();
  await cargarTareas();
}

async function cargarPeriodos() {
  const { data: periodos } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });
  if (!periodos || periodos.length === 0) return;

  const select = document.getElementById('tarea-periodo');
  select.innerHTML = '<option value="">Sin periodo (todo el ciclo)</option>' +
    periodos.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('campo-periodo-tarea').classList.remove('hidden');
}

init();