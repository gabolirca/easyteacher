import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const rubroId = params.get('rubro_id');

let grupoId = null;
let esDiario = false;        // rubro con frecuencia 'diario': una calificacion por dia
let alumnos = []; // [{id, nombre}]
let calificacionPorAlumno = {}; // { alumno_id: number|null } del dia elegido (o del periodo)
let promedioPorAlumno = {};     // solo diario: promedio de todos los dias capturados
let terminoBusqueda = '';

const PALABRAS_A_ICONO = [
  [['conducta', 'comportamiento', 'disciplina'], 'psychology'],
  [['proyecto'], 'engineering'],
  [['puntualidad', 'asistencia'], 'schedule'],
  [['participacion', 'participación'], 'record_voice_over'],
  [['limpieza', 'orden'], 'cleaning_services'],
  [['presentacion', 'presentación', 'expo', 'exposicion', 'exposición'], 'co_present'],
  [['trabajo en equipo', 'equipo', 'grupal', 'colaboracion', 'colaboración'], 'groups'],
  [['creatividad', 'arte', 'dibujo'], 'palette'],
  [['esfuerzo', 'actitud'], 'emoji_events'],
  [['uniforme'], 'checkroom'],
  [['tarea', 'tareas'], 'assignment'],
];

function iconoParaRubro(nombre) {
  const n = (nombre || '').toLowerCase();
  for (const [palabras, icono] of PALABRAS_A_ICONO) {
    if (palabras.some((p) => n.includes(p))) return icono;
  }
  return 'star';
}

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

function hoyLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// En un rubro diario la fecha es parte de la llave; en uno de periodo va null.
function fechaActual() {
  return esDiario ? document.getElementById('fecha-rubro').value : null;
}

function actualizarContador() {
  const total = alumnos.length;
  const calificados = Object.values(calificacionPorAlumno).filter((v) => v !== null && v !== '').length;
  document.getElementById('contador-calificados').textContent = esDiario
    ? `${calificados} de ${total} alumnos calificados este día`
    : `${calificados} de ${total} alumnos calificados`;
}

