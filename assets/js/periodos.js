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

async function cargarPeriodos() {
  const contenedor = document.getElementById('periodos-container');

  const { data: periodos, error } = await supabase
    .from('periodos')
    .select('id, nombre, examenes(count), tareas(count)')
    .eq('grupo_id', grupoId)
    .order('orden', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    contenedor.innerHTML = `<p class="text-error">No se pudieron cargar los periodos: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!periodos || periodos.length === 0) {
    contenedor.innerHTML = '<p class="text-on-surface-variant">Aún no hay periodos en este grupo — todo cuenta como un solo ciclo.</p>';
    return;
  }

   contenedor.innerHTML = periodos.map((p, i) => {
    const numExamenes = p.examenes?.[0]?.count ?? 0;
    const numTareas = p.tareas?.[0]?.count ?? 0;
    return `
      <div class="anim-pop card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 flex items-center gap-4" style="animation-delay: ${i * 0.08}s;">
        <div class="badge-periodo">${i + 1}</div>
        <div class="flex-1">
          <h3 class="font-body-lg text-body-lg text-on-surface">${escapeHtml(p.nombre)}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mt-1">${numExamenes} examen(es) · ${numTareas} tarea(s)</p>
        </div>
        <button class="btn-eliminar-periodo text-error hover:bg-error-container p-2 rounded-full transition-colors" data-id="${p.id}" aria-label="Eliminar">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>`;
  }).join('');

  contenedor.querySelectorAll('.btn-eliminar-periodo').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmado = window.confirm('¿Eliminar este periodo? Los exámenes y tareas que ya tenía se quedan sin periodo asignado (no se borran).');
      if (!confirmado) return;
      const { error: errorBorrar } = await supabase.from('periodos').delete().eq('id', btn.dataset.id);
      if (errorBorrar) {
        mostrarError(`No se pudo eliminar: ${errorBorrar.message}`);
        return;
      }
      await cargarPeriodos();
    });
  });
}

document.getElementById('btn-agregar-periodo').addEventListener('click', async () => {
  const nombre = document.getElementById('periodo-nombre').value.trim();
  if (!nombre) {
    mostrarError('Ponle un nombre al periodo');
    return;
  }

  const { data: existentes } = await supabase.from('periodos').select('orden').eq('grupo_id', grupoId).order('orden', { ascending: false }).limit(1);
  const siguienteOrden = (existentes?.[0]?.orden ?? -1) + 1;

  const { error } = await supabase.from('periodos').insert({ grupo_id: grupoId, nombre, orden: siguienteOrden });

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  document.getElementById('periodo-nombre').value = '';
  mostrarOk('Periodo creado.');
  await cargarPeriodos();
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
  if (tituloEl) tituloEl.textContent = `AulaFácil - Periodos - ${grupo.nombre}`;

  await cargarPeriodos();
}

init();