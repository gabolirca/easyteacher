import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

let grupoInfo = null;
let modoParticipacion = 'simple';
let periodos = []; // [{id, nombre}]
let rubrosTodos = []; // [{id, nombre, peso, periodo_id}]
let alumnosGrupo = []; // [{id, nombre}]
let resultadosPorPeriodo = {}; // { periodoKey: filasCalculadas }  ('sin' = sin periodo)
let vistaActual = 'sin'; // 'sin' | 'ciclo' | periodo.id

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

function num(v, decimales = 1) {
  return v === null || v === undefined || isNaN(v) ? null : Math.round(v * 10 ** decimales) / 10 ** decimales;
}

// ---------- Ponderación (pesos fijos: aplican igual en cada periodo) ----------

function pesoRubroInputId(rubroId) {
  return `peso-rubro-${rubroId}`;
}

function rubrosDeVista() {
  if (vistaActual === 'ciclo') return [];
  const periodoId = vistaActual === 'sin' ? null : vistaActual;
  return rubrosTodos.filter((r) => (r.periodo_id || null) === periodoId);
}

function renderPesosRubros() {
  const cont = document.getElementById('pesos-rubros-container');
  const rubros = rubrosDeVista();
  cont.innerHTML = rubros.map((r) => `
    <div class="flex flex-col">
      <label class="font-label-lg text-label-lg text-on-surface mb-2" for="${pesoRubroInputId(r.id)}">${escapeHtml(r.nombre)} (%)</label>
      <input id="${pesoRubroInputId(r.id)}" type="number" min="0" step="1" value="${r.peso}" class="px-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface focus:border-primary focus:ring-2 focus:ring-primary-fixed outline-none font-body-md text-body-md text-on-surface transition-colors"/>
    </div>`).join('');

  cont.querySelectorAll('input').forEach((el) => el.addEventListener('input', actualizarAvisoSuma));
  actualizarAvisoSuma();
}

function actualizarAvisoSuma() {
  let suma = (parseFloat(document.getElementById('peso-examenes').value) || 0)
    + (parseFloat(document.getElementById('peso-tareas').value) || 0)
    + (parseFloat(document.getElementById('peso-participacion').value) || 0);

  rubrosDeVista().forEach((r) => {
    suma += parseFloat(document.getElementById(pesoRubroInputId(r.id))?.value) || 0;
  });

  const aviso = document.getElementById('suma-pesos-aviso');
  const contexto = vistaActual === 'ciclo' ? '' : ' en esta vista';
  aviso.textContent = `Suma actual${contexto}: ${suma}%` + (suma !== 100 ? ' (no es necesario que sea exactamente 100, pero es lo más intuitivo)' : ' ✓');
}

['peso-examenes', 'peso-tareas', 'peso-participacion'].forEach((id) => {
  document.getElementById(id).addEventListener('input', actualizarAvisoSuma);
});

document.getElementById('btn-guardar-pesos').addEventListener('click', async () => {
  const peso_examenes = parseFloat(document.getElementById('peso-examenes').value) || 0;
  const peso_tareas = parseFloat(document.getElementById('peso-tareas').value) || 0;
  const peso_participacion = parseFloat(document.getElementById('peso-participacion').value) || 0;

  const { error } = await supabase
    .from('grupos')
    .update({ peso_examenes, peso_tareas, peso_participacion })
    .eq('id', grupoId);

  if (error) {
    mostrarError(`No se pudo guardar la ponderación: ${error.message}`);
    return;
  }

  for (const r of rubrosDeVista()) {
    const valor = parseFloat(document.getElementById(pesoRubroInputId(r.id))?.value) || 0;
    const { error: errorRubro } = await supabase.from('rubros_evaluacion').update({ peso: valor }).eq('id', r.id);
    if (errorRubro) {
      mostrarError(`No se pudo guardar el peso de "${r.nombre}": ${errorRubro.message}`);
      return;
    }
    r.peso = valor;
  }

  grupoInfo.peso_examenes = peso_examenes;
  grupoInfo.peso_tareas = peso_tareas;
  grupoInfo.peso_participacion = peso_participacion;
  mostrarOk('Ponderación guardada.');
  await recalcularTodo();
});

