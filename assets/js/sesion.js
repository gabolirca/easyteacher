import { supabase, SUPABASE_URL } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { toCanvas } from '../vendor/qrcode.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('grupo');

// El QR se regenera cada 20 s. Debe coincidir con VENTANA_SEG de la Edge
// Function registrar-presencia, o ningún código validará.
const VENTANA_SEG = 20;

let profesor = null;
let grupo = null;
let periodos = [];
let sesion = null;
let secreto = null;
let roster = [];              // [{id, nombre, matricula}]
let presentes = new Set();    // alumno_id con asistencia hoy
let actividades = [];         // [{id, nombre, valor, abierta, inicio_marcado}]
let reclamosPorActividad = {}; // { actividad_id: Set(alumno_id) }
let actividadAbierta = null;   // la que se está revisando
let marcados = new Set();      // interruptores de la actividad abierta
let filtro = '';
let ventanaPintada = null;
let relojQR = null;
let sondeo = null;
let historial = [];
let detalle = null;

const LS = (k) => `aulafacil_sesion_${k}`;

// ---------- utilidades ----------

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function vista(id) {
  ['vista-inicio', 'vista-vivo', 'vista-actividad', 'vista-resumen', 'vista-detalle', 'vista-corte', 'vista-error']
    .forEach((v) => document.getElementById(v)?.classList.toggle('hidden', v !== id));
}

