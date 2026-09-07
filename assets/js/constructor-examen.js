import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoIdParam = params.get('grupo_id');
const examenIdParam = params.get('examen_id');

let profesorActual = null;
let grupoId = grupoIdParam || null;
let examenId = examenIdParam || null; // null hasta que se guarda por primera vez
let estadoActual = 'borrador';
let linkToken = null;

// Cada pregunta en memoria: { tipo, texto, puntos, opciones: [{texto, es_correcta}], contenido_json }
let preguntas = [];
let editandoIndex = null; // índice de la pregunta que se está editando, o null si es nueva

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

function ocultarMensajes() {
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

const ETIQUETAS_TIPO = {
  opcion_multiple: 'Opción múltiple',
  verdadero_falso: 'Verdadero / Falso',
  relacionar: 'Relacionar columnas',
  completar: 'Completar',
};

// ---------- Render de la lista de preguntas ya agregadas ----------

function renderPreguntas() {
  const lista = document.getElementById('preguntas-lista');
  document.getElementById('contador-preguntas').textContent = preguntas.length;

  if (preguntas.length === 0) {
    lista.innerHTML = '<p class="text-on-surface-variant">Aún no agregas preguntas. Elige un tipo abajo para empezar.</p>';
    return;
  }

  lista.innerHTML = preguntas.map((p, i) => `
    <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 flex items-start justify-between gap-4">
      <div>
        <span class="inline-block bg-surface-container-high text-on-surface-variant text-sm px-3 py-1 rounded-full mb-2">${ETIQUETAS_TIPO[p.tipo]} · ${p.puntos} pts</span>
        <p class="font-body-md text-body-md text-on-surface">${escapeHtml(p.texto)}</p>
      </div>
      <div class="flex gap-1 shrink-0">
        <button class="btn-editar-pregunta text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full transition-colors" data-idx="${i}" aria-label="Editar">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="btn-eliminar-pregunta text-error hover:bg-error-container p-2 rounded-full transition-colors" data-idx="${i}" aria-label="Eliminar">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>`).join('');

  lista.querySelectorAll('.btn-eliminar-pregunta').forEach((btn) => {
    btn.addEventListener('click', () => {
      preguntas.splice(Number(btn.dataset.idx), 1);
      renderPreguntas();
    });
  });

  lista.querySelectorAll('.btn-editar-pregunta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      abrirPanel(preguntas[idx].tipo, preguntas[idx], idx);
    });
  });
}

// ---------- Panel de edición según tipo ----------

function inputBase() {
  return 'px-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface focus:border-primary focus:ring-2 focus:ring-primary-fixed outline-none font-body-md text-body-md text-on-surface transition-colors w-full';
}