// ---------- Cálculo por periodo ----------

async function calcularParaPeriodo(periodoId) {
  // periodoId: null (sin periodo / todo el ciclo cuando no hay periodos) o un id de periodo
  let queryIntentos = supabase
    .from('intentos')
    .select('alumno_id, calificacion, examenes!inner(grupo_id, periodo_id)')
    .eq('examenes.grupo_id', grupoId)
    .in('estado', ['entregado', 'bloqueado']);
  queryIntentos = periodoId ? queryIntentos.eq('examenes.periodo_id', periodoId) : queryIntentos.is('examenes.periodo_id', null);
  const { data: intentos, error: errorIntentos } = await queryIntentos;
  if (errorIntentos) throw new Error(`Exámenes: ${errorIntentos.message}`);

  let queryTareas = supabase
    .from('calificaciones_tareas')
    .select('alumno_id, calificacion, tareas!inner(grupo_id, peso_ponderacion, periodo_id)')
    .eq('tareas.grupo_id', grupoId);
  queryTareas = periodoId ? queryTareas.eq('tareas.periodo_id', periodoId) : queryTareas.is('tareas.periodo_id', null);
  const { data: califTareas, error: errorTareas } = await queryTareas;
  if (errorTareas) throw new Error(`Tareas: ${errorTareas.message}`);

  const rubrosPeriodo = rubrosTodos.filter((r) => (r.periodo_id || null) === periodoId);
  const idsRubros = rubrosPeriodo.map((r) => r.id);
  const { data: califRubros, error: errorRubros } = await supabase
    .from('calificaciones_rubro')
    .select('alumno_id, calificacion, rubro_id')
    .in('rubro_id', idsRubros.length ? idsRubros : ['00000000-0000-0000-0000-000000000000']);
  if (errorRubros) throw new Error(`Rubros: ${errorRubros.message}`);

  // Participación
  let participacionPorAlumno = {};
  let maxParticipacion = 0;
  let corteVigente = null;

  if (modoParticipacion === 'simple') {
    let q = supabase.from('participacion_simple').select('alumno_id, calificacion').eq('grupo_id', grupoId);
    q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
    const { data: califSimple, error: errorSimple } = await q;
    if (errorSimple) throw new Error(`Participación: ${errorSimple.message}`);
    (califSimple || []).forEach((c) => { if (c.calificacion !== null) participacionPorAlumno[c.alumno_id] = Number(c.calificacion); });
  } else {
    let qCorte = supabase.from('cortes_participacion').select('id, media').eq('grupo_id', grupoId);
    qCorte = periodoId ? qCorte.eq('periodo_id', periodoId) : qCorte.is('periodo_id', null);
    const { data: ultimoCorte, error: errorCorte } = await qCorte.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (errorCorte) throw new Error(`Corte de participación: ${errorCorte.message}`);

    if (ultimoCorte) {
      const { data: califCorte, error: errorCalifCorte } = await supabase
        .from('calificaciones_corte_participacion')
        .select('alumno_id, puntos_al_momento, calificacion')
        .eq('corte_id', ultimoCorte.id);
      if (errorCalifCorte) throw new Error(`Corte: ${errorCalifCorte.message}`);

      corteVigente = { media: ultimoCorte.media, calificaciones: {} };
      (califCorte || []).forEach((c) => {
        corteVigente.calificaciones[c.alumno_id] = { puntos: Number(c.puntos_al_momento), calificacion: Number(c.calificacion) };
      });
    } else {
      let qPart = supabase.from('participaciones').select('alumno_id, valor').eq('grupo_id', grupoId);
      const { data: participaciones, error: errorPart } = await qPart;
      if (errorPart) throw new Error(`Participación: ${errorPart.message}`);
      (participaciones || []).forEach((p) => {
        participacionPorAlumno[p.alumno_id] = (participacionPorAlumno[p.alumno_id] || 0) + Number(p.valor);
      });
      maxParticipacion = Math.max(0, ...Object.values(participacionPorAlumno));
    }
  }

  const examenesPorAlumno = {};
  (intentos || []).forEach((i) => {
    if (i.calificacion === null) return;
    (examenesPorAlumno[i.alumno_id] ||= []).push(Number(i.calificacion));
  });

  const tareasPorAlumno = {};
  (califTareas || []).forEach((c) => {
    if (c.calificacion === null) return;
    const peso = Number(c.tareas?.peso_ponderacion) || 1;
    (tareasPorAlumno[c.alumno_id] ||= []).push({ calif: Number(c.calificacion), peso });
  });

  const rubroPorAlumno = {};
  (califRubros || []).forEach((c) => {
    if (c.calificacion === null) return;
    rubroPorAlumno[c.rubro_id] ||= {};
    rubroPorAlumno[c.rubro_id][c.alumno_id] = Number(c.calificacion);
  });

  const pesoExamenes = Number(grupoInfo.peso_examenes) || 0;
  const pesoTareas = Number(grupoInfo.peso_tareas) || 0;
  const pesoParticipacion = Number(grupoInfo.peso_participacion) || 0;

  return alumnosGrupo.map((a) => {
    const notasExamenes = examenesPorAlumno[a.id] || [];
    const promExamenes100 = notasExamenes.length ? notasExamenes.reduce((s, v) => s + v, 0) / notasExamenes.length : null;
    const promExamenes = promExamenes100 !== null ? promExamenes100 / 10 : null;

    const notasTareas = tareasPorAlumno[a.id] || [];
    const sumaPesoTareas = notasTareas.reduce((s, t) => s + t.peso, 0);
    const promTareas = sumaPesoTareas > 0 ? notasTareas.reduce((s, t) => s + t.calif * t.peso, 0) / sumaPesoTareas : null;

    let puntosParticipacion = 0;
    let participacionDiez = null;
    let etiquetaParticipacion = '—';

    if (modoParticipacion === 'simple') {
      participacionDiez = participacionPorAlumno[a.id] ?? null;
      etiquetaParticipacion = participacionDiez !== null ? `${num(participacionDiez)}/10` : '—';
    } else if (corteVigente) {
      const c = corteVigente.calificaciones[a.id];
      puntosParticipacion = c?.puntos ?? 0;
      participacionDiez = c ? c.calificacion : null;
      etiquetaParticipacion = c ? `${puntosParticipacion} pts (corte) → ${num(participacionDiez)}/10` : 'Sin corte aplicado';
    } else {
      puntosParticipacion = participacionPorAlumno[a.id] || 0;
      const pct100 = maxParticipacion > 0 ? (puntosParticipacion / maxParticipacion) * 100 : 0;
      participacionDiez = pct100 / 10;
      etiquetaParticipacion = `${puntosParticipacion} pts (${num(participacionDiez)}/10, provisional)`;
    }

    const componentes = [
      { valor: promExamenes, peso: pesoExamenes },
      { valor: promTareas, peso: pesoTareas },
      { valor: participacionDiez, peso: pesoParticipacion },
    ].filter((c) => c.valor !== null);

    const valoresPorRubro = {};
    rubrosPeriodo.forEach((r) => {
      const valor = rubroPorAlumno[r.id]?.[a.id];
      valoresPorRubro[r.id] = valor !== undefined ? num(valor) : null;
      if (valor !== undefined) componentes.push({ valor, peso: Number(r.peso) || 0 });
    });

    const pesoUsado = componentes.reduce((s, c) => s + c.peso, 0);
    const promedioFinal = componentes.length && pesoUsado > 0
      ? componentes.reduce((s, c) => s + c.valor * c.peso, 0) / pesoUsado
      : null;

    return {
      alumnoId: a.id,
      nombre: a.nombre,
      promExamenes: num(promExamenes),
      promTareas: num(promTareas),
      puntosParticipacion,
      participacionDiez: num(participacionDiez),
      etiquetaParticipacion,
      valoresPorRubro,
      rubrosPeriodo,
      promedioFinal: num(promedioFinal),
    };
  });
}

