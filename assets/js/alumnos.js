import { supabase, SUPABASE_URL } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

let profesorActual = null;
let alumnos = []; // [{id, nombre, matricula}]
let terminoBusqueda = '';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = msg;
  box.style.whiteSpace = 'pre-line';
  box.classList.remove('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

function mostrarOk(msg) {
  const box = document.getElementById('ok-box');
  box.textContent = msg;
  box.classList.remove('hidden');
  document.getElementById('error-box').classList.add('hidden');
}

function renderTabla() {
  const tbody = document.getElementById('tabla-alumnos-body');

  if (alumnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Aún no hay alumnos en este grupo</td></tr>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Ningún alumno coincide con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = visibles.map((a, i) => `
    <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" data-alumno-id="${a.id}" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
      <td class="py-3 px-6">
        <div class="flex items-center gap-3">
          <span class="avatar-inicial">${escapeHtml((a.nombre || '?').trim().charAt(0).toUpperCase())}</span>
          <input type="text" class="input-nombre input-cpg flex-1 px-2 py-1 rounded border border-transparent hover:border-outline-variant outline-none bg-transparent" value="${escapeHtml(a.nombre)}"/>
        </div>
      </td>
      <td class="py-3 px-6">
        <input type="text" class="input-matricula input-cpg w-32 px-2 py-1 rounded border border-transparent hover:border-outline-variant outline-none bg-transparent" value="${escapeHtml(a.matricula || '')}"/>
      </td>
      <td class="py-3 px-6 text-right whitespace-nowrap">
        <button class="btn-guardar-alumno text-primary hover:bg-primary-fixed p-2 rounded-full transition-colors" aria-label="Guardar">
          <span class="material-symbols-outlined text-lg">save</span>
        </button>
        <button class="btn-quitar-alumno text-error hover:bg-error-container p-2 rounded-full transition-colors" aria-label="Quitar del grupo">
          <span class="material-symbols-outlined text-lg">person_remove</span>
        </button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('tr[data-alumno-id]').forEach((fila) => {
    const id = fila.dataset.alumnoId;

    fila.querySelector('.btn-guardar-alumno').addEventListener('click', async () => {
      const nombre = fila.querySelector('.input-nombre').value.trim();
      const matricula = fila.querySelector('.input-matricula').value.trim();

      if (!nombre) {
        mostrarError('El nombre no puede quedar vacío');
        return;
      }

      const { error } = await supabase.from('alumnos').update({ nombre, matricula }).eq('id', id);

      if (error) {
        mostrarError(`No se pudo guardar: ${error.message}`);
        return;
      }

      mostrarOk('Alumno actualizado.');
      await cargarAlumnos();
    });

    fila.querySelector('.btn-quitar-alumno').addEventListener('click', async () => {
      const confirmado = window.confirm('¿Quitar a este alumno de este grupo? Su cuenta y su historial en otros grupos no se borran, solo deja de pertenecer a este.');
      if (!confirmado) return;

      const { error } = await supabase.from('grupo_alumnos').delete().eq('grupo_id', grupoId).eq('alumno_id', id);

      if (error) {
        mostrarError(`No se pudo quitar: ${error.message}`);
        return;
      }

      mostrarOk('Alumno quitado del grupo.');
      await cargarAlumnos();
    });
  });
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderTabla();
});

async function cargarAlumnos() {
  const { data, error } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre, matricula)')
    .eq('grupo_id', grupoId);

  if (error) {
    mostrarError(`No se pudieron cargar los alumnos: ${error.message}`);
    return;
  }

  alumnos = (data || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
  renderTabla();
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

    const encabezados = Object.keys(filas[0]);
    const colNombre = encabezados.find((h) => ['nombre', 'alumno', 'nombre del alumno', 'nombre completo'].includes(normalizarEncabezado(h)));
    const colId = encabezados.find((h) => ['matricula', 'matrícula', 'correo', 'email', 'matricula/correo', 'matricula o correo'].includes(normalizarEncabezado(h)));

    if (!colNombre || !colId) {
      mostrarError('No encontré las columnas de Nombre y Matrícula/Correo. Revisa que la primera fila del Excel tenga esos encabezados.');
      e.target.value = '';
      return;
    }

    const payload = filas
      .map((fila) => {
        const nombre = (fila[colNombre] || '').toString().trim();
        const idAlumno = (fila[colId] || '').toString().trim();
        if (!nombre || !idAlumno) return null;
        const esCorreo = idAlumno.includes('@');
        return { nombre, matricula: esCorreo ? idAlumno.split('@')[0] : idAlumno, correo: esCorreo ? idAlumno : '' };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      mostrarError('No se encontraron filas completas (nombre + matrícula) para importar');
      e.target.value = '';
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crear-alumnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ grupo_id: grupoId, alumnos: payload }),
    });
    const resultado = await resp.json();
    if (!resp.ok) throw new Error(resultado.error || 'No se pudo importar la lista');

    const exitosos = (resultado.resultados || []).filter((r) => r.ok);
    const fallidos = (resultado.resultados || []).filter((r) => !r.ok);

    if (fallidos.length > 0) {
      console.warn('Alumnos que no se pudieron importar:', fallidos);
      const detalle = fallidos.map((f) => `• ${f.matricula}: ${f.error}`).join('\n');
      mostrarError(`Se importaron ${exitosos.length} de ${payload.length}. Estos no se pudieron agregar:\n${detalle}`);
    } else {
      mostrarOk(`Se importaron los ${exitosos.length} alumnos del Excel correctamente.`);
    }

    await cargarAlumnos();
  } catch (err) {
    mostrarError(err.message || 'No se pudo leer o importar el archivo');
  } finally {
    e.target.value = '';
  }
});

function generarMatriculaAleatoria() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

document.getElementById('btn-generar-matricula').addEventListener('click', () => {
  document.getElementById('nuevo-id').value = generarMatriculaAleatoria();
});

document.getElementById('btn-agregar-alumno').addEventListener('click', async () => {
  const nombre = document.getElementById('nuevo-nombre').value.trim();
  const idAlumno = document.getElementById('nuevo-id').value.trim();

  if (!nombre || !idAlumno) {
    mostrarError('Escribe el nombre y la matrícula o correo');
    return;
  }

  const esCorreo = idAlumno.includes('@');
  const payload = {
    nombre,
    matricula: esCorreo ? idAlumno.split('@')[0] : idAlumno,
    correo: esCorreo ? idAlumno : '',
  };

  const btn = document.getElementById('btn-agregar-alumno');
  btn.disabled = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/crear-alumnos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ grupo_id: grupoId, alumnos: [payload] }),
    });
    const resultado = await resp.json();
    if (!resp.ok) throw new Error(resultado.error || 'No se pudo agregar al alumno');

    const item = (resultado.resultados || [])[0];
    if (!item?.ok) throw new Error(item?.error || 'No se pudo agregar al alumno');

    document.getElementById('nuevo-nombre').value = '';
    document.getElementById('nuevo-id').value = '';
    mostrarOk(item.reutilizado ? 'Alumno existente inscrito en este grupo.' : 'Alumno creado e inscrito.');
    await cargarAlumnos();
  } catch (err) {
    mostrarError(err.message || 'Ocurrió un error al agregar al alumno');
  } finally {
    btn.disabled = false;
  }
});

async function init() {
  profesorActual = await requireProfesor();
  if (!profesorActual) return;

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
  if (tituloEl) tituloEl.textContent = `AulaFácil - Alumnos - ${grupo.nombre}`;

  await cargarAlumnos();
}

init();