function aviso(msg, esError = false) {
  const el = document.getElementById('aviso');
  if (!el) return;
  el.textContent = msg;
  el.className = `rounded-DEFAULT p-3 mb-3 font-body-md text-body-md ${
    esError ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

async function encabezados() {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
}

async function llamar(funcion, cuerpo) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${funcion}`, {
    method: 'POST', headers: await encabezados(), body: JSON.stringify(cuerpo),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Falló la operación');
  return data;
}

// ---------- QR rotativo ----------
// El código se calcula en el navegador del maestro con el secreto de la
// sesión (que la RLS solo le deja leer a él). No hace falta red para
// regenerarlo, así que el QR sigue rotando aunque se caiga el wifi.

async function firmar(mensaje) {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(mensaje));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function urlDelAlumno(ventana, codigo) {
  const carpeta = window.location.pathname.replace(/[^/]*$/, '');
  return `${window.location.origin}${carpeta}panel-alumno.html?s=${sesion.id}&v=${ventana}&c=${codigo}`;
}

async function pintarQR() {
  if (!sesion || !secreto) return;
  const ventana = Math.floor(Date.now() / 1000 / VENTANA_SEG);
  if (ventana === ventanaPintada) return;   // aún no toca rotar
  ventanaPintada = ventana;

  const codigo = await firmar(`${sesion.id}.${ventana}`);
  const url = urlDelAlumno(ventana, codigo);

  const lienzo = document.getElementById('qr-canvas');
  await toCanvas(lienzo, url, { width: 260, margin: 1, errorCorrectionLevel: 'M' });

  const restante = VENTANA_SEG - (Math.floor(Date.now() / 1000) % VENTANA_SEG);
  const cuenta = document.getElementById('qr-cuenta');
  if (cuenta) cuenta.textContent = `El código cambia en ${restante} s`;
}

function arrancarQR() {
  if (relojQR) clearInterval(relojQR);
  pintarQR();
  relojQR = setInterval(() => {
    pintarQR();
    const restante = VENTANA_SEG - (Math.floor(Date.now() / 1000) % VENTANA_SEG);
    const cuenta = document.getElementById('qr-cuenta');
    if (cuenta) cuenta.textContent = `El código cambia en ${restante} s`;
  }, 1000);
}

// ---------- carga ----------

async function cargarGrupo() {
  const { data, error } = await supabase
    .from('grupos').select('id, nombre, materia').eq('id', grupoId).maybeSingle();
  if (error || !data) throw new Error('No se pudo cargar el grupo');
  grupo = data;

  const { data: p } = await supabase
    .from('periodos').select('id, nombre, orden').eq('grupo_id', grupoId).order('orden');
  periodos = p || [];

  const { data: ga } = await supabase
    .from('grupo_alumnos').select('alumnos(id, nombre, matricula)').eq('grupo_id', grupoId);
  roster = (ga || []).map((r) => r.alumnos).filter(Boolean)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function buscarSesionActiva() {
  const { data } = await supabase
    .from('sesiones').select('*').eq('grupo_id', grupoId).eq('estado', 'activa').maybeSingle();
  return data || null;
}

async function cargarSecreto() {
  const { data } = await supabase
    .from('sesiones_secreto').select('secreto').eq('sesion_id', sesion.id).maybeSingle();
  secreto = data?.secreto || null;
  if (!secreto) throw new Error('Esta sesión no tiene código de QR');
}

async function refrescar() {
  if (!sesion || document.hidden) return;

  const { data: asis } = await supabase
    .from('asistencias').select('alumno_id, estado')
    .eq('grupo_id', grupoId).eq('fecha', sesion.fecha);
  presentes = new Set((asis || [])
    .filter((a) => a.estado === 'presente' || a.estado === 'retardo')
    .map((a) => a.alumno_id));

  const { data: acts } = await supabase
    .from('actividades_sesion').select('*').eq('sesion_id', sesion.id).order('orden');
  actividades = acts || [];

  if (actividades.length > 0) {
    const { data: parts } = await supabase
      .from('participaciones_sesion')
      .select('actividad_id, alumno_id, estado')
      .in('actividad_id', actividades.map((a) => a.id));
    reclamosPorActividad = {};
    (parts || []).forEach((p) => {
      if (p.estado === 'rechazada') return;
      (reclamosPorActividad[p.actividad_id] ||= new Set()).add(p.alumno_id);
    });
  }

  if (actividadAbierta) {
    // Los reclamos que llegaron mientras el maestro revisa se marcan solos.
    (reclamosPorActividad[actividadAbierta.id] || new Set())
      .forEach((id) => marcados.add(id));
    guardarMarcados();
    pintarActividad();
  } else {
    pintarVivo();
  }
}

// ---------- pantalla: iniciar ----------

function pintarInicio() {
  document.getElementById('inicio-grupo').textContent = grupo.nombre;
  document.getElementById('inicio-materia').textContent = grupo.materia || '';
  const sel = document.getElementById('sel-periodo');
  sel.innerHTML = '<option value="">Sin parcial</option>' +
    periodos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  pintarHistorial();
  vista('vista-inicio');
}

async function iniciarSesion() {
  const btn = document.getElementById('btn-iniciar');
  btn.disabled = true;
  try {
    const periodoId = document.getElementById('sel-periodo').value || null;
    const { data, error } = await supabase.from('sesiones')
      .insert({ grupo_id: grupoId, periodo_id: periodoId }).select().single();
    if (error) throw new Error(error.message);
    sesion = data;
    await supabase.from('sesiones_secreto').insert({ sesion_id: sesion.id, grupo_id: grupoId });
    await cargarSecreto();
    await entrarEnVivo();
  } catch (e) {
    aviso(e.message, true);
    btn.disabled = false;
  }
}

// ---------- pantalla: sesión en vivo ----------

async function entrarEnVivo() {
  vista('vista-vivo');
  arrancarQR();
  await refrescar();
  if (sondeo) clearInterval(sondeo);
  sondeo = setInterval(refrescar, 6000);
}

function pintarVivo() {
  document.getElementById('vivo-grupo').textContent = grupo.nombre;
  document.getElementById('vivo-presentes').textContent = `${presentes.size} / ${roster.length}`;

  const cont = document.getElementById('lista-actividades');
  if (actividades.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">Todavía no hay actividades. Crea la primera cuando pongas un ejercicio.</p>';
    return;
  }

  cont.innerHTML = actividades.map((a) => {
    const n = (reclamosPorActividad[a.id] || new Set()).size;
    return `
      <button class="btn-actividad w-full text-left bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 mb-3 flex items-center justify-between gap-3"
              data-id="${a.id}">
        <div>
          <p class="font-label-lg text-label-lg text-on-surface">${esc(a.nombre)}</p>
          <p class="font-body-md text-body-md text-on-surface-variant">${a.valor} puntos · ${n} alumno${n === 1 ? '' : 's'}</p>
        </div>
        <span class="px-3 py-1 rounded-full text-sm font-label-lg ${
          a.abierta ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container-high text-on-surface-variant'}">
          ${a.abierta ? 'Abierta' : 'Cerrada'}</span>
      </button>`;
  }).join('');

  cont.querySelectorAll('.btn-actividad').forEach((b) => {
    b.addEventListener('click', () => abrirActividad(b.dataset.id));
  });
}

// ---------- crear actividad ----------

async function crearActividad() {
  const nombre = document.getElementById('act-nombre').value.trim();
  const valor = Number(document.getElementById('act-valor').value);
  const inicio = document.getElementById('act-inicio').value;
  if (!nombre) { aviso('Ponle nombre a la actividad', true); return; }
  if (!Number.isFinite(valor) || valor < 0) { aviso('El valor debe ser un número', true); return; }

  try {
    const { data, error } = await supabase.from('actividades_sesion').insert({
      sesion_id: sesion.id, nombre, valor, inicio_marcado: inicio, orden: actividades.length,
    }).select().single();
    if (error) throw new Error(error.message);
    document.getElementById('act-nombre').value = '';
    document.getElementById('dialogo-actividad').classList.add('hidden');
    await refrescar();
    abrirActividad(data.id);
  } catch (e) { aviso(e.message, true); }
}

// ---------- pantalla: revisar una actividad ----------

function claveMarcados(id) { return LS(`marcados_${id}`); }

function guardarMarcados() {
  if (!actividadAbierta) return;
  try {
    localStorage.setItem(claveMarcados(actividadAbierta.id), JSON.stringify([...marcados]));
  } catch { /* sin almacenamiento, seguimos en memoria */ }
}

function abrirActividad(id) {
  actividadAbierta = actividades.find((a) => a.id === id);
  if (!actividadAbierta) return;

  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(claveMarcados(id)) || 'null'); } catch { /* noop */ }

  if (guardado) {
    marcados = new Set(guardado);
  } else if (actividadAbierta.inicio_marcado === 'todos') {
    marcados = new Set([...presentes]);
  } else {
    marcados = new Set();
  }
  // Un reclamo del alumno siempre entra marcado; el maestro lo quita si no.
  (reclamosPorActividad[id] || new Set()).forEach((a) => marcados.add(a));

  filtro = '';
  document.getElementById('buscar-alumno').value = '';
  pintarActividad();
  vista('vista-actividad');
}

