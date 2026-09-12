import { supabase, SUPABASE_URL } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

let alumnosConGrupos = []; // [{id, nombre, matricula, activo, ciclo_egreso, grupos:[...]}]
let seleccionados = new Set();
let verEgresados = false;
let profesorId = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('ok-box')?.classList.add('hidden');
}

function mostrarOk(msg) {
  const box = document.getElementById('ok-box');
  if (!box) return;
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

// Un alumno solo se puede egresar si ya no esta en ningun grupo ACTIVO.
// Puede estar en grupos de varios maestros: liberar su matricula mientras
// otra maestra lo tiene en lista le romperia el grupo a ella.
function puedeEgresar(a) {
  return a.activo && a.grupos.every((g) => g.archivado);
}

function motivoNoEgresable(a) {
  if (!a.activo) return 'Ya está egresado';
  const activos = a.grupos.filter((g) => !g.archivado);
  return `Sigue en ${activos.length} grupo(s) activo(s). Archívalos o quítalo de ahí primero.`;
}

function listaVisible() {
  const texto = (document.getElementById('buscador').value || '').trim().toLowerCase();
  return alumnosConGrupos
    .filter((a) => a.activo !== verEgresados)
    .filter((a) => !texto || a.nombre.toLowerCase().includes(texto) || (a.matricula || '').toLowerCase().includes(texto));
}

function renderTabla() {
  const lista = listaVisible();
  const tbody = document.getElementById('tabla-alumnos-body');
  document.getElementById('contador-alumnos').textContent =
    `${lista.length} alumno(s)${verEgresados ? ' egresado(s)' : ''}`;

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 px-6 text-center text-on-surface-variant">${
      verEgresados ? 'Todavía no has egresado a nadie.' : 'No se encontraron alumnos.'}</td></tr>`;
    actualizarBarra();
    return;
  }

  tbody.innerHTML = lista.map((a, i) => {
    const habilitado = puedeEgresar(a);
    return `
    <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
      <td class="py-3 px-6">
        ${a.activo ? `<input type="checkbox" class="chk-alumno" data-id="${a.id}" ${habilitado ? '' : 'disabled'} ${seleccionados.has(a.id) ? 'checked' : ''} title="${habilitado ? 'Seleccionar para egresar' : escapeHtml(motivoNoEgresable(a))}"/>` : ''}
      </td>
      <td class="py-3 px-6">
        <div class="flex items-center gap-3">
          <span class="avatar-inicial">${escapeHtml((a.nombre || '?').trim().charAt(0).toUpperCase())}</span>
          <span class="font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</span>
        </div>
      </td>
      <td class="py-3 px-6 font-body-md text-body-md text-on-surface-variant">
        ${escapeHtml(a.matricula || '—')}
        ${a.activo && a.correo ? `<span class="block text-sm text-on-surface-variant" title="Con este usuario entra el alumno">${escapeHtml(a.correo.split('@')[0])}</span>` : ''}
        ${!a.activo ? `<span class="block text-sm text-secondary">liberada · egresó ${escapeHtml(a.ciclo_egreso || '')}</span>` : ''}
      </td>
      <td class="py-3 px-6">
        <div class="flex flex-wrap gap-2">
          ${a.grupos.map((g) => `
            <a href="alumnos.html?id=${g.id}" class="badge-grupo text-sm ${g.archivado ? 'bg-surface-container text-on-surface-variant' : 'bg-surface-container-high text-on-surface'} hover:bg-primary-fixed px-3 py-1 rounded-full" title="${g.archivado ? 'Grupo archivado' : 'Grupo activo'}">
              ${escapeHtml(g.nombre)}${g.archivado ? ' (archivado)' : ''}
            </a>`).join('')}
        </div>
        ${a.grupos.length === 0 ? '<span class="text-sm text-on-surface-variant">Sin grupo</span>' : ''}
        ${a.activo && !habilitado ? `<p class="text-sm text-on-surface-variant mt-1">${escapeHtml(motivoNoEgresable(a))}</p>` : ''}
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.chk-alumno').forEach((c) => {
    c.addEventListener('change', () => {
      if (c.checked) seleccionados.add(c.dataset.id); else seleccionados.delete(c.dataset.id);
      actualizarBarra();
    });
  });
  actualizarBarra();
}

