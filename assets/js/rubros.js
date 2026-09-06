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

async function cargarRubros() {
  const contenedor = document.getElementById('rubros-container');

  const { data: rubros, error } = await supabase
    .from('rubros_evaluacion')
    .select('id, nombre, peso, calificaciones_rubro(count), periodos(nombre)')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: true });

  if (error) {
    contenedor.innerHTML = `<p class="text-error">No se pudieron cargar los rubros: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!rubros || rubros.length === 0) {
    contenedor.innerHTML = '<p class="text-on-surface-variant">Aún no hay rubros personalizados en este grupo.</p>';
    return;
  }

  contenedor.innerHTML = rubros.map((r, i) => {
    const calificados = r.calificaciones_rubro?.[0]?.count ?? 0;
    return `
      <div class="anim-pop card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6 flex items-center gap-4" style="animation-delay: ${i * 0.08}s;">
        <div class="icono-rubro">
          <span class="material-symbols-outlined">${iconoParaRubro(r.nombre)}</span>
        </div>
        <div class="flex-1">
          <h3 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(r.nombre)}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mt-1">Peso actual: ${r.peso}% · ${calificados} alumno(s) calificados${r.periodos?.nombre ? ` · ${escapeHtml(r.periodos.nombre)}` : ''}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn-eliminar-rubro text-error hover:bg-error-container p-2 rounded-full transition-colors" data-rubro-id="${r.id}" aria-label="Eliminar rubro">
            <span class="material-symbols-outlined">delete</span>
          </button>
          <a class="border-2 border-primary text-primary font-button-text text-button-text py-2 px-6 rounded-full hover:bg-primary hover:text-on-primary transition-colors" href="calificar-rubro.html?rubro_id=${r.id}">
            Calificar
          </a>
        </div>
      </div>`;
  }).join('');

  contenedor.querySelectorAll('.btn-eliminar-rubro').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmado = window.confirm('¿Eliminar este rubro? Se borran también las calificaciones que tenga.');
      if (!confirmado) return;
      const { error: errorBorrar } = await supabase.from('rubros_evaluacion').delete().eq('id', btn.dataset.rubroId);
      if (errorBorrar) {
        mostrarError(`No se pudo eliminar: ${errorBorrar.message}`);
        return;
      }
      await cargarRubros();
    });
  });
}

document.getElementById('btn-nuevo-rubro').addEventListener('click', () => {
  document.getElementById('form-nuevo-rubro').classList.remove('hidden');
});

document.getElementById('btn-cancelar-rubro').addEventListener('click', () => {
  document.getElementById('form-nuevo-rubro').classList.add('hidden');
});

document.getElementById('btn-guardar-rubro').addEventListener('click', async () => {
  const nombre = document.getElementById('rubro-nombre').value.trim();
  const periodoId = document.getElementById('rubro-periodo').value || null;
  if (!nombre) {
    mostrarError('Ponle un nombre al rubro');
    return;
  }

  const btn = document.getElementById('btn-guardar-rubro');
  btn.disabled = true;

  const { error } = await supabase.from('rubros_evaluacion').insert({ grupo_id: grupoId, nombre, peso: 0, periodo_id: periodoId });

  btn.disabled = false;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  document.getElementById('rubro-nombre').value = '';
  document.getElementById('form-nuevo-rubro').classList.add('hidden');
  mostrarOk('Rubro creado. Ajusta su peso desde "Calificaciones finales".');
  await cargarRubros();
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
  if (tituloEl) tituloEl.textContent = `AulaFácil - Rubros - ${grupo.nombre}`;

  await cargarPeriodos();
  await cargarRubros();
}

async function cargarPeriodos() {
  const { data: periodos } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });
  if (!periodos || periodos.length === 0) return;

  const select = document.getElementById('rubro-periodo');
  select.innerHTML = '<option value="">Sin periodo (todo el ciclo)</option>' +
    periodos.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('campo-periodo-rubro').classList.remove('hidden');
}

init();