async function recalcularTodo() {
  const contenedor = document.getElementById('tabla-container');
  contenedor.innerHTML = '<p class="p-6 text-on-surface-variant">Calculando...</p>';

  try {
    if (periodos.length === 0) {
      resultadosPorPeriodo = { sin: await calcularParaPeriodo(null) };
      vistaActual = 'sin';
    } else {
      resultadosPorPeriodo = {};
      for (const p of periodos) {
        resultadosPorPeriodo[p.id] = await calcularParaPeriodo(p.id);
      }
    }
  } catch (err) {
    contenedor.innerHTML = `<p class="p-6 text-error">${escapeHtml(err.message || 'No se pudo calcular')}</p>`;
    return;
  }

  renderSelectorPeriodo();
  renderPesosRubros();
  renderVistaActual();
}

// ---------- Selector de vista (Resumen del ciclo / cada Parcial) ----------

function renderSelectorPeriodo() {
  const cont = document.getElementById('selector-periodo-container');
  if (periodos.length === 0) {
    cont.classList.add('hidden');
    return;
  }
  cont.classList.remove('hidden');

  const botones = [{ id: 'ciclo', nombre: 'Resumen del ciclo' }, ...periodos.map((p) => ({ id: p.id, nombre: p.nombre }))];

  cont.innerHTML = botones.map((b) => `
    <button class="btn-vista-periodo px-4 py-2 rounded-full font-label-lg text-label-lg transition-colors ${vistaActual === b.id ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}" data-vista="${b.id}">
      ${escapeHtml(b.nombre)}
    </button>`).join('');

  cont.querySelectorAll('.btn-vista-periodo').forEach((btn) => {
    btn.addEventListener('click', () => {
      vistaActual = btn.dataset.vista;
      renderSelectorPeriodo();
      renderPesosRubros();
      renderVistaActual();
    });
  });
}