function pintarActividad() {
  const a = actividadAbierta;
  if (!a) return;
  document.getElementById('act-titulo').textContent = a.nombre;
  document.getElementById('act-sub').textContent =
    `${a.valor} puntos · ${marcados.size} de ${roster.length} marcados`;

  const btnCerrar = document.getElementById('btn-cerrar-actividad');
  btnCerrar.classList.toggle('hidden', !a.abierta);
  document.getElementById('act-cerrada').classList.toggle('hidden', a.abierta);

  const reclamos = reclamosPorActividad[a.id] || new Set();
  const f = filtro.trim().toLowerCase();
  const visibles = f
    ? roster.filter((al) => al.nombre.toLowerCase().includes(f) || (al.matricula || '').includes(f))
    : roster;

  const cont = document.getElementById('lista-alumnos');
  cont.innerHTML = visibles.map((al) => {
    const on = marcados.has(al.id);
    const presente = presentes.has(al.id);
    const reclamo = reclamos.has(al.id);
    return `
      <button class="fila-alumno w-full text-left rounded-DEFAULT p-4 mb-2 flex items-center gap-3 border-2 transition-colors ${
        on ? 'border-secondary bg-secondary-container' : 'border-outline-variant bg-surface-container-lowest'}"
              data-id="${al.id}" ${a.abierta ? '' : 'disabled'}>
        <span class="material-symbols-outlined ${on ? 'text-on-secondary-container' : 'text-on-surface-variant'}">
          ${on ? 'check_circle' : 'radio_button_unchecked'}</span>
        <span class="flex-1">
          <span class="block font-body-md text-body-md ${on ? 'text-on-secondary-container' : 'text-on-surface'}">${esc(al.nombre)}</span>
          <span class="block text-sm text-on-surface-variant">
            ${presente ? '' : 'sin escanear · '}${reclamo ? 'reclamó' : ''}${!presente && !reclamo ? '' : ''}
          </span>
        </span>
      </button>`;
  }).join('');

  cont.querySelectorAll('.fila-alumno').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
      guardarMarcados();
      pintarActividad();
    });
  });
}