function actualizarBarra() {
  const barra = document.getElementById('barra-egresar');
  if (!barra) return;
  barra.classList.toggle('hidden', seleccionados.size === 0);
  document.getElementById('conteo-seleccion').textContent =
    `${seleccionados.size} alumno(s) seleccionado(s)`;
}

document.getElementById('buscador').addEventListener('input', renderTabla);

document.getElementById('btn-ver-egresados')?.addEventListener('click', () => {
  verEgresados = !verEgresados;
  seleccionados.clear();
  document.getElementById('btn-ver-egresados').textContent =
    verEgresados ? 'Ver alumnos activos' : 'Ver egresados';
  renderTabla();
});

document.getElementById('btn-egresar')?.addEventListener('click', async () => {
  const ciclo = (document.getElementById('ciclo-egreso').value || '').trim();
  if (ciclo.length < 4) { mostrarError('Escribe el ciclo escolar de egreso, por ejemplo 2025-2026'); return; }

  const nombres = alumnosConGrupos.filter((a) => seleccionados.has(a.id)).map((a) => a.nombre);
  if (!window.confirm(
    `¿Egresar a ${nombres.length} alumno(s) del ciclo ${ciclo}?\n\n` +
    `Sus calificaciones, asistencias y participaciones NO se borran: se conservan completas.\n` +
    `Lo que se libera es su matrícula y su correo, para que otra persona pueda usarlos.`)) return;

  const btn = document.getElementById('btn-egresar');
  btn.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/egresar-alumnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ alumno_ids: [...seleccionados], ciclo }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'No se pudo completar');

    const fallidos = (data.resultados || []).filter((r) => !r.ok);
    if (data.egresados > 0) {
      mostrarOk(`${data.egresados} alumno(s) egresado(s). Sus matrículas quedaron libres.`);
    }
    if (fallidos.length > 0) {
      mostrarError(fallidos.map((f) => `${f.nombre || f.alumnoId}: ${f.error}`).join(' · '));
    }
    seleccionados.clear();
    await cargarAlumnos();
  } catch (e) {
    mostrarError(e.message);
  } finally { btn.disabled = false; }
});

async function cargarAlumnos() {
  // Se consulta por DUEÑO, no por inscripción. Así también aparecen los
  // alumnos que quedaron sin grupo (porque el grupo se borró) y se pueden
  // gestionar o egresar, en vez de quedar invisibles para siempre.
  const { data: mios, error } = await supabase
    .from('alumnos')
    .select('id, nombre, matricula, activo, ciclo_egreso, correo_login')
    .eq('profesor_id', profesorId);

  if (error) {
    mostrarError(`No se pudieron cargar los alumnos: ${error.message}`);
    return;
  }

  const porAlumno = {};
  (mios || []).forEach((a) => {
    porAlumno[a.id] = {
      id: a.id, nombre: a.nombre, matricula: a.matricula,
      activo: a.activo !== false, ciclo_egreso: a.ciclo_egreso,
      correo: a.correo_login, grupos: [],
    };
  });

  const { data: inscripciones } = await supabase
    .from('grupo_alumnos')
    .select('alumno_id, grupos(id, nombre, archivado)');

  (inscripciones || []).forEach((fila) => {
    const g = fila.grupos;
    const a = porAlumno[fila.alumno_id];
    if (!g || !a) return;
    a.grupos.push({ id: g.id, nombre: g.nombre, archivado: !!g.archivado });
  });

  alumnosConGrupos = Object.values(porAlumno).sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderTabla();
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;
  profesorId = profesor.id;
  await cargarAlumnos();
}

init();
