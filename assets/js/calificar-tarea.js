import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const tareaId = params.get('tarea_id');

let grupoId = null;
let alumnos = []; // [{id, nombre}]
let estadoPorAlumno = {}; // { alumno_id: { entregado: bool, calificacion: number|null } }
let terminoBusqueda = '';

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
  const calificados = Object.values(estadoPorAlumno).filter((e) => e.calificacion !== null && e.calificacion !== '').length;
  document.getElementById('contador-calificados').textContent = `${calificados} de ${total} alumnos calificados`;
}

function renderTabla() {
  const tbody = document.getElementById('tabla-alumnos-body');

  if (alumnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Ningún alumno coincide con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = visibles.map((a, i) => {
    const estado = estadoPorAlumno[a.id] || { entregado: false, calificacion: '' };
    return `
      <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
        <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
        <td class="py-3 px-6 text-center">
          <input type="checkbox" class="chk-entregado w-5 h-5" data-alumno="${a.id}" ${estado.entregado ? 'checked' : ''}/>
        </td>
        <td class="py-3 px-6">
          <input type="number" min="0" max="10" step="0.1" class="input-calificacion w-24 px-3 py-2 rounded-DEFAULT border border-outline-variant transition-colors" data-alumno="${a.id}" value="${estado.calificacion}" placeholder="—"/>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.chk-entregado').forEach((el) => {
    el.addEventListener('change', () => {
      const id = el.dataset.alumno;
      estadoPorAlumno[id] = estadoPorAlumno[id] || { entregado: false, calificacion: '' };
      estadoPorAlumno[id].entregado = el.checked;
    });
  });

  tbody.querySelectorAll('.input-calificacion').forEach((el) => {
    el.addEventListener('input', () => {
      const id = el.dataset.alumno;
      estadoPorAlumno[id] = estadoPorAlumno[id] || { entregado: false, calificacion: '' };
      estadoPorAlumno[id].calificacion = el.value;
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
    .from('calificaciones_tareas')
    .select('alumno_id, calificacion, entregado')
    .eq('tarea_id', tareaId);

  if (errorCalif) {
    mostrarError(`No se pudieron cargar las calificaciones: ${errorCalif.message}`);
    return;
  }

  estadoPorAlumno = {};
  (calificaciones || []).forEach((c) => {
    estadoPorAlumno[c.alumno_id] = { entregado: c.entregado, calificacion: c.calificacion ?? '' };
  });

  renderTabla();
}

document.getElementById('btn-guardar-calificaciones').addEventListener('click', async () => {
  const filas = alumnos.map((a) => {
    const estado = estadoPorAlumno[a.id] || { entregado: false, calificacion: '' };
    return {
      tarea_id: tareaId,
      alumno_id: a.id,
      entregado: estado.entregado,
      calificacion: estado.calificacion === '' ? null : parseFloat(estado.calificacion),
    };
  });

  const btn = document.getElementById('btn-guardar-calificaciones');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  const { error } = await supabase
    .from('calificaciones_tareas')
    .upsert(filas, { onConflict: 'tarea_id,alumno_id' });

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

  if (!tareaId) {
    mostrarError('Falta el id de la tarea en la URL');
    return;
  }

  const { data: tarea, error } = await supabase
    .from('tareas')
    .select('id, titulo, fecha_limite, grupo_id')
    .eq('id', tareaId)
    .maybeSingle();

  if (error || !tarea) {
    mostrarError('No se pudo cargar esta tarea (o no tienes permiso sobre ella)');
    return;
  }

  grupoId = tarea.grupo_id;

  document.getElementById('tarea-titulo').textContent = tarea.titulo;
  document.getElementById('tarea-info').textContent = tarea.fecha_limite ? `Fecha límite: ${tarea.fecha_limite}` : 'Sin fecha límite';
  document.getElementById('icono-tarea').textContent = iconoParaTarea(tarea.titulo);
  document.getElementById('link-volver').href = `tareas.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${tarea.titulo}`;

  await cargarAlumnosYCalificaciones();
}

init();