async function cerrarActividad() {
  const btn = document.getElementById('btn-cerrar-actividad');
  btn.disabled = true;
  try {
    const r = await llamar('cerrar-actividad', {
      actividad_id: actividadAbierta.id,
      aprobados: [...marcados],
    });
    try { localStorage.removeItem(claveMarcados(actividadAbierta.id)); } catch { /* noop */ }
    aviso(`${r.actividad}: ${r.con_puntos} alumnos, ${r.puntos_generados} puntos`);
    actividadAbierta = null;
    await refrescar();
    vista('vista-vivo');
  } catch (e) {
    aviso(`No se pudo cerrar: ${e.message}. Tus marcas están guardadas, inténtalo cuando vuelva la señal.`, true);
  } finally { btn.disabled = false; }
}

// ---------- cerrar sesión ----------

async function cerrarSesion() {
  if (!confirm('¿Cerrar la clase? Ya no se podrán registrar más participaciones.')) return;
  const abiertas = actividades.filter((a) => a.abierta);
  if (abiertas.length > 0 &&
      !confirm(`Hay ${abiertas.length} actividad(es) sin cerrar. Se aprobarán los reclamos que tengan. ¿Continuar?`)) return;

  try {
    for (const a of abiertas) {
      await llamar('cerrar-actividad', { actividad_id: a.id });
    }
    const { error } = await supabase.from('sesiones')
      .update({ estado: 'cerrada', fin: new Date().toISOString() }).eq('id', sesion.id);
    if (error) throw new Error(error.message);

    await refrescar();
    const { data: parts } = actividades.length
      ? await supabase.from('participaciones_sesion').select('puntos, estado')
          .in('actividad_id', actividades.map((a) => a.id))
      : { data: [] };
    const aprobadas = (parts || []).filter((p) => p.estado === 'aprobada');
    const puntos = aprobadas.reduce((s, p) => s + Number(p.puntos || 0), 0);

    // El resumen se guarda, no se recalcula despues. Asi queda como evidencia
    // estable de lo que paso ese dia, aunque luego se corrija algo.
    await supabase.from('sesiones').update({
      total_alumnos: roster.length,
      presentes: presentes.size,
      participaciones: aprobadas.length,
      puntos_generados: puntos,
    }).eq('id', sesion.id);

    document.getElementById('res-presentes').textContent = `${presentes.size} / ${roster.length}`;
    document.getElementById('res-participaciones').textContent = aprobadas.length;
    document.getElementById('res-puntos').textContent = puntos;
    if (relojQR) clearInterval(relojQR);
    if (sondeo) clearInterval(sondeo);
    vista('vista-resumen');
  } catch (e) { aviso(e.message, true); }
}


// ---------- Historial ----------
// El maestro necesita poder demostrar que un alumno si participo (o no) si
// hay un reclamo despues. Por eso cada sesion cerrada guarda su resumen y
// se puede abrir el detalle alumno por alumno.

async function cargarHistorial() {
  const { data } = await supabase
    .from('sesiones')
    .select('id, fecha, inicio, fin, total_alumnos, presentes, participaciones, puntos_generados, periodos(nombre)')
    .eq('grupo_id', grupoId).eq('estado', 'cerrada')
    .order('inicio', { ascending: false }).limit(40);
  historial = data || [];
}

function fechaLarga(f) {
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-MX',
    { weekday: 'short', day: '2-digit', month: 'short' });
}

