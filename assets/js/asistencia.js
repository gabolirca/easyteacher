import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

let alumnos = []; // [{id, nombre}]
let estadoPorAlumno = {}; // { alumno_id: 'presente' | 'falta' | 'retardo' | null }
let terminoBusqueda = '';

const ESTILOS = {
  presente: 'bg-secondary text-on-secondary border-secondary activo',
  falta: 'bg-error text-on-error border-error activo',
  retardo: 'bg-tertiary text-on-tertiary border-tertiary activo',
};
const ICONOS = { presente: 'check_circle', falta: 'cancel', retardo: 'schedule' };
const ETIQUETAS = { presente: 'Presente', falta: 'Falta', retardo: 'Retardo' };

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

function hoyLocal() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function actualizarContador() {
  const valores = Object.values(estadoPorAlumno);
  const contar = (t) => valores.filter((v) => v === t).length;
  document.getElementById('contador-resumen').innerHTML = `
    <span class="pill-contador bg-secondary-container text-on-secondary-container"><span class="material-symbols-outlined text-base">check_circle</span> ${contar('presente')} presentes</span>
    <span class="pill-contador bg-error-container text-on-error-container"><span class="material-symbols-outlined text-base">cancel</span> ${contar('falta')} faltas</span>
    <span class="pill-contador bg-tertiary-container text-on-tertiary-container"><span class="material-symbols-outlined text-base">schedule</span> ${contar('retardo')} retardos</span>`;
}

function renderLista() {
  const cont = document.getElementById('lista-alumnos');

  if (alumnos.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</p>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Ningún alumno coincide con la búsqueda.</p>';
    return;
  }

  cont.innerHTML = visibles.map((a, i) => {
    const actual = estadoPorAlumno[a.id];
    const botones = ['presente', 'falta', 'retardo'].map((t) => `
      <button data-alumno="${a.id}" data-estado="${t}" class="btn-estado px-4 py-2 rounded-full font-label-lg text-label-lg border ${actual === t ? ESTILOS[t] : 'bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container-high'}">
        <span class="material-symbols-outlined text-lg">${ICONOS[t]}</span> ${ETIQUETAS[t]}
      </button>`).join('');

    return `
      <div class="card-hover flex items-center justify-between gap-4 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4" style="animation: popIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.05}s both;">
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</span>
        <div class="flex gap-2 shrink-0 flex-wrap justify-end">${botones}</div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.btn-estado').forEach((btn) => {
    btn.addEventListener('click', () => {
      estadoPorAlumno[btn.dataset.alumno] = btn.dataset.estado;
      renderLista();
      actualizarContador();
    });
  });

  actualizarContador();
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderLista();
});

async function cargarAlumnos() {
  const { data, error } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (error) {
    mostrarError(`No se pudieron cargar los alumnos: ${error.message}`);
    return;
  }

  alumnos = (data || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function cargarAsistenciaDeFecha() {
  const fecha = document.getElementById('fecha-asistencia').value;
  estadoPorAlumno = {};

  const { data, error } = await supabase
    .from('asistencias')
    .select('alumno_id, estado')
    .eq('grupo_id', grupoId)
    .eq('fecha', fecha);

  if (error) {
    mostrarError(`No se pudo cargar la asistencia de esa fecha: ${error.message}`);
    return;
  }

  (data || []).forEach((row) => { estadoPorAlumno[row.alumno_id] = row.estado; });
  renderLista();
}

document.getElementById('fecha-asistencia').addEventListener('change', () => {
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('ok-box').classList.add('hidden');
  cargarAsistenciaDeFecha();
});

document.getElementById('btn-marcar-todos').addEventListener('click', () => {
  alumnos.forEach((a) => { estadoPorAlumno[a.id] = 'presente'; });
  renderLista();
});

document.getElementById('btn-guardar-asistencia').addEventListener('click', async () => {
  const fecha = document.getElementById('fecha-asistencia').value;
  if (!fecha) {
    mostrarError('Elige una fecha');
    return;
  }

  const filas = Object.entries(estadoPorAlumno)
    .filter(([, estado]) => estado)
    .map(([alumno_id, estado]) => ({ grupo_id: grupoId, alumno_id, fecha, estado }));

  if (filas.length === 0) {
    mostrarError('Marca al menos un alumno antes de guardar');
    return;
  }

  const btn = document.getElementById('btn-guardar-asistencia');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  const { error } = await supabase
    .from('asistencias')
    .upsert(filas, { onConflict: 'grupo_id,alumno_id,fecha' });

  btn.disabled = false;
  btn.textContent = textoOriginal;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  mostrarOk('Asistencia guardada.');
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
  if (tituloEl) tituloEl.textContent = `AulaFácil - Asistencia - ${grupo.nombre}`;

  document.getElementById('fecha-asistencia').value = hoyLocal();

  await cargarAlumnos();
  await cargarAsistenciaDeFecha();
}

init();