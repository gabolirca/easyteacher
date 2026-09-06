import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const examenId = params.get('examen_id');

let grupoId = null;
let filas = []; // [{alumnoId, nombre, intento: {...} | null}]
let terminoBusqueda = '';

const ETIQUETAS_ESTADO = {
  en_curso: 'En curso',
  bloqueado: 'Bloqueado',
  entregado: 'Entregado',
  sin_intento: 'Sin intentar',
};
const ESTILOS_ESTADO = {
  en_curso: 'bg-tertiary-container text-on-tertiary-container',
  bloqueado: 'bg-error-container text-on-error-container',
  entregado: 'bg-secondary-container text-on-secondary-container',
  sin_intento: 'bg-surface-container-high text-on-surface-variant',
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
  document.getElementById('ok-box').classList.add('hidden');
}

function mostrarOk(msg) {
  const box = document.getElementById('ok-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

function formatoFecha(f) {
  if (!f) return '';
  const d = new Date(f);
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderLista() {
  const cont = document.getElementById('lista-resultados');

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? filas.filter((f) => f.nombre.toLowerCase().includes(filtro)) : filas;

  if (visibles.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Ningún alumno coincide con la búsqueda.</p>';
    return;
  }

  cont.innerHTML = visibles.map((f, i) => {
    const intento = f.intento;
    const estado = intento ? intento.estado : 'sin_intento';
    const calif = intento?.calificacion != null ? `${Number(intento.calificacion).toFixed(0)}% (${(Number(intento.calificacion) / 10).toFixed(1)}/10)` : '—';
    const fecha = intento ? formatoFecha(intento.fecha_fin || intento.fecha_inicio) : '';

    const botones = [];
    if (intento) {
      botones.push(`<a href="ver-respuestas.html?intento_id=${intento.id}" class="border-2 border-primary text-primary font-button-text text-button-text py-2 px-4 rounded-full hover:bg-primary hover:text-on-primary transition-colors text-sm">Ver respuestas</a>`);
    }
    if (intento && intento.estado === 'bloqueado') {
      botones.push(`<button class="btn-reactivar bg-primary text-on-primary font-button-text text-button-text py-2 px-4 rounded-full hover:opacity-90 transition-opacity text-sm" data-intento-id="${intento.id}">Reactivar</button>`);
    }

    return `
      <div class="card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 flex items-center justify-between gap-4 flex-wrap" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
        <div class="flex items-center gap-3">
          <span class="avatar-inicial">${escapeHtml((f.nombre || '?').trim().charAt(0).toUpperCase())}</span>
          <div>
            <span class="font-body-md text-body-md text-on-surface">${escapeHtml(f.nombre)}</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="px-3 py-1 rounded-full text-sm font-label-lg ${ESTILOS_ESTADO[estado]}">${ETIQUETAS_ESTADO[estado]}</span>
              <span class="text-sm text-on-surface-variant">${calif}${fecha ? ` · ${fecha}` : ''}</span>
              ${intento?.motivo_bloqueo ? `<span class="text-sm text-error" title="${escapeHtml(intento.motivo_bloqueo)}">· ${escapeHtml(intento.motivo_bloqueo)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-2 shrink-0">${botones.join('')}</div>
      </div>`;
  }).join('');

  cont.querySelectorAll('.btn-reactivar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmado = window.confirm('¿Reactivar este examen para el alumno? Se borra el intento bloqueado (y sus respuestas) para que pueda volver a entrar con el mismo link, desde el principio.');
      if (!confirmado) return;

      const { error } = await supabase.from('intentos').delete().eq('id', btn.dataset.intentoId);
      if (error) {
        mostrarError(`No se pudo reactivar: ${error.message}`);
        return;
      }

      mostrarOk('Examen reactivado. El alumno puede volver a entrar con el mismo link.');
      await cargarResultados();
    });
  });
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderLista();
});

async function cargarResultados() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  const alumnos = (alumnosData || []).map((r) => r.alumnos).filter(Boolean);

  const { data: intentos, error: errorIntentos } = await supabase
    .from('intentos')
    .select('id, alumno_id, estado, motivo_bloqueo, calificacion, fecha_inicio, fecha_fin')
    .eq('examen_id', examenId);

  if (errorIntentos) {
    mostrarError(`No se pudieron cargar los intentos: ${errorIntentos.message}`);
    return;
  }

  const intentoPorAlumno = {};
  (intentos || []).forEach((i) => { intentoPorAlumno[i.alumno_id] = i; });

  filas = alumnos
    .map((a) => ({ alumnoId: a.id, nombre: a.nombre, intento: intentoPorAlumno[a.id] || null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  renderLista();
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!examenId) {
    mostrarError('Falta el id del examen en la URL');
    return;
  }

  const { data: examen, error } = await supabase
    .from('examenes')
    .select('id, titulo, grupo_id, grupos(nombre)')
    .eq('id', examenId)
    .maybeSingle();

  if (error || !examen) {
    mostrarError('No se pudo cargar este examen (o no tienes permiso sobre él)');
    return;
  }

  grupoId = examen.grupo_id;

  document.getElementById('examen-titulo').textContent = examen.titulo;
  document.getElementById('examen-info').textContent = examen.grupos?.nombre || '';
  document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Resultados - ${examen.titulo}`;

  await cargarResultados();
}

init();