import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

let alumnosConGrupos = []; // [{id, nombre, matricula, grupos: [{id, nombre}]}]

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.classList.remove('hidden');
}

function renderTabla(lista) {
  const tbody = document.getElementById('tabla-alumnos-body');
  document.getElementById('contador-alumnos').textContent = `${lista.length} alumno(s)`;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">No se encontraron alumnos.</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map((a) => `
    <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors">
      <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
      <td class="py-3 px-6 font-body-md text-body-md text-on-surface-variant">${escapeHtml(a.matricula || '—')}</td>
      <td class="py-3 px-6">
        <div class="flex flex-wrap gap-2">
          ${a.grupos.map((g) => `
            <a href="alumnos.html?id=${g.id}" class="text-sm bg-surface-container-high hover:bg-primary-fixed text-on-surface px-3 py-1 rounded-full transition-colors" title="Ver en ${escapeHtml(g.nombre)}">
              ${escapeHtml(g.nombre)}
            </a>`).join('')}
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('buscador').addEventListener('input', (e) => {
  const texto = e.target.value.trim().toLowerCase();
  const filtrados = alumnosConGrupos.filter((a) =>
    a.nombre.toLowerCase().includes(texto) || (a.matricula || '').toLowerCase().includes(texto)
  );
  renderTabla(filtrados);
});

async function cargarAlumnos() {
  const { data, error } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre, matricula), grupos(id, nombre)');

  if (error) {
    mostrarError(`No se pudieron cargar los alumnos: ${error.message}`);
    return;
  }

  const porAlumno = {};
  (data || []).forEach((fila) => {
    const alumno = fila.alumnos;
    const grupo = fila.grupos;
    if (!alumno || !grupo) return;

    if (!porAlumno[alumno.id]) {
      porAlumno[alumno.id] = { id: alumno.id, nombre: alumno.nombre, matricula: alumno.matricula, grupos: [] };
    }
    porAlumno[alumno.id].grupos.push({ id: grupo.id, nombre: grupo.nombre });
  });

  alumnosConGrupos = Object.values(porAlumno).sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderTabla(alumnosConGrupos);
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  await cargarAlumnos();
}

init();