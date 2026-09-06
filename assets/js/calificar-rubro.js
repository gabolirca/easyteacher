import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const rubroId = params.get('rubro_id');

let grupoId = null;
let alumnos = []; // [{id, nombre}]
let calificacionPorAlumno = {}; // { alumno_id: number|null }
let terminoBusqueda = '';

const PALABRAS_A_ICONO = [
  [['conducta', 'comportamiento', 'disciplina'], 'psychology'],
  [['proyecto'], 'engineering'],
  [['puntualidad', 'asistencia'], 'schedule'],
  [['participacion', 'participación'], 'record_voice_over'],
  [['limpieza', 'orden'], 'cleaning_services'],
  [['presentacion', 'presentación', 'expo', 'exposicion', 'exposición'], 'co_present'],
  [['trabajo en equipo', 'equipo', 'grupal', 'colaboracion', 'colaboración'], 'groups'],
  [['creatividad', 'arte', 'dibujo'], 'palette'],
  [['esfuerzo', 'actitud'], 'emoji_events'],
  [['uniforme'], 'checkroom'],
  [['tarea', 'tareas'], 'assignment'],
];

function iconoParaRubro(nombre) {
  const n = (nombre || '').toLowerCase();
  for (const [palabras, icono] of PALABRAS_A_ICONO) {
    if (palabras.some((p) => n.includes(p))) return icono;
  }
  return 'star';
}

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

function actualizarContador() {
  const total = alumnos.length;
  const calificados = Object.values(calificacionPorAlumno).filter((v) => v !== null && v !== '').length;
  document.getElementById('contador-calificados').textContent = `${calificados} de ${total} alumnos calificados`;
}

function renderTabla() {
  const tbody = document.getElementById('tabla-alumnos-body');

  if (alumnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="py-6 px-6 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="py-6 px-6 text-center text-on-surface-variant">Ningún alumno coincide con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = visibles.map((a, i) => {
    const valor = calificacionPorAlumno[a.id] ?? '';
    return `
      <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
        <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
        <td class="py-3 px-6">
          <input type="number" min="0" max="10" step="0.1" class="input-calificacion w-24 px-3 py-2 rounded-DEFAULT border border-outline-variant transition-colors" data-alumno="${a.id}" value="${valor}" placeholder="—"/>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.input-calificacion').forEach((el) => {
    el.addEventListener('input', () => {
      calificacionPorAlumno[el.dataset.alumno] = el.value;
      actualizarContador();
    });
  });

  actualizarContador();
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderTabla();
});

async function cargarAlumnosYCalificaciones() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  alumnos = (alumnosData || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: calificaciones, error: errorCalif } = await supabase
    .from('calificaciones_rubro')
    .select('alumno_id, calificacion')
    .eq('rubro_id', rubroId);

  if (errorCalif) {
    mostrarError(`No se pudieron cargar las calificaciones: ${errorCalif.message}`);
    return;
  }

  calificacionPorAlumno = {};
  (calificaciones || []).forEach((c) => { calificacionPorAlumno[c.alumno_id] = c.calificacion ?? ''; });

  renderTabla();
}

document.getElementById('btn-guardar-calificaciones').addEventListener('click', async () => {
  const filas = alumnos.map((a) => ({
    rubro_id: rubroId,
    alumno_id: a.id,
    calificacion: calificacionPorAlumno[a.id] === '' || calificacionPorAlumno[a.id] == null ? null : parseFloat(calificacionPorAlumno[a.id]),
  }));

  const btn = document.getElementById('btn-guardar-calificaciones');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  const { error } = await supabase.from('calificaciones_rubro').upsert(filas, { onConflict: 'rubro_id,alumno_id' });

  btn.disabled = false;
  btn.textContent = textoOriginal;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  mostrarOk('Calificaciones guardadas.');
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!rubroId) {
    mostrarError('Falta el id del rubro en la URL');
    return;
  }

  const { data: rubro, error } = await supabase
    .from('rubros_evaluacion')
    .select('id, nombre, grupo_id')
    .eq('id', rubroId)
    .maybeSingle();

  if (error || !rubro) {
    mostrarError('No se pudo cargar este rubro (o no tienes permiso sobre él)');
    return;
  }

  grupoId = rubro.grupo_id;

  document.getElementById('rubro-titulo').textContent = rubro.nombre;
  document.getElementById('rubro-info').textContent = 'Rubro personalizado';
  document.getElementById('icono-rubro').textContent = iconoParaRubro(rubro.nombre);
  document.getElementById('link-volver').href = `rubros.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${rubro.nombre}`;

  await cargarAlumnosYCalificaciones();
}

init();