function pintarHistorial() {
  const cont = document.getElementById('lista-historial');
  if (!cont) return;
  if (historial.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">Todavía no hay clases registradas en este grupo.</p>';
    return;
  }
  cont.innerHTML = historial.map((h) => `
    <button class="btn-historial w-full text-left bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 mb-3"
            data-id="${h.id}">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="font-label-lg text-label-lg text-on-surface capitalize">${fechaLarga(h.fecha)}</p>
          <p class="font-body-md text-body-md text-on-surface-variant">
            ${h.presentes ?? '?'} / ${h.total_alumnos ?? '?'} presentes ·
            ${h.participaciones ?? 0} participaciones
          </p>
        </div>
        <span class="font-headline-md text-headline-md text-primary shrink-0">${h.puntos_generados ?? 0}</span>
      </div>
      ${h.periodos?.nombre ? `<p class="text-sm text-on-surface-variant mt-1">${esc(h.periodos.nombre)}</p>` : ''}
    </button>`).join('');

  cont.querySelectorAll('.btn-historial').forEach((b) => {
    b.addEventListener('click', () => verDetalle(b.dataset.id));
  });
}

async function verDetalle(sesionId) {
  const h = historial.find((x) => x.id === sesionId);
  if (!h) return;
  detalle = h;

  const { data: acts } = await supabase
    .from('actividades_sesion').select('id, nombre, valor')
    .eq('sesion_id', sesionId).order('orden');

  const { data: parts } = (acts && acts.length)
    ? await supabase.from('participaciones_sesion')
        .select('actividad_id, alumno_id, estado, puntos')
        .in('actividad_id', acts.map((a) => a.id))
    : { data: [] };

  const { data: asis } = await supabase
    .from('asistencias').select('alumno_id, estado')
    .eq('grupo_id', grupoId).eq('fecha', h.fecha);

  const nombre = Object.fromEntries(roster.map((a) => [a.id, a.nombre]));
  const asistencia = Object.fromEntries((asis || []).map((a) => [a.alumno_id, a.estado]));

  document.getElementById('det-fecha').textContent = fechaLarga(h.fecha);
  document.getElementById('det-resumen').innerHTML = `
    <div class="flex justify-between py-2 border-b border-outline-variant">
      <span class="font-body-md text-on-surface-variant">Presentes</span>
      <span class="font-label-lg text-on-surface">${h.presentes ?? '?'} / ${h.total_alumnos ?? '?'}</span></div>
    <div class="flex justify-between py-2 border-b border-outline-variant">
      <span class="font-body-md text-on-surface-variant">Participaciones</span>
      <span class="font-label-lg text-on-surface">${h.participaciones ?? 0}</span></div>
    <div class="flex justify-between py-2">
      <span class="font-body-md text-on-surface-variant">Puntos generados</span>
      <span class="font-label-lg text-primary">${h.puntos_generados ?? 0}</span></div>`;

  const cont = document.getElementById('det-actividades');
  if (!acts || acts.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">Esta clase no tuvo actividades registradas.</p>';
  } else {
    cont.innerHTML = acts.map((a) => {
      const filas = (parts || []).filter((p) => p.actividad_id === a.id);
      const con = filas.filter((p) => p.estado === 'aprobada');
      const sin = filas.filter((p) => p.estado === 'rechazada');
      const lista = (arr, color) => arr.length === 0 ? '' :
        `<p class="text-sm ${color} mt-1">${arr.map((p) => esc(nombre[p.alumno_id] || '—')).join(', ')}</p>`;
      return `
        <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 mb-3">
          <div class="flex items-center justify-between gap-3">
            <p class="font-label-lg text-label-lg text-on-surface">${esc(a.nombre)}</p>
            <span class="text-sm text-on-surface-variant shrink-0">${a.valor} pts · ${con.length} alumnos</span>
          </div>
          ${lista(con, 'text-on-surface-variant')}
          ${sin.length ? `<p class="text-sm text-on-surface-variant mt-2 font-bold">No contabilizados:</p>${lista(sin, 'text-error')}` : ''}
        </div>`;
    }).join('');
  }

  const faltaron = roster.filter((al) => {
    const e = asistencia[al.id];
    return !e || e === 'falta' || e === 'justificada';
  });
  document.getElementById('det-asistencia').innerHTML = faltaron.length === 0
    ? '<p class="font-body-md text-on-surface-variant">Asistió el grupo completo.</p>'
    : `<p class="font-body-md text-on-surface-variant">No asistieron (${faltaron.length}):</p>
       <p class="text-sm text-on-surface-variant mt-1">${faltaron.map((a) =>
         `${esc(a.nombre)}${asistencia[a.id] === 'justificada' ? ' (justificada)' : ''}`).join(', ')}</p>`;

  vista('vista-detalle');
}