function renderTabla() {
  const tbody = document.getElementById('tabla-alumnos-body');
  const columnas = esDiario ? 3 : 2;

  if (alumnos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columnas}" class="py-6 px-6 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>`;
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${columnas}" class="py-6 px-6 text-center text-on-surface-variant">Ningún alumno coincide con la búsqueda.</td></tr>`;
    return;
  }

  tbody.innerHTML = visibles.map((a, i) => {
    const valor = calificacionPorAlumno[a.id] ?? '';
    const prom = promedioPorAlumno[a.id];
    const celdaPromedio = esDiario
      ? `<td class="py-3 px-6 font-body-md text-body-md text-on-surface-variant">${prom ? `${prom.valor.toFixed(1)} <span class="text-xs">(${prom.dias} día${prom.dias === 1 ? '' : 's'})</span>` : '—'}</td>`
      : '';
    return `
      <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
        <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
        <td class="py-3 px-6">
          <input type="number" min="0" max="10" step="0.1" class="input-calificacion w-24 px-3 py-2 rounded-DEFAULT border border-outline-variant transition-colors" data-alumno="${a.id}" value="${valor}" placeholder="—"/>
        </td>
        ${celdaPromedio}
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.input-calificacion').forEach((el) => {
    el.addEventListener('input', () => {
      calificacionPorAlumno[el.dataset.alumno] = el.value;
      actualizarContador();
    });
  });

  actualizarContador();
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderTabla();
});

async function cargarAlumnos() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return false;
  }

  alumnos = (alumnosData || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return true;
}

async function cargarCalificaciones() {
  // Un rubro diario trae todas sus fechas: las del dia elegido van a los
  // campos y el resto sirve para el promedio de la ultima columna.
  // De mil en mil: Supabase no devuelve mas por consulta y un rubro diario
  // de un semestre los pasa.
  const calificaciones = [];
  for (let desde = 0; ; desde += 1000) {
    const { data: pagina, error: errorCalif } = await supabase
      .from('calificaciones_rubro')
      .select('alumno_id, calificacion, fecha')
      .eq('rubro_id', rubroId)
      .order('id', { ascending: true })
      .range(desde, desde + 999);
    if (errorCalif) {
      mostrarError(`No se pudieron cargar las calificaciones: ${errorCalif.message}`);
      return;
    }
    calificaciones.push(...(pagina || []));
    if (!pagina || pagina.length < 1000) break;
  }

  const fecha = fechaActual();
  calificacionPorAlumno = {};
  promedioPorAlumno = {};
  const suma = {};
  const dias = new Set();

  calificaciones.forEach((c) => {
    if ((c.fecha ?? null) === fecha) calificacionPorAlumno[c.alumno_id] = c.calificacion ?? '';
    if (esDiario && c.fecha && c.calificacion !== null) {
      dias.add(c.fecha);
      const s = (suma[c.alumno_id] ||= { total: 0, dias: 0 });
      s.total += Number(c.calificacion);
      s.dias += 1;
    }
  });

  if (esDiario) {
    Object.entries(suma).forEach(([id, s]) => { promedioPorAlumno[id] = { valor: s.total / s.dias, dias: s.dias }; });
    document.getElementById('dias-rubro').textContent = dias.size
      ? `${dias.size} día(s) calificados hasta ahora. El rubro vale el promedio de esos días.`
      : 'Todavía no hay días calificados.';
  }

  renderTabla();
}

document.getElementById('fecha-rubro').addEventListener('change', () => {
  document.getElementById('error-box').classList.add('hidden');
  document.getElementById('ok-box').classList.add('hidden');
  cargarCalificaciones();
});

document.getElementById('btn-guardar-calificaciones').addEventListener('click', async () => {
  const fecha = fechaActual();
  if (esDiario && !fecha) {
    mostrarError('Elige el día que estás calificando');
    return;
  }

  // En un rubro diario solo se guardan los alumnos que tienen numero ese dia:
  // un renglon vacio no aporta nada y solo ensuciaria el conteo de dias.
  const filas = alumnos
    .map((a) => ({
      rubro_id: rubroId,
      alumno_id: a.id,
      fecha,
      calificacion: calificacionPorAlumno[a.id] === '' || calificacionPorAlumno[a.id] == null ? null : parseFloat(calificacionPorAlumno[a.id]),
    }))
    .filter((f) => !esDiario || f.calificacion !== null);

  if (esDiario && filas.length === 0) {
    mostrarError('Captura al menos una calificación antes de guardar');
    return;
  }

  const btn = document.getElementById('btn-guardar-calificaciones');
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = 'Guardando...';

  const { error } = await supabase.from('calificaciones_rubro').upsert(filas, { onConflict: 'rubro_id,alumno_id,fecha' });

  // Si en un dia ya guardado se borro el numero de algun alumno, se quita su
  // renglon de ese dia para que no siga contando en el promedio.
  let errorBorrar = null;
  if (!error && esDiario) {
    const vacios = alumnos
      .filter((a) => calificacionPorAlumno[a.id] === '')
      .map((a) => a.id);
    if (vacios.length) {
      ({ error: errorBorrar } = await supabase.from('calificaciones_rubro')
        .delete().eq('rubro_id', rubroId).eq('fecha', fecha).in('alumno_id', vacios));
    }
  }

  btn.disabled = false;
  btn.textContent = textoOriginal;

  if (error || errorBorrar) {
    mostrarError(`No se pudo guardar: ${(error || errorBorrar).message}`);
    return;
  }

  mostrarOk(esDiario ? 'Calificaciones del día guardadas.' : 'Calificaciones guardadas.');
  if (esDiario) await cargarCalificaciones();
});

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  if (!rubroId) {
    mostrarError('Falta el id del rubro en la URL');
    return;
  }

  const { data: rubro, error } = await supabase
    .from('rubros_evaluacion')
    .select('id, nombre, grupo_id, frecuencia')
    .eq('id', rubroId)
    .maybeSingle();

  if (error || !rubro) {
    mostrarError('No se pudo cargar este rubro (o no tienes permiso sobre él)');
    return;
  }

  grupoId = rubro.grupo_id;
  esDiario = rubro.frecuencia === 'diario';

  document.getElementById('rubro-titulo').textContent = rubro.nombre;
  document.getElementById('rubro-info').textContent = esDiario ? 'Rubro diario' : 'Rubro personalizado';
  document.getElementById('icono-rubro').textContent = iconoParaRubro(rubro.nombre);
  document.getElementById('link-volver').href = `rubros.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${rubro.nombre}`;

  if (esDiario) {
    // display por estilo y no con la clase hidden: en las paginas con el CDN
    // de Tailwind, hidden junto a flex no se respeta.
    document.getElementById('bloque-fecha-rubro').style.display = '';
    document.getElementById('th-promedio').style.display = '';
    document.getElementById('fecha-rubro').value = hoyLocal();
    document.getElementById('btn-guardar-calificaciones').textContent = 'Guardar calificaciones del día';
  }

  if (await cargarAlumnos()) await cargarCalificaciones();
}

init();