function abrirPanel(tipo, existente = null, idx = null) {
  editandoIndex = idx;
  const panel = document.getElementById('panel-pregunta');
  panel.classList.remove('hidden');
  document.getElementById('selector-tipo').classList.add('hidden');

  const textoInicial = existente?.texto || '';
  const puntosInicial = existente?.puntos ?? 1;

  let camposEspecificos = '';

  if (tipo === 'opcion_multiple') {
    const opciones = existente?.opciones?.length ? existente.opciones : [{ texto: '', es_correcta: true }, { texto: '', es_correcta: false }];
    camposEspecificos = `
      <div id="lista-opciones" class="flex flex-col gap-2 mb-4">
        ${opciones.map((o, i) => filaOpcion(o, i)).join('')}
      </div>
      <button type="button" id="btn-add-opcion" class="text-primary font-label-lg text-label-lg hover:underline flex items-center gap-1">
        <span class="material-symbols-outlined text-lg">add</span> Agregar opción
      </button>`;
  } else if (tipo === 'verdadero_falso') {
    const correctaEsVerdadero = existente ? existente.opciones.find((o) => o.es_correcta)?.texto === 'Verdadero' : true;
    camposEspecificos = `
      <div class="flex gap-4 mb-4">
        <label class="flex items-center gap-2 font-body-md text-body-md">
          <input type="radio" name="vf-correcta" value="Verdadero" ${correctaEsVerdadero ? 'checked' : ''}/> Verdadero
        </label>
        <label class="flex items-center gap-2 font-body-md text-body-md">
          <input type="radio" name="vf-correcta" value="Falso" ${!correctaEsVerdadero ? 'checked' : ''}/> Falso
        </label>
      </div>`;
  } else if (tipo === 'relacionar') {
    const pares = existente?.contenido_json?.pares?.length ? existente.contenido_json.pares : [{ izquierda: '', derecha: '' }, { izquierda: '', derecha: '' }];
    camposEspecificos = `
      <div id="lista-pares" class="flex flex-col gap-2 mb-4">
        ${pares.map((par, i) => filaPar(par, i)).join('')}
      </div>
      <button type="button" id="btn-add-par" class="text-primary font-label-lg text-label-lg hover:underline flex items-center gap-1">
        <span class="material-symbols-outlined text-lg">add</span> Agregar par
      </button>`;
  } else if (tipo === 'completar') {
    const plantilla = existente?.contenido_json?.plantilla || '';
    const respuestas = existente?.contenido_json?.respuestas?.join(', ') || '';
    camposEspecificos = `
      <div class="flex flex-col mb-4">
        <label class="font-label-lg text-label-lg text-on-surface mb-2">Oración (usa ___ para cada espacio)</label>
        <textarea id="completar-plantilla" class="${inputBase()}" rows="3" placeholder="Ej: La capital de Francia es ___ y fue fundada en el año ___.">${escapeHtml(plantilla)}</textarea>
      </div>
      <div class="flex flex-col mb-4">
        <label class="font-label-lg text-label-lg text-on-surface mb-2">Respuestas correctas (separadas por coma, en el mismo orden que los ___)</label>
        <input id="completar-respuestas" class="${inputBase()}" placeholder="Ej: París, 508" type="text" value="${escapeHtml(respuestas)}"/>
      </div>`;
  }

  const SIMBOLOS = ['√', 'π', '÷', '×', '±', '≤', '≥', '≠', '∞', '°', 'Δ', 'Σ', '∫', '½', '¼', '¾', 'x²', 'x³', '∈', '∅'];
  const toolbarSimbolos = esMateriaMate ? `
    <div class="flex flex-wrap gap-1 mb-4 p-2 bg-surface-container-high rounded-DEFAULT">
      ${SIMBOLOS.map((s) => `<button type="button" class="btn-simbolo bg-surface hover:bg-primary-fixed border border-outline-variant rounded px-2 py-1 font-body-md text-body-md text-on-surface transition-colors" data-simbolo="${s}">${s}</button>`).join('')}
    </div>` : '';

  panel.innerHTML = `
    <h3 class="font-headline-md text-headline-md text-primary mb-stack-md">${existente ? 'Editar' : 'Nueva'} pregunta — ${ETIQUETAS_TIPO[tipo]}</h3>
    <div class="flex flex-col mb-4">
      <label class="font-label-lg text-label-lg text-on-surface mb-2">${tipo === 'relacionar' ? 'Instrucciones' : 'Pregunta'}</label>
      ${toolbarSimbolos}
      <textarea id="pregunta-texto" class="${inputBase()}" rows="2" placeholder="Escribe la pregunta">${escapeHtml(textoInicial)}</textarea>
    </div>
    <div class="flex flex-col mb-4 max-w-[160px]">
      <label class="font-label-lg text-label-lg text-on-surface mb-2">Puntos</label>
      <input id="pregunta-puntos" class="${inputBase()}" min="0" step="0.5" type="number" value="${puntosInicial}"/>
    </div>
    ${camposEspecificos}
    <div class="flex gap-4 mt-stack-md">
      <button type="button" id="btn-guardar-pregunta" class="bg-primary-container text-on-primary-container font-button-text text-button-text rounded-full py-3 px-8 hover:bg-primary hover:text-on-primary transition-colors">Guardar pregunta</button>
      <button type="button" id="btn-cancelar-pregunta" class="text-on-surface-variant font-button-text text-button-text py-3 px-8 hover:bg-surface-container-high rounded-full transition-colors">Cancelar</button>
    </div>`;

  if (esMateriaMate) {
    panel.querySelectorAll('.btn-simbolo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const textarea = document.getElementById('pregunta-texto');
        const inicio = textarea.selectionStart;
        const fin = textarea.selectionEnd;
        const simbolo = btn.dataset.simbolo;
        textarea.value = textarea.value.slice(0, inicio) + simbolo + textarea.value.slice(fin);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = inicio + simbolo.length;
      });
    });
  }

  panel.dataset.tipo = tipo;

  if (tipo === 'opcion_multiple') {
    document.getElementById('btn-add-opcion').addEventListener('click', () => {
      const cont = document.getElementById('lista-opciones');
      const i = cont.children.length;
      cont.insertAdjacentHTML('beforeend', filaOpcion({ texto: '', es_correcta: false }, i));
      wireFilaOpcion(cont.lastElementChild);
    });
    document.querySelectorAll('#lista-opciones .fila-opcion').forEach(wireFilaOpcion);
  }

  if (tipo === 'relacionar') {
    document.getElementById('btn-add-par').addEventListener('click', () => {
      const cont = document.getElementById('lista-pares');
      const i = cont.children.length;
      cont.insertAdjacentHTML('beforeend', filaPar({ izquierda: '', derecha: '' }, i));
      wireFilaPar(cont.lastElementChild);
    });
    document.querySelectorAll('#lista-pares .fila-par').forEach(wireFilaPar);
  }

  document.getElementById('btn-cancelar-pregunta').addEventListener('click', cerrarPanel);
  document.getElementById('btn-guardar-pregunta').addEventListener('click', () => guardarPreguntaDelPanel(tipo));

  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function filaOpcion(o, i) {
  return `
    <div class="fila-opcion flex items-center gap-2" data-i="${i}">
      <input type="radio" name="opcion-correcta" class="radio-correcta" ${o.es_correcta ? 'checked' : ''}/>
      <input type="text" class="input-texto-opcion ${inputBase()}" placeholder="Opción ${i + 1}" value="${escapeHtml(o.texto)}"/>
      <button type="button" class="btn-quitar-opcion text-error hover:bg-error-container p-2 rounded-full transition-colors" aria-label="Quitar">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>
    </div>`;
}