// ---------- Corte de participación ----------
// Convierte los puntos acumulados en calificación de 0 a 10, igual que el
// modo Fichas: se ordena de mayor a menor, el maestro elige un valor de
// referencia (sugerido: el más alto del grupo) y quien lo alcanza saca 10.
// El resultado se guarda como foto fija, así que seguir dando puntos después
// no altera las calificaciones ya emitidas.

let rankingCorte = [];

async function puntosAcumulados(periodoId) {
  let q = supabase.from('sesiones').select('id').eq('grupo_id', grupoId).eq('estado', 'cerrada');
  q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
  const { data: ses } = await q;
  if (!ses || ses.length === 0) return {};

  const { data: acts } = await supabase
    .from('actividades_sesion').select('id').in('sesion_id', ses.map((x) => x.id));
  if (!acts || acts.length === 0) return {};

  const { data: parts } = await supabase
    .from('participaciones_sesion').select('alumno_id, puntos')
    .eq('estado', 'aprobada').in('actividad_id', acts.map((x) => x.id));

  const acumulado = {};
  (parts || []).forEach((x) => {
    acumulado[x.alumno_id] = (acumulado[x.alumno_id] || 0) + Number(x.puntos || 0);
  });
  return acumulado;
}

async function abrirCorte() {
  const sel = document.getElementById('corte-periodo');
  sel.innerHTML = '<option value="">Sin parcial</option>' +
    periodos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  await cargarRanking();
  vista('vista-corte');
}

async function cargarRanking() {
  const periodoId = document.getElementById('corte-periodo').value || null;
  const puntos = await puntosAcumulados(periodoId);

  rankingCorte = roster
    .map((a) => ({ id: a.id, nombre: a.nombre, puntos: puntos[a.id] || 0 }))
    .sort((a, b) => b.puntos - a.puntos);

  const masAlto = rankingCorte.length ? rankingCorte[0].puntos : 0;
  document.getElementById('corte-referencia').value = masAlto || '';

  let q = supabase.from('cortes_participacion').select('fecha, media').eq('grupo_id', grupoId);
  q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
  const { data: ultimo } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  document.getElementById('corte-ultimo').textContent = ultimo
    ? `Último corte de este parcial: ${ultimo.fecha}, con referencia de ${ultimo.media} puntos.`
    : 'Todavía no se ha hecho corte en este parcial.';

  pintarRanking();
}

function pintarRanking() {
  const ref = parseFloat(document.getElementById('corte-referencia').value);
  const cont = document.getElementById('corte-lista');

  if (rankingCorte.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">No hay alumnos en este grupo.</p>';
    return;
  }
  if (rankingCorte.every((r) => r.puntos === 0)) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">Todavía no hay puntos en este parcial. Cierra al menos una clase con actividades antes de hacer el corte.</p>';
    return;
  }

  cont.innerHTML = rankingCorte.map((r, i) => {
    const califica = ref > 0 ? Math.min(10, Math.round((r.puntos / ref) * 10 * 10) / 10) : 0;
    const tope = ref > 0 && r.puntos >= ref;
    return `
      <div class="flex items-center gap-3 border-b border-outline-variant py-3">
        <span class="text-on-surface-variant font-body-md" style="min-width:2rem;">${i + 1}</span>
        <span class="flex-1 font-body-md text-body-md text-on-surface">${esc(r.nombre)}</span>
        <span class="font-body-md text-on-surface-variant" style="min-width:4.5rem;text-align:right;">${r.puntos} pts</span>
        <span class="font-label-lg text-label-lg ${tope ? 'text-secondary' : 'text-on-surface'}" style="min-width:3rem;text-align:right;">${califica.toFixed(1)}</span>
      </div>`;
  }).join('');
}

