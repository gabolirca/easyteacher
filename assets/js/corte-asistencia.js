import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

// Corte de asistencia: quien tiene derecho a examen y quien no.
//
// Solo MARCA, no bloquea nada. El porcentaje es
//   (asistencias + retardos) / dias con registro
// Los retardos cuentan como asistencia, pero se muestran aparte para que el
// maestro los vea. Un dia en que al alumno no se le paso lista no cuenta ni a
// favor ni en contra.
//
// El maestro puede dar derecho a mano a quien no llega al minimo
// (justificante, acuerdo con direccion). Eso se guarda con el motivo en
// derecho_examen_manual y se distingue del derecho "por asistencia".

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

const CICLO = '__ciclo__';
const POR_PAGINA = 1000; // tope por consulta de Supabase

let alumnos = [];            // [{id, nombre}]
let periodos = [];           // [{id, nombre, fecha_inicio, fecha_fin}]
let minimo = 80;
let filas = [];              // resultado del corte
let terminoBusqueda = '';

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

function ocultarAvisos() {
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('ok-box').classList.add('hidden');
}

function fechaCorta(f) {
  if (!f) return '';
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function periodoElegido() {
  const v = document.getElementById('corte-periodo').value;
  if (v === CICLO) return null;
  return periodos.find((p) => p.id === v) || null;
}

// Trae todas las asistencias del rango, de mil en mil. Un grupo de 40 con un
// semestre de clases pasa de mil renglones y sin esto el corte saldria corto.
async function asistenciasDelRango(desde, hasta) {
  const todas = [];
  for (let inicio = 0; ; inicio += POR_PAGINA) {
    let q = supabase.from('asistencias')
      .select('alumno_id, estado')
      .eq('grupo_id', grupoId)
      .order('fecha', { ascending: true })
      .order('alumno_id', { ascending: true })
      .range(inicio, inicio + POR_PAGINA - 1);
    if (desde) q = q.gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    todas.push(...(data || []));
    if (!data || data.length < POR_PAGINA) break;
  }
  return todas;
}

async function derechosManuales(periodoId) {
  let q = supabase.from('derecho_examen_manual')
    .select('id, alumno_id, motivo').eq('grupo_id', grupoId);
  q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const porAlumno = {};
  (data || []).forEach((d) => { porAlumno[d.alumno_id] = d; });
  return porAlumno;
}

async function calcularCorte() {
  ocultarAvisos();
  const cont = document.getElementById('tabla-corte-body');
  const periodo = periodoElegido();

  if (periodo && (!periodo.fecha_inicio || !periodo.fecha_fin)) {
    filas = [];
    document.getElementById('resumen-corte').innerHTML = '';
    document.getElementById('rango-corte').textContent = '';
    cont.innerHTML = `<tr><td colspan="7" class="py-6 px-4 text-center text-on-surface-variant">
      "${escapeHtml(periodo.nombre)}" no tiene fechas. Ponle fecha de inicio y fin en
      <a class="text-primary underline" href="periodos.html?id=${grupoId}">Periodos</a> para poder sacar su corte.</td></tr>`;
    return;
  }

  cont.innerHTML = '<tr><td colspan="7" class="py-6 px-4 text-center text-on-surface-variant">Calculando...</td></tr>';

  const desde = periodo?.fecha_inicio || null;
  const hasta = periodo?.fecha_fin || null;
  document.getElementById('rango-corte').textContent = periodo
    ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
    : 'Todo el ciclo';

  let registros;
  let manuales;
  try {
    [registros, manuales] = await Promise.all([asistenciasDelRango(desde, hasta), derechosManuales(periodo?.id || null)]);
  } catch (e) {
    mostrarError(`No se pudo calcular el corte: ${e.message}`);
    cont.innerHTML = '';
    return;
  }

  const conteo = {};
  registros.forEach((r) => {
    const c = (conteo[r.alumno_id] ||= { presente: 0, retardo: 0, falta: 0 });
    if (c[r.estado] !== undefined) c[r.estado] += 1;
  });

  filas = alumnos.map((a) => {
    const c = conteo[a.id] || { presente: 0, retardo: 0, falta: 0 };
    const total = c.presente + c.retardo + c.falta;
    const pct = total > 0 ? ((c.presente + c.retardo) / total) * 100 : null;
    const manual = manuales[a.id] || null;
    let derecho;
    if (pct === null) derecho = 'sin_datos';
    else if (pct >= minimo) derecho = 'si';
    else if (manual) derecho = 'manual';
    else derecho = 'no';
    return { ...a, ...c, total, pct, manual, derecho };
  });

  renderTabla();
}

const PILDORAS = {
  si: ['bg-secondary-container text-on-secondary-container', 'Con derecho'],
  manual: ['bg-tertiary-container text-on-tertiary-container', 'Con derecho (manual)'],
  no: ['bg-error-container text-on-error-container', 'Sin derecho'],
  sin_datos: ['bg-surface-container-high text-on-surface-variant', 'Sin registros'],
};

function renderResumen() {
  const contar = (d) => filas.filter((f) => f.derecho === d).length;
  const si = contar('si') + contar('manual');
  const no = contar('no');
  const sinDatos = contar('sin_datos');
  document.getElementById('resumen-corte').innerHTML = `
    <span class="pill-contador bg-secondary-container text-on-secondary-container"><span class="material-symbols-outlined text-base">check_circle</span> ${si} con derecho</span>
    <span class="pill-contador bg-error-container text-on-error-container"><span class="material-symbols-outlined text-base">block</span> ${no} sin derecho</span>
    ${sinDatos ? `<span class="pill-contador bg-surface-container-high text-on-surface-variant"><span class="material-symbols-outlined text-base">help</span> ${sinDatos} sin registros</span>` : ''}`;
}

function renderTabla() {
  renderResumen();
  const tbody = document.getElementById('tabla-corte-body');

  if (alumnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 px-4 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? filas.filter((f) => f.nombre.toLowerCase().includes(filtro)) : filas;
  if (visibles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 px-4 text-center text-on-surface-variant">Ningún alumno coincide con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = visibles.map((f) => {
    const [estilo, etiqueta] = PILDORAS[f.derecho];
    const pct = f.pct === null ? '—' : `${Math.round(f.pct * 10) / 10}%`;
    let accion = '';
    if (f.derecho === 'no') {
      accion = `<button class="btn-dar-derecho no-imprimir text-primary font-label-lg text-sm hover:underline" data-alumno="${f.id}">Dar derecho</button>`;
    } else if (f.derecho === 'manual') {
      accion = `<button class="btn-quitar-derecho no-imprimir text-on-surface-variant font-label-lg text-sm hover:underline" data-id="${f.manual.id}">Quitar</button>`;
    }
    const motivo = f.derecho === 'manual' && f.manual.motivo
      ? `<div class="text-xs text-on-surface-variant mt-1">${escapeHtml(f.manual.motivo)}</div>` : '';
    return `
      <tr class="border-t border-outline-variant">
        <td class="py-3 px-4 font-body-md text-body-md text-on-surface">${escapeHtml(f.nombre)}${motivo}</td>
        <td class="py-3 px-2 text-center text-on-surface">${f.presente}</td>
        <td class="py-3 px-2 text-center text-on-surface">${f.retardo}</td>
        <td class="py-3 px-2 text-center text-on-surface">${f.falta}</td>
        <td class="py-3 px-2 text-center font-label-lg text-on-surface">${pct}</td>
        <td class="py-3 px-2 text-center"><span class="px-3 py-1 rounded-full text-sm font-label-lg whitespace-nowrap ${estilo}">${etiqueta}</span></td>
        <td class="py-3 px-4 text-right">${accion}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-dar-derecho').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const alumno = filas.find((f) => f.id === btn.dataset.alumno);
      const motivo = window.prompt(`¿Por qué ${alumno?.nombre ?? 'este alumno'} tiene derecho a examen? (justificante, acuerdo con dirección...)`);
      if (motivo === null) return;
      const periodo = periodoElegido();
      const { error } = await supabase.from('derecho_examen_manual').insert({
        grupo_id: grupoId, alumno_id: btn.dataset.alumno, periodo_id: periodo?.id || null,
        motivo: motivo.trim() || null,
      });
      if (error) { mostrarError(`No se pudo guardar: ${error.message}`); return; }
      mostrarOk('Derecho a examen otorgado.');
      await calcularCorte();
    });
  });

  tbody.querySelectorAll('.btn-quitar-derecho').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('¿Quitar el derecho que diste a mano? El alumno vuelve a quedar según su asistencia.')) return;
      const { error } = await supabase.from('derecho_examen_manual').delete().eq('id', btn.dataset.id);
      if (error) { mostrarError(`No se pudo quitar: ${error.message}`); return; }
      await calcularCorte();
    });
  });
}

function descargarCsv() {
  const periodo = periodoElegido();
  const nombre = periodo ? periodo.nombre : 'ciclo';
  const enc = ['Alumno', 'Asistencias', 'Retardos', 'Faltas', 'Porcentaje', 'Derecho a examen', 'Motivo'];
  const lineas = filas.map((f) => [
    f.nombre, f.presente, f.retardo, f.falta,
    f.pct === null ? '' : (Math.round(f.pct * 10) / 10),
    PILDORAS[f.derecho][1], f.manual?.motivo || '',
  ]);
  const csv = [enc, ...lineas]
    .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM para que Excel respete los acentos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `corte-asistencia-${document.getElementById('grupo-nombre').textContent}-${nombre}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderTabla();
});
document.getElementById('corte-periodo').addEventListener('change', calcularCorte);
document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
document.getElementById('btn-descargar').addEventListener('click', descargarCsv);

document.getElementById('btn-guardar-minimo').addEventListener('click', async () => {
  const valor = Number(document.getElementById('asistencia-minima').value);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
    mostrarError('El mínimo debe ser un porcentaje entre 0 y 100');
    return;
  }
  const { error } = await supabase.from('grupos').update({ asistencia_minima: valor }).eq('id', grupoId);
  if (error) { mostrarError(`No se pudo guardar el mínimo: ${error.message}`); return; }
  minimo = valor;
  mostrarOk(`Mínimo de asistencia guardado: ${valor}%.`);
  await calcularCorte();
});

function llenarPeriodos() {
  const select = document.getElementById('corte-periodo');
  const opciones = periodos.map((p) => {
    const fechas = p.fecha_inicio && p.fecha_fin
      ? ` (${fechaCorta(p.fecha_inicio)} – ${fechaCorta(p.fecha_fin)})`
      : ' (sin fechas)';
    return `<option value="${p.id}">${escapeHtml(p.nombre)}${fechas}</option>`;
  });
  select.innerHTML = opciones.join('') + `<option value="${CICLO}">Todo el ciclo</option>`;

  // Por defecto, el periodo que contiene la fecha de hoy; si no, todo el ciclo.
  const hoy = new Date();
  const hoyTxt = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const actual = periodos.find((p) => p.fecha_inicio && p.fecha_fin && p.fecha_inicio <= hoyTxt && hoyTxt <= p.fecha_fin);
  select.value = actual ? actual.id : CICLO;
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
    .select('id, nombre, asistencia_minima')
    .eq('id', grupoId)
    .maybeSingle();

  if (error || !grupo) {
    mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)');
    return;
  }

  minimo = Number(grupo.asistencia_minima ?? 80);
  document.getElementById('asistencia-minima').value = minimo;
  document.getElementById('grupo-nombre').textContent = grupo.nombre;
  document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
  document.getElementById('link-pasar-lista').href = `asistencia.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Corte de asistencia - ${grupo.nombre}`;

  const [{ data: alumnosData, error: errorAlumnos }, { data: periodosData }] = await Promise.all([
    supabase.from('grupo_alumnos').select('alumnos(id, nombre)').eq('grupo_id', grupoId),
    supabase.from('periodos').select('id, nombre, fecha_inicio, fecha_fin').eq('grupo_id', grupoId).order('orden', { ascending: true }),
  ]);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  alumnos = (alumnosData || []).map((r) => r.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
  periodos = periodosData || [];
  llenarPeriodos();
  await calcularCorte();
}

init();