function wireFilaOpcion(fila) {
  fila.querySelector('.btn-quitar-opcion').addEventListener('click', () => {
    if (document.querySelectorAll('#lista-opciones .fila-opcion').length <= 2) {
      alert('Debe haber al menos 2 opciones');
      return;
    }
    fila.remove();
  });
}

function filaPar(par, i) {
  return `
    <div class="fila-par grid grid-cols-2 gap-2" data-i="${i}">
      <input type="text" class="input-izquierda ${inputBase()}" placeholder="Elemento" value="${escapeHtml(par.izquierda)}"/>
      <div class="flex items-center gap-2">
        <input type="text" class="input-derecha ${inputBase()}" placeholder="Corresponde con..." value="${escapeHtml(par.derecha)}"/>
        <button type="button" class="btn-quitar-par text-error hover:bg-error-container p-2 rounded-full transition-colors" aria-label="Quitar">
          <span class="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
    </div>`;
}

function wireFilaPar(fila) {
  fila.querySelector('.btn-quitar-par').addEventListener('click', () => {
    if (document.querySelectorAll('#lista-pares .fila-par').length <= 2) {
      alert('Debe haber al menos 2 pares');
      return;
    }
    fila.remove();
  });
}

function cerrarPanel() {
  const panel = document.getElementById('panel-pregunta');
  panel.classList.add('hidden');
  panel.innerHTML = '';
  document.getElementById('selector-tipo').classList.remove('hidden');
  editandoIndex = null;
}