async function aplicarCorte() {
  const ref = parseFloat(document.getElementById('corte-referencia').value);
  const periodoId = document.getElementById('corte-periodo').value || null;

  if (!Number.isFinite(ref) || ref <= 0) {
    aviso('El valor de referencia debe ser mayor que cero', true);
    return;
  }
  if (!confirm(`¿Aplicar el corte con referencia de ${ref} puntos? Se guarda la calificación de participación de todos como una foto fija de este momento.`)) return;

  const btn = document.getElementById('btn-aplicar-corte');
  btn.disabled = true;
  try {
    const { data: corte, error: errorCorte } = await supabase
      .from('cortes_participacion')
      .insert({ grupo_id: grupoId, media: ref, periodo_id: periodoId })
      .select().single();
    if (errorCorte) throw new Error(errorCorte.message);

    const filas = rankingCorte.map((r) => ({
      corte_id: corte.id,
      alumno_id: r.id,
      puntos_al_momento: r.puntos,
      calificacion: Math.min(10, Math.round((r.puntos / ref) * 10 * 10) / 10),
    }));
    const { error: errorFilas } = await supabase.from('calificaciones_corte_participacion').insert(filas);
    if (errorFilas) throw new Error(errorFilas.message);

    aviso('Corte aplicado. Ya se refleja en Calificaciones finales.');
    await cargarRanking();
  } catch (e) {
    aviso(`No se pudo aplicar el corte: ${e.message}`, true);
  } finally { btn.disabled = false; }
}

document.getElementById('btn-ver-corte')?.addEventListener('click', abrirCorte);
document.getElementById('btn-volver-de-corte')?.addEventListener('click', () => vista('vista-inicio'));
document.getElementById('corte-periodo')?.addEventListener('change', cargarRanking);
document.getElementById('corte-referencia')?.addEventListener('input', pintarRanking);
document.getElementById('btn-aplicar-corte')?.addEventListener('click', aplicarCorte);

// ---------- eventos ----------

document.getElementById('btn-iniciar')?.addEventListener('click', iniciarSesion);
document.getElementById('btn-nueva-actividad')?.addEventListener('click', () => {
  document.getElementById('dialogo-actividad').classList.remove('hidden');
});
document.getElementById('btn-cancelar-actividad')?.addEventListener('click', () => {
  document.getElementById('dialogo-actividad').classList.add('hidden');
});
document.getElementById('btn-crear-actividad')?.addEventListener('click', crearActividad);
document.getElementById('btn-volver-vivo')?.addEventListener('click', () => {
  actividadAbierta = null; pintarVivo(); vista('vista-vivo');
});
document.getElementById('btn-cerrar-actividad')?.addEventListener('click', cerrarActividad);
document.getElementById('btn-cerrar-sesion')?.addEventListener('click', cerrarSesion);
document.getElementById('btn-volver-historial')?.addEventListener('click', () => {
  detalle = null; vista('vista-inicio');
});
document.getElementById('btn-ver-historial')?.addEventListener('click', async () => {
  await cargarHistorial(); pintarHistorial(); vista('vista-inicio');
});
document.getElementById('buscar-alumno')?.addEventListener('input', (e) => {
  filtro = e.target.value; pintarActividad();
});
document.getElementById('btn-marcar-todos')?.addEventListener('click', () => {
  presentes.forEach((id) => marcados.add(id));
  guardarMarcados(); pintarActividad();
});
document.getElementById('btn-limpiar-marcas')?.addEventListener('click', () => {
  marcados.clear(); guardarMarcados(); pintarActividad();
});

// ---------- arranque ----------

async function init() {
  profesor = await requireProfesor();
  if (!profesor) return;
  if (!grupoId) {
    document.getElementById('error-msg').textContent = 'Falta el grupo en la dirección.';
    vista('vista-error');
    return;
  }
  try {
    await cargarGrupo();
    document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
    const t = document.getElementById('page-title');
    if (t) t.textContent = `AulaFácil - Sesión - ${grupo.nombre}`;

    await cargarHistorial();
    sesion = await buscarSesionActiva();
    if (sesion) { await cargarSecreto(); await entrarEnVivo(); }
    else pintarInicio();
  } catch (e) {
    document.getElementById('error-msg').textContent = e.message;
    vista('vista-error');
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

init();