function renderVistaActual() {
  if (vistaActual === 'ciclo') {
    renderTablaCiclo();
  } else {
    renderTablaPeriodo(resultadosPorPeriodo[vistaActual] || []);
  }
}

function renderTablaPeriodo(filas) {
  const contenedor = document.getElementById('tabla-container');
  const rubrosPeriodo = filas[0]?.rubrosPeriodo || rubrosDeVista();
  const columnasRubros = rubrosPeriodo.map((r) => `<th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(r.nombre)}</th>`).join('');

  contenedor.innerHTML = `
    <table class="w-full">
      <thead class="bg-surface-container-high">
        <tr>
          <th class="text-left py-3 px-6 font-label-lg text-label-lg text-on-surface">Alumno</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Exámenes (0-10)</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Tareas (0-10)</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Participación</th>
          ${columnasRubros}
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Promedio (0-10)</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map((f, i) => `
          <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
            <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(f.nombre)}</td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.promExamenes ?? '—'}</td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.promTareas ?? '—'}</td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.etiquetaParticipacion}</td>
            ${rubrosPeriodo.map((r) => `<td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.valoresPorRubro[r.id] ?? '—'}</td>`).join('')}
            <td class="py-3 px-6 text-center font-headline-lg-mobile text-on-surface font-bold">${f.promedioFinal ?? '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function promedioCiclo(alumnoId) {
  const valores = periodos
    .map((p) => resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === alumnoId)?.promedioFinal)
    .filter((v) => v !== null && v !== undefined);
  if (valores.length === 0) return null;
  return num(valores.reduce((s, v) => s + v, 0) / valores.length);
}