function guardarPreguntaDelPanel(tipo) {
  const texto = document.getElementById('pregunta-texto').value.trim();
  const puntos = parseFloat(document.getElementById('pregunta-puntos').value) || 0;

  if (!texto) {
    alert('Escribe el texto de la pregunta');
    return;
  }

  let nuevaPregunta = { tipo, texto, puntos, opciones: [], contenido_json: null };

  if (tipo === 'opcion_multiple') {
    const filas = [...document.querySelectorAll('#lista-opciones .fila-opcion')];
    const opciones = filas.map((f) => ({
      texto: f.querySelector('.input-texto-opcion').value.trim(),
      es_correcta: f.querySelector('.radio-correcta').checked,
    }));
    if (opciones.some((o) => !o.texto)) {
      alert('Todas las opciones necesitan texto');
      return;
    }
    if (!opciones.some((o) => o.es_correcta)) {
      alert('Marca cuál opción es la correcta');
      return;
    }
    nuevaPregunta.opciones = opciones;
  } else if (tipo === 'verdadero_falso') {
    const correcta = document.querySelector('input[name="vf-correcta"]:checked')?.value || 'Verdadero';
    nuevaPregunta.opciones = [
      { texto: 'Verdadero', es_correcta: correcta === 'Verdadero' },
      { texto: 'Falso', es_correcta: correcta === 'Falso' },
    ];
  } else if (tipo === 'relacionar') {
    const filas = [...document.querySelectorAll('#lista-pares .fila-par')];
    const pares = filas.map((f) => ({
      izquierda: f.querySelector('.input-izquierda').value.trim(),
      derecha: f.querySelector('.input-derecha').value.trim(),
    }));
    if (pares.some((p) => !p.izquierda || !p.derecha)) {
      alert('Completa ambos lados de cada par');
      return;
    }
    nuevaPregunta.contenido_json = { pares };
  } else if (tipo === 'completar') {
    const plantilla = document.getElementById('completar-plantilla').value.trim();
    const respuestas = document.getElementById('completar-respuestas').value.split(',').map((s) => s.trim()).filter(Boolean);
    const numBlancos = (plantilla.match(/___/g) || []).length;
    if (numBlancos === 0) {
      alert('Usa ___ (tres guiones bajos) para marcar al menos un espacio en la oración');
      return;
    }
    if (respuestas.length !== numBlancos) {
      alert(`Escribiste ${numBlancos} espacio(s) (___) pero diste ${respuestas.length} respuesta(s). Deben coincidir.`);
      return;
    }
    nuevaPregunta.contenido_json = { plantilla, respuestas };
  }

  if (editandoIndex !== null) {
    preguntas[editandoIndex] = nuevaPregunta;
  } else {
    preguntas.push(nuevaPregunta);
  }

  cerrarPanel();
  renderPreguntas();
}

document.querySelectorAll('.btn-tipo-pregunta').forEach((btn) => {
  btn.addEventListener('click', () => abrirPanel(btn.dataset.tipo));
});

// ---------- Guardar examen completo en Supabase ----------

async function guardarExamen() {
  ocultarMensajes();
  const titulo = document.getElementById('titulo').value.trim();
  if (!titulo) {
    mostrarError('Ponle un título al examen');
    return;
  }
  if (preguntas.length === 0) {
    mostrarError('Agrega al menos una pregunta antes de guardar');
    return;
  }

  const btn = document.getElementById('btn-guardar-examen');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  try {
    const fechaApertura = document.getElementById('fecha-apertura').value || null;
    const fechaCierre = document.getElementById('fecha-cierre').value || null;
    const duracion = document.getElementById('duracion').value || null;
    const periodoId = document.getElementById('examen-periodo').value || null;

    const payloadExamen = {
      grupo_id: grupoId,
      titulo,
      fecha_apertura: fechaApertura,
      fecha_cierre: fechaCierre,
      duracion_min: duracion ? parseInt(duracion, 10) : null,
      periodo_id: periodoId,
    };

    if (examenId) {
      const { error } = await supabase.from('examenes').update(payloadExamen).eq('id', examenId);
      if (error) throw error;
      // Enfoque simple: al re-guardar, se borran las preguntas anteriores y se
      // insertan las actuales (evita tener que calcular diffs). Los intentos de
      // alumnos que ya hayan respondido no se tocan por este flujo.
      const { error: errorBorrar } = await supabase.from('preguntas').delete().eq('examen_id', examenId);
      if (errorBorrar) throw errorBorrar;
    } else {
      const { data: nuevoExamen, error } = await supabase.from('examenes').insert(payloadExamen).select().single();
      if (error) throw error;
      examenId = nuevoExamen.id;
      linkToken = nuevoExamen.link_token;
      estadoActual = nuevoExamen.estado;
    }

    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i];
      const { data: preguntaGuardada, error: errorPregunta } = await supabase
        .from('preguntas')
        .insert({
          examen_id: examenId,
          tipo: p.tipo,
          texto: p.texto,
          puntos: p.puntos,
          orden: i,
          contenido_json: p.contenido_json,
        })
        .select()
        .single();
      if (errorPregunta) throw errorPregunta;

      if (p.opciones && p.opciones.length > 0) {
        const filasOpciones = p.opciones.map((o, oi) => ({
          pregunta_id: preguntaGuardada.id,
          texto: o.texto,
          es_correcta: o.es_correcta,
          orden: oi,
        }));
        const { error: errorOpciones } = await supabase.from('opciones').insert(filasOpciones);
        if (errorOpciones) throw errorOpciones;
      }
    }

    mostrarOk('Examen guardado correctamente.');
    document.getElementById('btn-generar-link').disabled = false;

    if (!linkToken) {
      const { data: examenActual } = await supabase.from('examenes').select('link_token, estado').eq('id', examenId).single();
      linkToken = examenActual.link_token;
      estadoActual = examenActual.estado;
    }
    if (estadoActual === 'abierto') mostrarLink();
  } catch (err) {
    mostrarError(err.message || 'Ocurrió un error al guardar el examen');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function generarLink() {
  if (!examenId) return;
  const { error } = await supabase.from('examenes').update({ estado: 'abierto' }).eq('id', examenId);
  if (error) {
    mostrarError(`No se pudo abrir el examen: ${error.message}`);
    return;
  }
  estadoActual = 'abierto';
  mostrarLink();
  mostrarOk('¡Examen abierto! Comparte el link con tus alumnos.');
}

function mostrarLink() {
  // Usa la carpeta donde vive esta misma página (no solo el dominio), para que
  // funcione igual en localhost (raíz "/") que en GitHub Pages (que sirve el
  // repo bajo una subcarpeta, ej. "/easyteacher/").
  const carpetaActual = window.location.pathname.replace(/[^/]*$/, '');
  document.getElementById('link-examen').textContent = `${window.location.origin}${carpetaActual}examen.html?token=${linkToken}`;
  document.getElementById('seccion-link').classList.remove('hidden');
}

document.getElementById('btn-guardar-examen').addEventListener('click', guardarExamen);
document.getElementById('btn-generar-link').addEventListener('click', generarLink);

document.getElementById('btn-copiar-link').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('link-examen').textContent);
  mostrarOk('Link copiado');
});

