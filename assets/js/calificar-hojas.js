import { supabase, SUPABASE_URL } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { leerHoja, aRGBA, PX_MM } from './omr.js';
import { burbujasDePregunta, centroBurbuja, leerTextoQr, RETICULA } from './hoja-geometria.js';

// Calificar hojas de respuestas con la camara.
//
// Flujo por hoja: foto -> lectura en el telefono -> el maestro revisa (sobre
// todo lo marcado como dudoso) -> se guarda en el servidor, que es quien
// califica. La foto no se sube: solo viaja que burbuja eligio el alumno.

const params = new URLSearchParams(window.location.search);
const examenId = params.get('examen_id');
const LADO_MAX = 2000; // px; mas no mejora la lectura y si la hace lenta

let examen = null;
let preguntas = [];      // con opciones ordenadas y su lista de burbujas
let alumnos = [];        // [{id, nombre}]
let intentoPorAlumno = {};
let cola = [];           // archivos pendientes de leer
let actual = null;       // { lectura, alumnoId, eleccion: {i: k|null}, manual: {i: n} }

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

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

function ocultarAvisos() {
  $('error-box').classList.add('hidden');
  $('ok-box').classList.add('hidden');
}

const mostrar = (id, si) => { $(id).style.display = si ? '' : 'none'; };

// ---------- lectura del QR ----------
// BarcodeDetector cuando el navegador lo trae (Chrome en Android); si no
// (Safari, iPad), jsQR, que se carga como script clasico en la pagina.
let detector = null;
if ('BarcodeDetector' in window) {
  try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
}
async function leerQr(rgba) {
  if (detector) {
    try {
      const datos = new ImageData(rgba.data, rgba.width, rgba.height);
      const r = await detector.detect(datos);
      if (r.length) return r[0].rawValue;
    } catch { /* cae a jsQR */ }
  }
  if (window.jsQR) {
    const r = window.jsQR(rgba.data, rgba.width, rgba.height, { inversionAttempts: 'dontInvert' });
    if (r) return r.data;
  }
  return null;
}

// ---------- carga ----------

async function cargarIntentos() {
  const { data } = await supabase.from('intentos')
    .select('alumno_id, origen, estado, calificacion').eq('examen_id', examenId);
  intentoPorAlumno = {};
  (data || []).forEach((i) => { intentoPorAlumno[i.alumno_id] = i; });
  renderPendientes();
}

function renderPendientes() {
  const hechos = alumnos.filter((a) => intentoPorAlumno[a.id]?.estado === 'entregado');
  $('contador').textContent = `${hechos.length} de ${alumnos.length} alumnos con calificación`;
  $('lista-alumnos').innerHTML = alumnos.map((a) => {
    const it = intentoPorAlumno[a.id];
    let etiqueta = '<span class="text-on-surface-variant">Pendiente</span>';
    if (it?.estado === 'entregado') {
      const cal = (Number(it.calificacion) / 10).toFixed(1);
      etiqueta = `<span class="font-label-lg text-on-surface">${cal}</span> <span class="text-xs text-on-surface-variant">${it.origen === 'hoja' ? 'hoja' : 'en línea'}</span>`;
    }
    return `<div class="flex justify-between gap-3 py-2 border-b border-outline-variant"><span>${escapeHtml(a.nombre)}</span><span>${etiqueta}</span></div>`;
  }).join('');
}

// ---------- foto -> lectura ----------

async function imagenDeArchivo(archivo) {
  // imageOrientation respeta la rotacion que guarda la camara en la foto.
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const esc = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * esc);
  lienzo.height = Math.round(bmp.height * esc);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  bmp.close?.();
  return ctx.getImageData(0, 0, lienzo.width, lienzo.height);
}

