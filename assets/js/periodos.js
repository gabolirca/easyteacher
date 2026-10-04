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
    .select('id, nombre, fecha_inicio, fecha_fin, examenes(count), tareas(count)')
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
          <div class="flex items-center gap-2 mt-2 flex-wrap text-sm text-on-surface-variant">
            <input type="date" class="fecha-periodo px-2 py-1 rounded-DEFAULT border border-outline-variant bg-surface text-on-surface" data-id="${p.id}" data-campo="fecha_inicio" value="${p.fecha_inicio ?? ''}" aria-label="Fecha de inicio"/>
            <span>a</span>
            <input type="date" class="fecha-periodo px-2 py-1 rounded-DEFAULT border border-outline-variant bg-surface text-on-surface" data-id="${p.id}" data-campo="fecha_fin" value="${p.fecha_fin ?? ''}" aria-label="Fecha de fin"/>
            ${!p.fecha_inicio || !p.fecha_fin ? '<span class="text-tertiary">Sin fechas: el corte de asistencia no puede usar este periodo</span>' : ''}
          </div>
        </div>
        <button class="btn-eliminar-periodo text-error hover:bg-error-container p-2 rounded-full transition-colors" data-id="${p.id}" aria-label="Eliminar">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>`;
  }).join('');

  contenedor.querySelectorAll('.fecha-periodo').forEach((input) => {
    input.addEventListener('change', async () => {
      const { error: errorFecha } = await supabase
        .from('periodos')
        .update({ [input.dataset.campo]: input.value || null })
        .eq('id', input.dataset.id);
      if (errorFecha) {
        mostrarError(errorFecha.message.includes('periodo_fechas_en_orden')
          ? 'La fecha de fin no puede ser antes que la de inicio'
          : `No se pudo guardar la fecha: ${errorFecha.message}`);
        await cargarPeriodos();
        return;
      }
      mostrarOk('Fechas del periodo guardadas.');
      await cargarPeriodos();
    });
  });

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
  const fechaInicio = document.getElementById('periodo-inicio').value || null;
  const fechaFin = document.getElementById('periodo-fin').value || null;
  if (!nombre) {
    mostrarError('Ponle un nombre al periodo');
    return;
  }
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    mostrarError('La fecha de fin no puede ser antes que la de inicio');
    return;
  }

  const { data: existentes } = await supabase.from('periodos').select('orden').eq('grupo_id', grupoId).order('orden', { ascending: false }).limit(1);
  const siguienteOrden = (existentes?.[0]?.orden ?? -1) + 1;

  const { error } = await supabase.from('periodos').insert({
    grupo_id: grupoId, nombre, orden: siguienteOrden, fecha_inicio: fechaInicio, fecha_fin: fechaFin,
  });

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  document.getElementById('periodo-nombre').value = '';
  document.getElementById('periodo-inicio').value = '';
  document.getElementById('periodo-fin').value = '';
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