// ---------- Carga inicial ----------

async function cargarExamenExistente() {
  const { data: examen, error } = await supabase.from('examenes').select('*').eq('id', examenId).single();
  if (error || !examen) {
    mostrarError('No se pudo cargar el examen (o no tienes permiso sobre él)');
    return;
  }

  grupoId = examen.grupo_id;
  estadoActual = examen.estado;
  linkToken = examen.link_token;

  document.getElementById('titulo').value = examen.titulo || '';
  if (examen.fecha_apertura) document.getElementById('fecha-apertura').value = examen.fecha_apertura.slice(0, 16);
  if (examen.fecha_cierre) document.getElementById('fecha-cierre').value = examen.fecha_cierre.slice(0, 16);
  if (examen.duracion_min) document.getElementById('duracion').value = examen.duracion_min;
  await cargarPeriodos(examen.periodo_id);

  document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;

  const { data: preguntasGuardadas, error: errorPreguntas } = await supabase
    .from('preguntas')
    .select('*, opciones(*)')
    .eq('examen_id', examenId)
    .order('orden', { ascending: true });

  if (errorPreguntas) {
    mostrarError('No se pudieron cargar las preguntas del examen');
    return;
  }

  preguntas = (preguntasGuardadas || []).map((p) => ({
    tipo: p.tipo,
    texto: p.texto,
    puntos: p.puntos,
    contenido_json: p.contenido_json,
    opciones: (p.opciones || []).sort((a, b) => a.orden - b.orden).map((o) => ({ texto: o.texto, es_correcta: o.es_correcta })),
  }));

  renderPreguntas();
  document.getElementById('btn-generar-link').disabled = false;
  if (estadoActual === 'abierto' || estadoActual === 'cerrado') mostrarLink();
}

let esMateriaMate = false;

async function detectarMateriaMate() {
  if (!grupoId) return;
  const { data } = await supabase.from('grupos').select('materia').eq('id', grupoId).maybeSingle();
  esMateriaMate = !!(data?.materia && /matem/i.test(data.materia));
}

async function cargarPeriodos(periodoSeleccionado = null) {
  if (!grupoId) return;
  const { data: periodos } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });

  if (!periodos || periodos.length === 0) return;

  const select = document.getElementById('examen-periodo');
  select.innerHTML = '<option value="">Sin periodo (todo el ciclo)</option>' +
    periodos.map((p) => `<option value="${p.id}" ${p.id === periodoSeleccionado ? 'selected' : ''}>${p.nombre.replace(/</g, '&lt;')}</option>`).join('');
  document.getElementById('campo-periodo').classList.remove('hidden');
}

async function init() {
  profesorActual = await requireProfesor();
  if (!profesorActual) return;

  if (examenId) {
    await cargarExamenExistente();
  } else if (grupoId) {
    document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
    renderPreguntas();
    await cargarPeriodos();
  } else {
    mostrarError('Falta el grupo o el examen en la URL');
  }

  await detectarMateriaMate();
}

init();