function renderTablaCiclo() {
  const contenedor = document.getElementById('tabla-container');

  contenedor.innerHTML = `
    <table class="w-full">
      <thead class="bg-surface-container-high">
        <tr>
          <th class="text-left py-3 px-6 font-label-lg text-label-lg text-on-surface">Alumno</th>
          ${periodos.map((p) => `<th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(p.nombre)}</th>`).join('')}
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Promedio del ciclo</th>
        </tr>
      </thead>
      <tbody>
        ${alumnosGrupo.map((a, i) => `
          <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
            <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
            ${periodos.map((p) => {
              const val = resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === a.id)?.promedioFinal;
              return `<td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${val ?? '—'}</td>`;
            }).join('')}
            <td class="py-3 px-6 text-center font-headline-lg-mobile text-on-surface font-bold">${promedioCiclo(a.id) ?? '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ---------- Exportar a Excel ----------

document.getElementById('btn-exportar').addEventListener('click', () => {
  if (!window.XLSX) {
    mostrarError('No se pudo cargar la librería de Excel. Revisa que calificaciones.html incluya el <script> de xlsx en el <head> y que tengas internet.');
    return;
  }

  const libro = window.XLSX.utils.book_new();

  if (periodos.length === 0) {
    const filas = resultadosPorPeriodo.sin || [];
    const rubrosPeriodo = filas[0]?.rubrosPeriodo || [];
    const datos = filas.map((f) => {
      const fila = {
        Alumno: f.nombre,
        'Examenes (0-10)': f.promExamenes ?? '',
        'Tareas (0-10)': f.promTareas ?? '',
        'Participacion (0-10)': f.participacionDiez ?? '',
        'Detalle Participacion': f.etiquetaParticipacion,
      };
      rubrosPeriodo.forEach((r) => { fila[r.nombre] = f.valoresPorRubro[r.id] ?? ''; });
      fila['Promedio Final (0-10)'] = f.promedioFinal ?? '';
      return fila;
    });
    window.XLSX.utils.book_append_sheet(libro, window.XLSX.utils.json_to_sheet(datos), 'Calificaciones');
  } else {
    periodos.forEach((p) => {
      const filas = resultadosPorPeriodo[p.id] || [];
      const rubrosPeriodo = filas[0]?.rubrosPeriodo || [];
      const datos = filas.map((f) => {
        const fila = {
          Alumno: f.nombre,
          'Examenes (0-10)': f.promExamenes ?? '',
          'Tareas (0-10)': f.promTareas ?? '',
          'Participacion (0-10)': f.participacionDiez ?? '',
        };
        rubrosPeriodo.forEach((r) => { fila[r.nombre] = f.valoresPorRubro[r.id] ?? ''; });
        fila['Promedio (0-10)'] = f.promedioFinal ?? '';
        return fila;
      });
      const nombreHoja = p.nombre.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Periodo';
      window.XLSX.utils.book_append_sheet(libro, window.XLSX.utils.json_to_sheet(datos), nombreHoja);
    });

    const resumen = alumnosGrupo.map((a) => {
      const fila = { Alumno: a.nombre };
      periodos.forEach((p) => {
        fila[p.nombre] = resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === a.id)?.promedioFinal ?? '';
      });
      fila['Promedio del ciclo'] = promedioCiclo(a.id) ?? '';
      return fila;
    });
    window.XLSX.utils.book_append_sheet(libro, window.XLSX.utils.json_to_sheet(resumen), 'Resumen');
  }

  const nombreGrupo = (grupoInfo?.nombre || 'grupo').replace(/[^a-z0-9]+/gi, '_');
  window.XLSX.writeFile(libro, `calificaciones_${nombreGrupo}.xlsx`);
});

// ---------- Inicio ----------

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;

  modoParticipacion = profesor.modo_participacion || 'simple';

  if (!grupoId) {
    mostrarError('Falta el id del grupo en la URL');
    return;
  }

  const { data: grupo, error } = await supabase
    .from('grupos')
    .select('id, nombre, peso_examenes, peso_tareas, peso_participacion')
    .eq('id', grupoId)
    .maybeSingle();

  if (error || !grupo) {
    mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)');
    return;
  }

  grupoInfo = grupo;
  document.getElementById('grupo-nombre').textContent = grupo.nombre;
  document.getElementById('link-volver').href = `grupo.html?id=${grupoId}`;
  document.getElementById('link-rubros').href = `rubros.html?id=${grupoId}`;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Calificaciones - ${grupo.nombre}`;

  document.getElementById('peso-examenes').value = grupo.peso_examenes;
  document.getElementById('peso-tareas').value = grupo.peso_tareas;
  document.getElementById('peso-participacion').value = grupo.peso_participacion;

  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }
  alumnosGrupo = (alumnosData || []).map((r) => r.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: periodosData } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });
  periodos = periodosData || [];
  vistaActual = periodos.length > 0 ? 'ciclo' : 'sin';

  const { data: rubrosData, error: errorRubros } = await supabase
    .from('rubros_evaluacion')
    .select('id, nombre, peso, periodo_id')
    .eq('grupo_id', grupoId)
    .order('created_at', { ascending: true });
  if (!errorRubros) rubrosTodos = rubrosData || [];

  await recalcularTodo();
}

init();