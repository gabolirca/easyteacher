import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { MAX_PREGUNTAS, LETRAS } from './hoja-geometria.js';

// Examen en papel: el maestro aplica su examen impreso de siempre y aqui solo
// captura la CLAVE (cuantas preguntas, de que tipo, cual es la correcta y
// cuanto vale). Con eso salen las hojas de respuestas y se califican con foto.
//
// Se guarda como un examen normal con modo = 'papel': preguntas de opcion
// multiple (opciones "A", "B"...) o verdadero/falso. Asi resultados,
// recalificar y calificaciones finales funcionan igual que con los de linea.
//
// Al editar se actualiza en su lugar (por posicion), nunca se borra y se
// vuelve a crear: las respuestas ya guardadas apuntan al id de la opcion.

const params = new URLSearchParams(window.location.search);
let examenId = params.get('examen_id');
let grupoId = params.get('grupo_id');

const TIPOS = {
  'ab': { etiqueta: 'A–B', n: 2 },
  'abc': { etiqueta: 'A–C', n: 3 },
  'abcd': { etiqueta: 'A–D', n: 4 },
  'abcde': { etiqueta: 'A–E', n: 5 },
  'vf': { etiqueta: 'V / F', n: 2 },
};

let filas = [];          // [{tipo, correcta (indice), puntos}]
let existentes = [];     // preguntas guardadas, por orden, con sus opciones
let hayIntentos = false;

const $ = (id) => document.getElementById(id);

function mostrarError(msg) {
  $('error-box').textContent = msg;
  $('error-box').classList.remove('hidden');
  $('ok-box').classList.add('hidden');
}
function mostrarOk(msg) {
  $('ok-box').textContent = msg;
  $('ok-box').classList.remove('hidden');
  $('error-box').classList.add('hidden');
}

function etiquetasDe(tipo) {
  return tipo === 'vf' ? ['V', 'F'] : LETRAS.slice(0, TIPOS[tipo].n);
}

function render() {
  $('lista-clave').innerHTML = filas.map((f, i) => {
    const tipos = Object.entries(TIPOS).map(([v, t]) => `<option value="${v}" ${v === f.tipo ? 'selected' : ''}>${t.etiqueta}</option>`).join('');
    const letras = etiquetasDe(f.tipo).map((l, k) => {
      const sel = f.correcta === k;
      return `<button type="button" class="btn-correcta" data-i="${i}" data-k="${k}"
        style="width:36px;height:36px;border-radius:999px;font-weight:700;border:2px solid ${sel ? '#111' : '#bbb'};${sel ? 'background:#111;color:#fff' : ''}">${l}</button>`;
    }).join('');
    return `<div class="flex items-center gap-3 py-2 border-b border-outline-variant flex-wrap">
      <span class="w-8 text-right font-label-lg">${i + 1}</span>
      <select class="sel-tipo px-2 py-1 rounded-DEFAULT border border-outline-variant bg-surface" data-i="${i}">${tipos}</select>
      <div class="flex gap-2">${letras}</div>
      <label class="text-sm text-on-surface-variant flex items-center gap-1 ml-auto">vale
        <input type="number" min="0" step="0.5" class="inp-puntos w-16 px-2 py-1 rounded-DEFAULT border border-outline-variant" data-i="${i}" value="${f.puntos}"></label>
    </div>`;
  }).join('') || '<p class="text-on-surface-variant py-3">Agrega las preguntas del examen.</p>';

  $('lista-clave').querySelectorAll('.btn-correcta').forEach((b) => b.addEventListener('click', () => {
    filas[Number(b.dataset.i)].correcta = Number(b.dataset.k);
    render();
  }));
  $('lista-clave').querySelectorAll('.sel-tipo').forEach((s) => s.addEventListener('change', () => {
    const f = filas[Number(s.dataset.i)];
    f.tipo = s.value;
    if (f.correcta !== null && f.correcta >= TIPOS[f.tipo].n) f.correcta = null;
    render();
  }));
  $('lista-clave').querySelectorAll('.inp-puntos').forEach((inp) => inp.addEventListener('input', () => {
    filas[Number(inp.dataset.i)].puntos = inp.value;
  }));

  const sinClave = filas.filter((f) => f.correcta === null).length;
  $('contador').textContent = `${filas.length} pregunta(s)` + (sinClave ? ` · ${sinClave} sin respuesta correcta` : '');
}

function agregar(n) {
  const tipo = $('tipo-defecto').value;
  for (let k = 0; k < n && filas.length < MAX_PREGUNTAS; k++) filas.push({ tipo, correcta: null, puntos: 1 });
  render();
}

$('btn-agregar-1').addEventListener('click', () => agregar(1));
$('btn-agregar-5').addEventListener('click', () => agregar(5));
$('btn-quitar').addEventListener('click', () => { filas.pop(); render(); });
$('btn-guardar').addEventListener('click', guardar);

