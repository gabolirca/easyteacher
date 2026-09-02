import { supabase, SUPABASE_URL } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

let profesorActual = null;
let alumnosPendientes = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(mensaje) {
  const box = document.getElementById('error-box');
  box.textContent = mensaje;
  box.classList.remove('hidden');
}

function ocultarError() {
  document.getElementById('error-box').classList.add('hidden');
}

function renderTabla() {
  const tbody = document.getElementById('tabla-alumnos-body');

  if (alumnosPendientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Aún no agregas alumnos</td></tr>';
    return;
  }

  tbody.innerHTML = alumnosPendientes.map((a, i) => `
    <tr class="hover:bg-surface-bright transition-colors h-[64px]">
      <td class="py-4 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
      <td class="py-4 px-6 font-body-md text-body-md text-on-surface-variant">${escapeHtml(a.correo || a.matricula)}</td>
      <td class="py-4 px-6 text-right">
        <button data-idx="${i}" class="btn-eliminar text-error hover:text-on-error-container p-2 rounded-full hover:bg-error-container transition-colors" aria-label="Eliminar alumno">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.btn-eliminar').forEach((btn) => {
    btn.addEventListener('click', () => {
      alumnosPendientes.splice(Number(btn.dataset.idx), 1);
      renderTabla();
    });
  });
}

document.getElementById('btn-agregar-alumno').addEventListener('click', () => {
  const nombreInput = document.getElementById('student-name');
  const idInput = document.getElementById('student-id');
  const nombre = nombreInput.value.trim();
  const idAlumno = idInput.value.trim();

  if (!nombre || !idAlumno) {
    mostrarError('Escribe el nombre y la matrícula o correo del alumno antes de agregarlo');
    return;
  }
  ocultarError();

  const esCorreo = idAlumno.includes('@');
  alumnosPendientes.push({
    nombre,
    matricula: esCorreo ? idAlumno.split('@')[0] : idAlumno,
    correo: esCorreo ? idAlumno : '',
  });

  nombreInput.value = '';
  idInput.value = '';
  nombreInput.focus();
  renderTabla();
});

document.getElementById('btn-guardar-grupo').addEventListener('click', async () => {
  ocultarError();
  const nombreGrupo = document.getElementById('group-name').value.trim();
  const materia = document.getElementById('subject').value.trim();

  if (!nombreGrupo) {
    mostrarError('Ponle un nombre al grupo antes de guardar');
    return;
  }

  const btn = document.getElementById('btn-guardar-grupo');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const { data: grupo, error: errorGrupo } = await supabase
      .from('grupos')
      .insert({ nombre: nombreGrupo, materia, profesor_id: profesorActual.id })
      .select()
      .single();

    if (errorGrupo) throw errorGrupo;

    if (alumnosPendientes.length > 0) {
      const { data: { session } } = await supabase.auth.getSession();

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/crear-alumnos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ grupo_id: grupo.id, alumnos: alumnosPendientes }),
      });

      const resultado = await resp.json();
      if (!resp.ok) throw new Error(resultado.error || 'No se pudieron crear las cuentas de los alumnos');

      const fallidos = (resultado.resultados || []).filter((r) => !r.ok);
      if (fallidos.length > 0) {
        console.warn('Algunos alumnos no se pudieron dar de alta:', fallidos);
        mostrarError(`El grupo se creó, pero ${fallidos.length} alumno(s) no se pudieron dar de alta (revisa la consola). Puedes agregarlos después.`);
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 2500);
        return;
      }
    }

    window.location.href = 'dashboard.html';
  } catch (err) {
    mostrarError(err.message || 'Ocurrió un error al guardar el grupo');
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

document.getElementById('btn-logout-sidebar').addEventListener('click', async (e) => {
  e.preventDefault();
  await supabase.auth.signOut();
  window.location.href = 'login.html';
});

(async function init() {
  profesorActual = await requireProfesor();
  if (!profesorActual) return;
  renderTabla();
})();