async function procesarSiguiente() {
  if (actual || !cola.length) return;
  const archivo = cola.shift();
  ocultarAvisos();
  mostrar('panel-revision', false);
  mostrar('leyendo', true);
  $('leyendo-texto').textContent = cola.length ? `Leyendo hoja… (quedan ${cola.length} más)` : 'Leyendo hoja…';
  try {
    const img = await imagenDeArchivo(archivo);
    const lectura = await leerHoja(img, preguntas.map((p) => p.burbujas.length), leerQr);
    mostrar('leyendo', false);
    if (!lectura.ok) {
      mostrarError(lectura.error);
      procesarSiguiente();
      return;
    }
    abrirRevision(lectura);
  } catch (e) {
    mostrar('leyendo', false);
    mostrarError(`No se pudo leer la foto: ${e.message}`);
    procesarSiguiente();
  }
}

// ---------- revision ----------

function abrirRevision(lectura) {
  const qr = leerTextoQr(lectura.qr);
  let aviso = '';
  let alumnoId = '';
  if (!lectura.qr) {
    aviso = 'No pude leer el código QR. Elige al alumno.';
  } else if (!qr) {
    aviso = 'El código de esta hoja no es de AulaFácil. Elige al alumno.';
  } else if (qr.examenId !== examen.id) {
    aviso = 'Esta hoja es de OTRO examen. Revisa que sea la correcta antes de guardar.';
  } else if (qr.alumnoId && alumnos.some((a) => a.id === qr.alumnoId)) {
    alumnoId = qr.alumnoId;
  } else if (!qr.alumnoId) {
    aviso = 'Hoja sin nombre: elige a qué alumno pertenece.';
  } else {
    aviso = 'El alumno de esta hoja ya no está en el grupo. Elige al alumno.';
  }

  actual = { lectura, alumnoId, eleccion: {}, manual: {} };
  lectura.respuestas.forEach((r, i) => {
    if (r.estado === 'mano') actual.manual[i] = '';
    else actual.eleccion[i] = r.estado === 'doble' || r.estado === 'vacia' ? null : r.elegida;
  });

  $('select-alumno').innerHTML = '<option value="">— Elige al alumno —</option>' + alumnos.map((a) =>
    `<option value="${a.id}" ${a.id === alumnoId ? 'selected' : ''}>${escapeHtml(a.nombre)}${intentoPorAlumno[a.id]?.estado === 'entregado' ? ' (ya calificado)' : ''}</option>`).join('');
  $('aviso-alumno').textContent = aviso;
  mostrar('aviso-alumno', !!aviso);

  const dudosas = lectura.respuestas.filter((r) => r.estado === 'dudosa' || r.estado === 'doble').length;
  const vacias = lectura.respuestas.filter((r) => r.estado === 'vacia').length;
  const mano = lectura.respuestas.filter((r) => r.estado === 'mano').length;
  const partes = [];
  if (dudosas) partes.push(`<b>${dudosas}</b> para revisar (resaltadas)`);
  if (vacias) partes.push(`${vacias} en blanco`);
  if (mano) partes.push(`${mano} para calificar a mano`);
  $('resumen-lectura').innerHTML = partes.length ? partes.join(' · ') : 'Todo se leyó claro.';

  dibujarHoja();
  renderPreguntas();
  mostrar('panel-revision', true);
  $('panel-revision').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const COLOR = { ok: '#2e7d32', dudosa: '#e08a00', doble: '#c62828', vacia: '#c62828', manual: '#1565c0' };

function dibujarHoja() {
  const { lectura } = actual;
  const lienzo = $('lienzo-hoja');
  const { width, height } = lectura.hoja;
  lienzo.width = width;
  lienzo.height = height;
  const ctx = lienzo.getContext('2d');
  const rgba = aRGBA(lectura.hoja);
  ctx.putImageData(new ImageData(rgba.data, width, height), 0, 0);
  const r = (RETICULA.diametro / 2 + 0.6) * PX_MM;
  ctx.lineWidth = 3;
  preguntas.forEach((p, i) => {
    const res = lectura.respuestas[i];
    if (!p.burbujas.length) return;
    const elegida = actual.eleccion[i];
    const corregida = elegida !== (res.estado === 'doble' || res.estado === 'vacia' ? null : res.elegida);
    p.burbujas.forEach((b, k) => {
      const c = centroBurbuja(i, k);
      let color = null;
      if (elegida === k) color = corregida ? COLOR.manual : (res.estado === 'ok' ? COLOR.ok : COLOR.dudosa);
      else if (res.estado === 'doble' && res.valores[k] >= 0.2) color = COLOR.doble;
      if (!color) return;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(c.x * PX_MM, c.y * PX_MM, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  });
}

function puntajeEstimado() {
  let total = 0, obtenidos = 0;
  preguntas.forEach((p, i) => {
    const vale = Number(p.puntos) || 0;
    total += vale;
    if (p.burbujas.length) {
      const k = actual.eleccion[i];
      if (k !== null && k !== undefined && p.burbujas[k]?.opcion.es_correcta) obtenidos += vale;
    } else {
      const m = Number(actual.manual[i]);
      if (Number.isFinite(m)) obtenidos += Math.min(vale, Math.max(0, m));
    }
  });
  return total ? (obtenidos / total) * 10 : 0;
}

function renderPreguntas() {
  const { lectura } = actual;
  $('lista-preguntas').innerHTML = preguntas.map((p, i) => {
    const res = lectura.respuestas[i];
    const revisar = res.estado === 'dudosa' || res.estado === 'doble';
    const fondo = revisar ? 'background:rgba(224,138,0,.12)' : '';
    let controles;
    if (!p.burbujas.length) {
      controles = `<label class="text-sm text-on-surface-variant flex items-center gap-2">Puntos (de ${p.puntos})
        <input type="number" min="0" max="${p.puntos}" step="0.5" class="input-manual w-20 px-2 py-1 rounded-DEFAULT border border-outline-variant" data-i="${i}" value="${actual.manual[i]}"></label>`;
    } else {
      controles = p.burbujas.map((b, k) => {
        const sel = actual.eleccion[i] === k;
        return `<button type="button" class="btn-letra" data-i="${i}" data-k="${k}" aria-pressed="${sel}"
          style="width:38px;height:38px;border-radius:999px;font-weight:700;border:2px solid ${sel ? 'currentColor' : '#bbb'};${sel ? 'background:#111;color:#fff' : ''}">${b.etiqueta}</button>`;
      }).join('') + `<button type="button" class="btn-letra text-xs text-on-surface-variant" data-i="${i}" data-k="" style="padding:0 6px">${actual.eleccion[i] === null ? '<b>en blanco</b>' : 'en blanco'}</button>`;
    }
    const nota = { dudosa: 'revisar', doble: 'dos marcadas', vacia: 'en blanco', ok: '', mano: '' }[res.estado];
    return `<div class="flex items-center gap-3 py-2 px-2 border-b border-outline-variant flex-wrap" style="${fondo}" ${revisar ? 'data-revisar="1"' : ''}>
      <span class="w-8 text-right font-label-lg">${i + 1}</span>
      <div class="flex items-center gap-2 flex-wrap">${controles}</div>
      ${nota ? `<span class="text-xs" style="color:${COLOR[res.estado] || '#666'}">${nota}</span>` : ''}
    </div>`;
  }).join('');

  $('lista-preguntas').querySelectorAll('.btn-letra').forEach((b) => {
    b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      actual.eleccion[i] = b.dataset.k === '' ? null : Number(b.dataset.k);
      renderPreguntas();
      dibujarHoja();
    });
  });
  $('lista-preguntas').querySelectorAll('.input-manual').forEach((inp) => {
    inp.addEventListener('input', () => {
      actual.manual[Number(inp.dataset.i)] = inp.value;
      $('estimado').textContent = puntajeEstimado().toFixed(1);
    });
  });
  $('estimado').textContent = puntajeEstimado().toFixed(1);
}

async function guardar(reemplazar = false) {
  const alumnoId = $('select-alumno').value;
  if (!alumnoId) { mostrarError('Elige a qué alumno pertenece la hoja.'); return; }

  const marcas = {};
  const puntosManuales = {};
  preguntas.forEach((p, i) => {
    if (p.burbujas.length) {
      const k = actual.eleccion[i];
      marcas[p.id] = k === null || k === undefined ? null : p.burbujas[k].opcion.id;
    } else if (actual.manual[i] !== '' && actual.manual[i] !== undefined) {
      puntosManuales[p.id] = Number(actual.manual[i]);
    }
  });

  const btn = $('btn-guardar');
  btn.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/registrar-hoja`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ examen_id: examen.id, alumno_id: alumnoId, marcas, puntos_manuales: puntosManuales, reemplazar }),
    });
    let data = {};
    try { data = await resp.json(); } catch { /* vacia */ }
    if (resp.status === 409 && data.ya_existe) {
      const nombre = alumnos.find((a) => a.id === alumnoId)?.nombre || 'este alumno';
      const antes = data.calificacion != null ? ` (tiene ${(Number(data.calificacion) / 10).toFixed(1)})` : '';
      if (window.confirm(`${data.error}\n\n¿Reemplazar la calificación de ${nombre}${antes} con esta hoja?`)) {
        btn.disabled = false;
        await guardar(true);
      }
      return;
    }
    if (!resp.ok) throw new Error(data.error || `El servidor respondió ${resp.status}`);

    const nombre = alumnos.find((a) => a.id === alumnoId)?.nombre || '';
    mostrarOk(`Guardado: ${nombre} — ${(data.calificacion / 10).toFixed(1)}`);
    actual = null;
    mostrar('panel-revision', false);
    await cargarIntentos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    procesarSiguiente();
  } catch (e) {
    mostrarError(`No se pudo guardar: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ---------- eventos ----------

function recibirArchivos(lista) {
  cola.push(...Array.from(lista || []));
  procesarSiguiente();
}

$('foto-camara').addEventListener('change', (e) => { recibirArchivos(e.target.files); e.target.value = ''; });
$('foto-galeria').addEventListener('change', (e) => { recibirArchivos(e.target.files); e.target.value = ''; });
$('btn-guardar').addEventListener('click', () => guardar(false));
$('btn-descartar').addEventListener('click', () => {
  actual = null;
  mostrar('panel-revision', false);
  procesarSiguiente();
});
$('btn-ir-dudosa').addEventListener('click', () => {
  document.querySelector('#lista-preguntas [data-revisar="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;
  if (!examenId) { mostrarError('Falta el examen en la dirección.'); return; }

  const { data, error } = await supabase
    .from('examenes').select('id, titulo, grupo_id, grupos(nombre)').eq('id', examenId).maybeSingle();
  if (error || !data) { mostrarError('No se pudo cargar el examen (o no es de uno de tus grupos).'); return; }
  examen = data;
  $('examen-titulo').textContent = examen.titulo;
  $('examen-info').textContent = examen.grupos?.nombre || '';
  $('link-volver').href = `resultados-examen.html?examen_id=${examen.id}`;
  $('link-hojas').href = `hoja-respuestas.html?examen_id=${examen.id}`;
  document.title = `AulaFácil - Calificar hojas - ${examen.titulo}`;

  const [{ data: pregs }, { data: inscritos }] = await Promise.all([
    supabase.from('preguntas').select('id, tipo, orden, puntos, opciones(id, texto, orden, es_correcta)')
      .eq('examen_id', examenId).order('orden', { ascending: true }),
    supabase.from('grupo_alumnos').select('alumnos(id, nombre)').eq('grupo_id', examen.grupo_id),
  ]);
  preguntas = (pregs || []).map((p) => ({ ...p, burbujas: burbujasDePregunta(p) }));
  alumnos = (inscritos || []).map((r) => r.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (!preguntas.length) { mostrarError('El examen no tiene preguntas.'); return; }
  mostrar('zona-captura', true);
  await cargarIntentos();
}

init();
