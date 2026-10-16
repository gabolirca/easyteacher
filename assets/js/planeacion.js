import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

// Planeacion: un texto libre por grupo, para todo el ciclo o por periodo.
// Se guarda solo unos segundos despues de dejar de escribir, y tambien con
// el boton. Si se intenta salir con cambios sin guardar, el navegador avisa.

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');
const CICLO = '__ciclo__';
const ESPERA_MS = 2000;

let periodos = [];
let guardadas = {};      // { periodo_id|CICLO: {texto, updated_at} }
let actual = CICLO;
let sinGuardar = false;
let temporizador = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarError(msg) {
  $('error-box').textContent = msg;
  $('error-box').classList.remove('hidden');
}

function fechaCorta(f) {
  return f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
}

function estado(texto) {
  $('estado-guardado').textContent = texto;
}

function nombreDe(clave) {
  if (clave === CICLO) return 'Todo el ciclo';
  return periodos.find((p) => p.id === clave)?.nombre || '';
}

function llenarSelector() {
  const opcion = (clave, texto) => {
    const tiene = (guardadas[clave]?.texto || '').trim() ? ' ✓' : '';
    return `<option value="${clave}" ${clave === actual ? 'selected' : ''}>${escapeHtml(texto)}${tiene}</option>`;
  };
  $('para-cuando').innerHTML = opcion(CICLO, 'Todo el ciclo') + periodos.map((p) => {
    const fechas = p.fecha_inicio && p.fecha_fin ? ` (${fechaCorta(p.fecha_inicio)} – ${fechaCorta(p.fecha_fin)})` : '';
    return opcion(p.id, `${p.nombre}${fechas}`);
  }).join('');
}

function mostrarTexto() {
  const g = guardadas[actual];
  $('texto').value = g?.texto || '';
  $('titulo-impresion').textContent = `Planeación · ${$('grupo-nombre').textContent} · ${nombreDe(actual)}`;
  estado(g?.updated_at
    ? `Guardado el ${new Date(g.updated_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
    : 'Todavía no hay nada escrito.');
  sinGuardar = false;
}

async function guardar() {
  clearTimeout(temporizador);
  if (!sinGuardar) return true;
  const texto = $('texto').value;
  const clave = actual;
  estado('Guardando…');
  const { data, error } = await supabase.from('planeaciones')
    .upsert({ grupo_id: grupoId, periodo_id: clave === CICLO ? null : clave, texto, updated_at: new Date().toISOString() },
      { onConflict: 'grupo_id,periodo_id' })
    .select('texto, updated_at').single();
  if (error) {
    estado('No se pudo guardar');
    mostrarError(`No se pudo guardar: ${error.message}`);
    return false;
  }
  guardadas[clave] = data;
  if (clave === actual && $('texto').value === texto) {
    sinGuardar = false;
    estado(`Guardado a las ${new Date(data.updated_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`);
  }
  llenarSelector();
  return true;
}

$('texto').addEventListener('input', () => {
  sinGuardar = true;
  estado('Cambios sin guardar…');
  clearTimeout(temporizador);
  temporizador = setTimeout(guardar, ESPERA_MS);
});

$('para-cuando').addEventListener('change', async (e) => {
  const nueva = e.target.value;
  if (!(await guardar())) { e.target.value = actual; return; }
  actual = nueva;
  mostrarTexto();
});

$('btn-guardar').addEventListener('click', () => { sinGuardar = true; guardar(); });
$('btn-imprimir').addEventListener('click', async () => {
  await guardar();
  $('texto-impresion').textContent = $('texto').value;
  window.print();
});

window.addEventListener('beforeunload', (e) => {
  if (sinGuardar) { e.preventDefault(); e.returnValue = ''; }
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;
  if (!grupoId) { mostrarError('Falta el id del grupo en la URL'); return; }

  const { data: grupo, error } = await supabase.from('grupos').select('id, nombre').eq('id', grupoId).maybeSingle();
  if (error || !grupo) { mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)'); return; }
  $('grupo-nombre').textContent = grupo.nombre;
  $('link-volver').href = `grupo.html?id=${grupoId}`;
  const tituloEl = $('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Planeación - ${grupo.nombre}`;

  const [{ data: ps }, { data: planes, error: errPlanes }] = await Promise.all([
    supabase.from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('grupo_id', grupoId).order('orden', { ascending: true }),
    supabase.from('planeaciones').select('periodo_id, texto, updated_at').eq('grupo_id', grupoId),
  ]);
  if (errPlanes) { mostrarError(`No se pudo cargar la planeación: ${errPlanes.message}`); return; }
  periodos = ps || [];
  guardadas = {};
  (planes || []).forEach((p) => { guardadas[p.periodo_id || CICLO] = p; });

  // Arranca en el periodo de hoy si ya tiene planeacion; si no, en el ciclo.
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const deHoy = periodos.find((p) => p.fecha_inicio && p.fecha_fin && p.fecha_inicio <= hoy && hoy <= p.fecha_fin);
  actual = deHoy && guardadas[deHoy.id] ? deHoy.id : CICLO;

  llenarSelector();
  mostrarTexto();
  $('editor').style.display = '';
}

init();
