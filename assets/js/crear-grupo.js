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
  box.style.whiteSpace = 'pre-line';
  box.classList.remove('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

function mostrarOk(mensaje) {
  const box = document.getElementById('ok-box');
  box.textContent = mensaje;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

function ocultarError() {
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('ok-box').classList.add('hidden');
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

function normalizarEncabezado(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

document.getElementById('btn-importar-excel').addEventListener('click', () => {
  document.getElementById('input-excel').click();
});

document.getElementById('input-excel').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;

  ocultarError();

  try {
    const datosArchivo = await archivo.arrayBuffer();
    const libro = window.XLSX.read(datosArchivo, { type: 'array' });
    const primeraHoja = libro.Sheets[libro.SheetNames[0]];
    const filas = window.XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });

    if (filas.length === 0) {
      mostrarError('El archivo no tiene filas para importar');
      e.target.value = '';
      return;
    }

    // Detecta las columnas de nombre y matrícula/correo sin importar el
    // encabezado exacto que haya usado el profesor (Nombre, NOMBRE, Alumno...)
    const encabezados = Object.keys(filas[0]);
    const colNombre = encabezados.find((h) => ['nombre', 'alumno', 'nombre del alumno', 'nombre completo'].includes(normalizarEncabezado(h)));
    const colId = encabezados.find((h) => ['matricula', 'matrícula', 'correo', 'email', 'matricula/correo', 'matricula o correo'].includes(normalizarEncabezado(h)));

    if (!colNombre || !colId) {
      mostrarError('No encontré las columnas de Nombre y Matrícula/Correo. Revisa que la primera fila del Excel tenga esos encabezados.');
      e.target.value = '';
      return;
    }

    const matriculasYaEnLista = new Set(alumnosPendientes.map((a) => a.matricula.toLowerCase()));
    let agregados = 0;
    let omitidos = 0;

    filas.forEach((fila) => {
      const nombre = (fila[colNombre] || '').toString().trim();
      const idAlumno = (fila[colId] || '').toString().trim();
      if (!nombre || !idAlumno) { omitidos++; return; }

      const esCorreo = idAlumno.includes('@');
      const matricula = esCorreo ? idAlumno.split('@')[0] : idAlumno;

      if (matriculasYaEnLista.has(matricula.toLowerCase())) { omitidos++; return; }
      matriculasYaEnLista.add(matricula.toLowerCase());

      alumnosPendientes.push({ nombre, matricula, correo: esCorreo ? idAlumno : '' });
      agregados++;
    });

    renderTabla();
    mostrarOk(`Se importaron ${agregados} alumno(s) del Excel${omitidos > 0 ? ` (${omitidos} fila(s) se omitieron por estar incompletas o repetidas)` : ''}.`);
  } catch (err) {
    mostrarError(`No se pudo leer el archivo: ${err.message || err}`);
  } finally {
    e.target.value = '';
  }
});

function generarMatriculaAleatoria() {
  // 6 dígitos al azar (000000-999999) — con miles de alumnos en el sistema, la
  // probabilidad de choque es mínima, y si de casualidad ya existe, la validación
  // de nombre al guardar lo detecta y avisa en vez de mezclar alumnos.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

document.getElementById('btn-generar-matricula').addEventListener('click', () => {
  document.getElementById('student-id').value = generarMatriculaAleatoria();
});

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
        const detalle = fallidos.map((f) => `• ${f.matricula}: ${f.error}`).join('\n');
        mostrarError(`El grupo se creó, pero ${fallidos.length} alumno(s) no se pudieron dar de alta:\n${detalle}\n\nPuedes corregirlos y agregarlos después desde el grupo.`);
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 6000);
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