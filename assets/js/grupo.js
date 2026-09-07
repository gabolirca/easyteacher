import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

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

function badgeEstado(estado) {
  const estilos = {
    borrador: 'bg-surface-container-high text-on-surface-variant',
    abierto: 'bg-secondary-container text-on-secondary-container',
    cerrado: 'bg-error-container text-on-error-container',
  };
  const etiquetas = { borrador: 'Borrador', abierto: 'Abierto', cerrado: 'Cerrado' };
  return `<span class="px-3 py-1 rounded-full text-sm font-label-lg ${estilos[estado] || ''}">${etiquetas[estado] || estado}</span>`;
}

let gruposDelProfesor = [];

async function cargarGruposDelProfesor() {
  const { data } = await supabase.from('grupos').select('id, nombre').eq('archivado', false).order('nombre');
  gruposDelProfesor = data || [];
}

async function cargarExamenes() {
  const contenedor = document.getElementById('examenes-container');

  const { data: examenes, error } = await supabase
    .from('examenes')
    .select('id, titulo, estado, link_token, created_at, periodos(nombre)')
    .eq('grupo_id', grupoId)
    .eq('archivado', false)
    .order('created_at', { ascending: false });

  if (error) {
    contenedor.innerHTML = `<p class="text-error">No se pudieron cargar los exámenes: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!examenes || examenes.length === 0) {
    contenedor.innerHTML = '<p class="text-on-surface-variant">Aún no hay exámenes en este grupo. Da clic en "+ Nuevo examen" para crear el primero.</p>';
    return;
  }

  const opcionesGrupos = gruposDelProfesor.map((g) => `<option value="${g.id}" ${g.id === grupoId ? 'selected' : ''}>${escapeHtml(g.nombre)}${g.id === grupoId ? ' (este grupo)' : ''}</option>`).join('');

  contenedor.innerHTML = examenes.map((ex, i) => `
    <div class="card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-6" style="animation: popIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.08}s both;">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">${escapeHtml(ex.titulo)}</h3>
          <div class="mt-2 flex items-center gap-2">${badgeEstado(ex.estado)}${ex.periodos?.nombre ? `<span class="text-sm text-on-surface-variant">· ${escapeHtml(ex.periodos.nombre)}</span>` : ''}</div>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn-archivar-examen text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors" data-examen-id="${ex.id}" aria-label="Archivar">
            <span class="material-symbols-outlined">archive</span>
          </button>
          <button class="btn-duplicar-examen text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors" data-examen-id="${ex.id}" aria-label="Duplicar">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
          <a class="btn-ver-resultados text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors" href="resultados-examen.html?examen_id=${ex.id}" aria-label="Ver resultados">
            <span class="material-symbols-outlined">assessment</span>
          </a>
          <button class="btn-borrar-examen text-error hover:bg-error-container p-2 rounded-full transition-colors" data-examen-id="${ex.id}" data-titulo="${escapeHtml(ex.titulo)}" aria-label="Borrar">
            <span class="material-symbols-outlined">delete_forever</span>
          </button>
          <a class="border-2 border-primary text-primary font-button-text text-button-text py-2 px-6 rounded-full hover:bg-primary hover:text-on-primary transition-colors" href="constructor-examen.html?examen_id=${ex.id}">
            Editar
          </a>
        </div>
      </div>
      <div class="panel-duplicar hidden mt-4 pt-4 border-t border-outline-variant flex flex-col sm:flex-row gap-3 items-stretch sm:items-center" data-examen-id="${ex.id}">
        <label class="font-label-lg text-label-lg text-on-surface">Copiar a:</label>
        <select class="select-grupo-destino flex-1 border border-outline-variant rounded-DEFAULT p-2" data-examen-id="${ex.id}">
          ${opcionesGrupos}
        </select>
        <button class="btn-confirmar-duplicar bg-primary-container text-on-primary-container font-button-text text-button-text rounded-full py-2 px-6 hover:bg-primary hover:text-on-primary transition-colors" data-examen-id="${ex.id}" data-titulo="${escapeHtml(ex.titulo)}">
          Duplicar
        </button>
      </div>
    </div>`).join('');
}

async function duplicarExamen(examenId, grupoDestinoId, tituloOriginal) {
  const { data: preguntasOriginales, error: errorPreguntas } = await supabase
    .from('preguntas')
    .select('*, opciones(*)')
    .eq('examen_id', examenId)
    .order('orden', { ascending: true });

  if (errorPreguntas) throw errorPreguntas;

  const { data: nuevoExamen, error: errorExamen } = await supabase
    .from('examenes')
    .insert({ grupo_id: grupoDestinoId, titulo: `${tituloOriginal} (copia)` })
    .select()
    .single();

  if (errorExamen) throw errorExamen;

  for (const p of preguntasOriginales || []) {
    const { data: nuevaPregunta, error: errorPregunta } = await supabase
      .from('preguntas')
      .insert({
        examen_id: nuevoExamen.id,
        tipo: p.tipo,
        texto: p.texto,
        imagen_url: p.imagen_url,
        contenido_json: p.contenido_json,
        puntos: p.puntos,
        orden: p.orden,
      })
      .select()
      .single();

    if (errorPregunta) throw errorPregunta;

    if (p.opciones && p.opciones.length > 0) {
      const filasOpciones = p.opciones.map((o) => ({
        pregunta_id: nuevaPregunta.id,
        texto: o.texto,
        es_correcta: o.es_correcta,
        orden: o.orden,
      }));
      const { error: errorOpciones } = await supabase.from('opciones').insert(filasOpciones);
      if (errorOpciones) throw errorOpciones;
    }
  }

  return nuevoExamen;
}

document.getElementById('examenes-container').addEventListener('click', async (e) => {
  const btnArchivar = e.target.closest('.btn-archivar-examen');
  if (btnArchivar) {
    const id = btnArchivar.dataset.examenId;
    const confirmado = window.confirm('¿Archivar este examen? Ya no aparecerá en la lista, pero sus datos (calificaciones, respuestas) se conservan.');
    if (!confirmado) return;
    const { error } = await supabase.from('examenes').update({ archivado: true }).eq('id', id);
    if (error) {
      alert(`No se pudo archivar: ${error.message}`);
      return;
    }
    await cargarExamenes();
    return;
  }

  const btnBorrar = e.target.closest('.btn-borrar-examen');
  if (btnBorrar) {
    const id = btnBorrar.dataset.examenId;
    const titulo = btnBorrar.dataset.titulo;
    const confirmado = window.confirm(`¿Borrar el examen "${titulo}"? Esta acción no se puede deshacer.`);
    if (!confirmado) return;
    const { error } = await supabase.from('examenes').delete().eq('id', id);
    if (error) {
      alert(`No se pudo borrar: ${error.message}`);
      return;
    }
    await cargarExamenes();
    return;
  }

  const btnDuplicar = e.target.closest('.btn-duplicar-examen');
  if (btnDuplicar) {
    const id = btnDuplicar.dataset.examenId;
    document.querySelectorAll('.panel-duplicar').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.examenId !== id);
    });
    return;
  }

  const btnConfirmar = e.target.closest('.btn-confirmar-duplicar');
  if (btnConfirmar) {
    const examenId = btnConfirmar.dataset.examenId;
    const titulo = btnConfirmar.dataset.titulo;
    const select = document.querySelector(`.select-grupo-destino[data-examen-id="${examenId}"]`);
    const grupoDestinoId = select.value;

    btnConfirmar.disabled = true;
    const textoOriginal = btnConfirmar.textContent;
    btnConfirmar.textContent = 'Duplicando...';

    try {
      const nuevoExamen = await duplicarExamen(examenId, grupoDestinoId, titulo);
      if (grupoDestinoId === grupoId) {
        await cargarExamenes();
      } else {
        const grupoDestino = gruposDelProfesor.find((g) => g.id === grupoDestinoId);
        alert(`Examen duplicado en "${grupoDestino?.nombre || 'el otro grupo'}" como borrador.`);
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = textoOriginal;
        document.querySelector(`.panel-duplicar[data-examen-id="${examenId}"]`)?.classList.add('hidden');
      }
    } catch (err) {
      alert(`No se pudo duplicar: ${err.message}`);
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = textoOriginal;
    }
  }
});

document.getElementById('btn-toggle-archivados').addEventListener('click', async () => {
  const cont = document.getElementById('examenes-archivados-container');
  const oculto = cont.classList.contains('hidden');

  if (oculto) {
    await cargarExamenesArchivados();
    cont.classList.remove('hidden');
    cont.classList.add('flex');
    document.getElementById('btn-toggle-archivados').innerHTML = '<span class="material-symbols-outlined text-lg">unarchive</span> Ocultar archivados';
  } else {
    cont.classList.add('hidden');
    cont.classList.remove('flex');
    document.getElementById('btn-toggle-archivados').innerHTML = '<span class="material-symbols-outlined text-lg">archive</span> Ver archivados';
  }
});

async function cargarExamenesArchivados() {
  const cont = document.getElementById('examenes-archivados-container');
  cont.innerHTML = '<p class="text-on-surface-variant">Cargando...</p>';

  const { data: examenes, error } = await supabase
    .from('examenes')
    .select('id, titulo, estado, created_at')
    .eq('grupo_id', grupoId)
    .eq('archivado', true)
    .order('created_at', { ascending: false });

  if (error) {
    cont.innerHTML = `<p class="text-error">No se pudieron cargar los archivados: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!examenes || examenes.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">No hay exámenes archivados en este grupo.</p>';
    return;
  }

  cont.innerHTML = examenes.map((ex) => `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 flex items-center justify-between gap-4 opacity-80">
      <div>
        <h3 class="font-body-lg text-body-lg text-on-surface">${escapeHtml(ex.titulo)}</h3>
        <div class="mt-1">${badgeEstado(ex.estado)}</div>
      </div>
      <button class="btn-restaurar-examen border-2 border-primary text-primary font-button-text text-button-text py-2 px-6 rounded-full hover:bg-primary hover:text-on-primary transition-colors" data-examen-id="${ex.id}">
        Restaurar
      </button>
    </div>`).join('');

  cont.querySelectorAll('.btn-restaurar-examen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error: errorRestaurar } = await supabase.from('examenes').update({ archivado: false }).eq('id', btn.dataset.examenId);
      if (errorRestaurar) {
        alert(`No se pudo restaurar: ${errorRestaurar.message}`);
        return;
      }
      await cargarExamenesArchivados();
      await cargarExamenes();
    });
  });
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!grupoId) {
    mostrarError('Falta el id del grupo en la URL');
    return;
  }

  const { data: grupo, error } = await supabase
    .from('grupos')
    .select('id, nombre, materia')
    .eq('id', grupoId)
    .maybeSingle();

  if (error || !grupo) {
    mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)');
    return;
  }

  document.getElementById('grupo-nombre').textContent = grupo.nombre;
  document.getElementById('grupo-materia').textContent = grupo.materia || '';
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${grupo.nombre}`;
  document.getElementById('tab-asistencia')?.setAttribute('href', `asistencia.html?id=${grupoId}`);
  document.getElementById('tab-tareas')?.setAttribute('href', `tareas.html?id=${grupoId}`);
  document.getElementById('tab-participacion')?.setAttribute('href', `participacion.html?id=${grupoId}`);
  document.getElementById('tab-calificaciones')?.setAttribute('href', `calificaciones.html?id=${grupoId}`);
  document.getElementById('tab-alumnos')?.setAttribute('href', `alumnos.html?id=${grupoId}`);
  document.getElementById('tab-rubros')?.setAttribute('href', `rubros.html?id=${grupoId}`);
  document.getElementById('tab-periodos')?.setAttribute('href', `periodos.html?id=${grupoId}`);

  await cargarGruposDelProfesor();
  await cargarExamenes();
}

document.getElementById('btn-nuevo-examen').addEventListener('click', () => {
  window.location.href = `constructor-examen.html?grupo_id=${grupoId}`;
});

init();