async function guardar() {
  const titulo = $('titulo').value.trim();
  if (!titulo) { mostrarError('Ponle un título al examen.'); return; }
  if (!filas.length) { mostrarError('Agrega al menos una pregunta.'); return; }
  const sinClave = filas.findIndex((f) => f.correcta === null);
  if (sinClave >= 0) { mostrarError(`Falta marcar la respuesta correcta de la pregunta ${sinClave + 1}.`); return; }
  if (filas.some((f) => !(Number(f.puntos) > 0))) { mostrarError('Cada pregunta debe valer más de 0 puntos.'); return; }

  if (hayIntentos && existentes.length > filas.length) {
    if (!window.confirm(`Quitaste preguntas de un examen que ya tiene hojas calificadas. Lo que esos alumnos marcaron en las preguntas ${filas.length + 1} a ${existentes.length} se borra.\n\n¿Guardar de todos modos?`)) return;
  }

  const btn = $('btn-guardar');
  btn.disabled = true;
  try {
    const payload = { grupo_id: grupoId, titulo, periodo_id: $('periodo').value || null, modo: 'papel' };
    if (examenId) {
      const { error } = await supabase.from('examenes').update(payload).eq('id', examenId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('examenes').insert(payload).select('id').single();
      if (error) throw error;
      examenId = data.id;
      history.replaceState(null, '', `examen-papel.html?examen_id=${examenId}`);
    }

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      const tipoBd = f.tipo === 'vf' ? 'verdadero_falso' : 'opcion_multiple';
      const fila = { examen_id: examenId, tipo: tipoBd, texto: `Pregunta ${i + 1}`, puntos: Number(f.puntos), orden: i };
      let pregunta = existentes[i];
      if (pregunta) {
        const { error } = await supabase.from('preguntas').update(fila).eq('id', pregunta.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('preguntas').insert(fila).select('id').single();
        if (error) throw error;
        pregunta = { id: data.id, opciones: [] };
      }

      const textos = f.tipo === 'vf' ? ['Verdadero', 'Falso'] : LETRAS.slice(0, TIPOS[f.tipo].n);
      const viejas = [...(pregunta.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      for (let k = 0; k < textos.length; k++) {
        const op = { pregunta_id: pregunta.id, texto: textos[k], es_correcta: k === f.correcta, orden: k };
        if (viejas[k]) {
          const { error } = await supabase.from('opciones').update(op).eq('id', viejas[k].id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('opciones').insert(op);
          if (error) throw error;
        }
      }
      const sobran = viejas.slice(textos.length).map((o) => o.id);
      if (sobran.length) {
        const { error } = await supabase.from('opciones').delete().in('id', sobran);
        if (error) throw error;
      }
    }

    const quitar = existentes.slice(filas.length).map((p) => p.id);
    if (quitar.length) {
      const { error } = await supabase.from('preguntas').delete().in('id', quitar);
      if (error) throw error;
    }

    await cargarExistentes();
    $('acciones-guardado').style.display = '';
    mostrarOk(hayIntentos
      ? 'Clave guardada. Si cambiaste respuestas correctas, usa "Recalificar" en los resultados para aplicarlo a las hojas ya calificadas.'
      : 'Clave guardada. Ya puedes imprimir las hojas de respuestas.');
  } catch (e) {
    mostrarError(`No se pudo guardar: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function cargarExistentes() {
  const { data } = await supabase.from('preguntas')
    .select('id, tipo, puntos, orden, opciones(id, texto, orden, es_correcta)')
    .eq('examen_id', examenId).order('orden', { ascending: true });
  existentes = data || [];
  const { count } = await supabase.from('intentos').select('id', { count: 'exact', head: true }).eq('examen_id', examenId);
  hayIntentos = (count || 0) > 0;
  $('link-hojas').href = `hoja-respuestas.html?examen_id=${examenId}`;
  $('link-calificar').href = `calificar-hojas.html?examen_id=${examenId}`;
  $('link-resultados').href = `resultados-examen.html?examen_id=${examenId}`;
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (examenId) {
    const { data: ex, error } = await supabase.from('examenes')
      .select('id, titulo, grupo_id, periodo_id, modo').eq('id', examenId).maybeSingle();
    if (error || !ex) { mostrarError('No se pudo cargar el examen.'); return; }
    if (ex.modo !== 'papel') { window.location.replace(`constructor-examen.html?examen_id=${examenId}`); return; }
    grupoId = ex.grupo_id;
    $('titulo').value = ex.titulo;
    await cargarExistentes();
    filas = existentes.map((p) => {
      const ops = [...(p.opciones || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const tipo = p.tipo === 'verdadero_falso' ? 'vf' : (['ab', 'abc', 'abcd', 'abcde'][Math.min(5, Math.max(2, ops.length)) - 2]);
      const correcta = ops.findIndex((o) => o.es_correcta);
      return { tipo, correcta: correcta >= 0 ? correcta : null, puntos: p.puntos };
    });
    $('acciones-guardado').style.display = '';
    await cargarPeriodos(ex.periodo_id);
  } else {
    if (!grupoId) { mostrarError('Falta el grupo en la dirección.'); return; }
    await cargarPeriodos(null);
  }

  const { data: grupo } = await supabase.from('grupos').select('nombre').eq('id', grupoId).maybeSingle();
  $('grupo-nombre').textContent = grupo?.nombre || '';
  $('link-volver').href = `grupo.html?id=${grupoId}`;
  render();
}

async function cargarPeriodos(seleccionado) {
  const { data } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });
  if (!data?.length) return;
  $('periodo').innerHTML = '<option value="">Sin periodo</option>' +
    data.map((p) => `<option value="${p.id}" ${p.id === seleccionado ? 'selected' : ''}>${p.nombre.replace(/</g, '&lt;')}</option>`).join('');
  $('campo-periodo').style.display = '';
}

init();
