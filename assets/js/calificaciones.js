import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

let grupoInfo = null;
let modoParticipacion = 'simple';
let etiquetas = { examenes: 'Exámenes', tareas: 'Tareas', participacion: 'Participación' };
let periodos = []; // [{id, nombre}]
let rubrosTodos = []; // [{id, nombre, peso, periodo_id}]
let alumnosGrupo = []; // [{id, nombre}]
let resultadosPorPeriodo = {}; // { periodoKey: filasCalculadas }  ('sin' = sin periodo)
let vistaActual = 'sin'; // 'sin' | 'ciclo' | periodo.id
let profesorId = null;
let filaEnAjuste = null;
let filaEnCaptura = null;

function claveDePeriodo(periodoId) {
  return periodoId || 'sin';
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


// Puntos de participacion acumulados en el modo Clase en vivo.
// Solo cuentan las participaciones APROBADAS de sesiones ya CERRADAS: una
// clase abierta todavia puede cambiar, y un reclamo pendiente no es un punto.
async function puntosDeSesiones(periodoId) {
  let q = supabase.from('sesiones').select('id').eq('grupo_id', grupoId).eq('estado', 'cerrada');
  q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
  const { data: ses, error: errSes } = await q;
  if (errSes) throw new Error(`Sesiones: ${errSes.message}`);
  if (!ses || ses.length === 0) return {};

  const { data: acts, error: errAct } = await supabase
    .from('actividades_sesion').select('id').in('sesion_id', ses.map((x) => x.id));
  if (errAct) throw new Error(`Actividades: ${errAct.message}`);
  if (!acts || acts.length === 0) return {};

  const { data: parts, error: errPart } = await supabase
    .from('participaciones_sesion').select('alumno_id, puntos')
    .eq('estado', 'aprobada').in('actividad_id', acts.map((x) => x.id));
  if (errPart) throw new Error(`Participaciones: ${errPart.message}`);

  const acumulado = {};
  (parts || []).forEach((x) => {
    acumulado[x.alumno_id] = (acumulado[x.alumno_id] || 0) + Number(x.puntos || 0);
  });
  return acumulado;
}

async function calcularParaPeriodo(periodoId) {
  // periodoId: null (sin periodo / todo el ciclo cuando no hay periodos) o un id de periodo
  const filtroExamenes = periodoId ? { col: 'examenes.periodo_id', val: periodoId } : null;

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
  // Paginado: un rubro diario junta un renglon por alumno por dia y rebasa
  // pronto el tope de mil que devuelve Supabase por consulta.
  const califRubros = [];
  for (let desde = 0; idsRubros.length; desde += 1000) {
    const { data: pagina, error: errorRubros } = await supabase
      .from('calificaciones_rubro')
      .select('alumno_id, calificacion, rubro_id')
      .in('rubro_id', idsRubros)
      .order('id', { ascending: true })
      .range(desde, desde + 999);
    if (errorRubros) throw new Error(`Rubros: ${errorRubros.message}`);
    califRubros.push(...(pagina || []));
    if (!pagina || pagina.length < 1000) break;
  }

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
    } else if (modoParticipacion === 'sesiones') {
      // Clase en vivo: los puntos vienen de las sesiones cerradas del periodo.
      participacionPorAlumno = await puntosDeSesiones(periodoId);
      maxParticipacion = Math.max(0, ...Object.values(participacionPorAlumno));
    } else {
      // Las fichas que ya se llevo un corte no vuelven a contar aqui, igual
      // que en el ranking de la pantalla de participacion.
      let qPart = supabase.from('participaciones').select('alumno_id, valor')
        .eq('grupo_id', grupoId).is('cerrada_en', null);
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

  // Un rubro de periodo tiene una calificacion por alumno; uno diario tiene
  // una por dia. En los dos casos el rubro vale el promedio de lo capturado
  // (en el de periodo es un promedio de un solo numero).
  const sumaRubro = {};
  (califRubros || []).forEach((c) => {
    if (c.calificacion === null) return;
    const s = ((sumaRubro[c.rubro_id] ||= {})[c.alumno_id] ||= { total: 0, n: 0 });
    s.total += Number(c.calificacion);
    s.n += 1;
  });
  const rubroPorAlumno = {};
  Object.entries(sumaRubro).forEach(([rid, porAlumno]) => {
    rubroPorAlumno[rid] = {};
    Object.entries(porAlumno).forEach(([aid, s]) => { rubroPorAlumno[rid][aid] = s.total / s.n; });
  });

  // Ajustes manuales del maestro. No sustituyen el calculo: se guardan aparte
  // y solo se aplican al final, dejando ver el promedio calculado original.
  let qAjustes = supabase.from('ajustes_calificacion')
    .select('alumno_id, promedio_ajustado, motivo').eq('grupo_id', grupoId);
  qAjustes = periodoId ? qAjustes.eq('periodo_id', periodoId) : qAjustes.is('periodo_id', null);
  const { data: ajustes, error: errorAjustes } = await qAjustes;
  if (errorAjustes) throw new Error(`Ajustes: ${errorAjustes.message}`);
  const ajustePorAlumno = {};
  (ajustes || []).forEach((x) => { ajustePorAlumno[x.alumno_id] = x; });

  // Calificacion de examenes capturada a mano. Algunos maestros traian su
  // registro en papel de antes de que existiera el sistema, y Examenes era el
  // unico componente que no se podia escribir. Tampoco pisa el calculo: el
  // promedio de los examenes presentados en la app se sigue viendo al lado.
  let qCapturas = supabase.from('examenes_capturados')
    .select('alumno_id, calificacion, nota').eq('grupo_id', grupoId);
  qCapturas = periodoId ? qCapturas.eq('periodo_id', periodoId) : qCapturas.is('periodo_id', null);
  const { data: capturas, error: errorCapturas } = await qCapturas;
  if (errorCapturas) throw new Error(`${etiquetas.examenes} capturados: ${errorCapturas.message}`);
  const capturaPorAlumno = {};
  (capturas || []).forEach((c) => { capturaPorAlumno[c.alumno_id] = c; });

  const pesoExamenes = Number(grupoInfo.peso_examenes) || 0;
  const pesoTareas = Number(grupoInfo.peso_tareas) || 0;
  const pesoParticipacion = Number(grupoInfo.peso_participacion) || 0;

  return alumnosGrupo.map((a) => {
    const notasExamenes = examenesPorAlumno[a.id] || [];
    const promExamenes100 = notasExamenes.length ? notasExamenes.reduce((s, v) => s + v, 0) / notasExamenes.length : null;
    const promExamenesApp = promExamenes100 !== null ? promExamenes100 / 10 : null;

    // Si el maestro capturo la calificacion a mano, esa es la que cuenta.
    const cap = capturaPorAlumno[a.id];
    const examenCapturado = cap
      ? { valor: num(Number(cap.calificacion)), nota: cap.nota || '' }
      : null;
    const promExamenes = examenCapturado ? examenCapturado.valor : promExamenesApp;

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

    const calculado = num(promedioFinal);
    const aj = ajustePorAlumno[a.id];
    const ajuste = aj ? { valor: num(Number(aj.promedio_ajustado)), motivo: aj.motivo } : null;

    return {
      alumnoId: a.id,
      nombre: a.nombre,
      promExamenes: num(promExamenes),
      promExamenesApp: num(promExamenesApp),
      examenCapturado,
      examenesPresentados: notasExamenes.length,
      promTareas: num(promTareas),
      puntosParticipacion,
      participacionDiez: num(participacionDiez),
      etiquetaParticipacion,
      valoresPorRubro,
      rubrosPeriodo,
      promedioCalculado: calculado,
      ajuste,
      promedioFinal: ajuste ? ajuste.valor : calculado,
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

  // Con varios rubros la tabla se pasa del ancho de la pantalla. Va dentro de
  // un carril con scroll horizontal, y la columna del alumno se queda fija
  // para no perder de vista de quien es el renglon al deslizar.
  contenedor.innerHTML = `
    <div class="overflow-x-auto">
    <table class="w-full min-w-max">
      <thead class="bg-surface-container-high">
        <tr>
          <th class="text-left py-3 px-6 font-label-lg text-label-lg text-on-surface bg-surface-container-high" style="position:sticky;left:0;z-index:2;">Alumno</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(etiquetas.examenes)} (0-10)</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(etiquetas.tareas)} (0-10)</th>
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(etiquetas.participacion)}</th>
          ${columnasRubros}
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Promedio (0-10)</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map((f, i) => `
          <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
            <td class="py-3 px-6 font-body-md text-body-md text-on-surface bg-surface-container-lowest" style="position:sticky;left:0;z-index:1;">${escapeHtml(f.nombre)}</td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">
              <div class="flex items-center justify-center gap-2">
                <span class="${f.examenCapturado ? 'text-primary font-bold' : ''}">${f.promExamenes ?? '—'}</span>
                <button class="btn-capturar-examen text-on-surface-variant hover:text-primary" data-alumno="${f.alumnoId}" title="Capturar a mano">
                  <span class="material-symbols-outlined" style="font-size:18px;">edit_note</span>
                </button>
              </div>
              ${f.examenCapturado
                ? `<p class="text-sm text-primary mt-1"${f.examenCapturado.nota ? ` title="${escapeHtml(f.examenCapturado.nota)}"` : ''}>capturado${f.promExamenesApp !== null ? ` · app: ${f.promExamenesApp}` : ''}</p>`
                : ''}
            </td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.promTareas ?? '—'}</td>
            <td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.etiquetaParticipacion}</td>
            ${rubrosPeriodo.map((r) => `<td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${f.valoresPorRubro[r.id] ?? '—'}</td>`).join('')}
            <td class="py-3 px-6 text-center">
              <div class="flex items-center justify-center gap-2">
                <span class="font-headline-lg-mobile font-bold ${f.ajuste ? 'text-primary' : 'text-on-surface'}">${f.promedioFinal ?? '—'}</span>
                <button class="btn-ajustar text-on-surface-variant hover:text-primary" data-alumno="${f.alumnoId}" title="Ajustar calificación">
                  <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
                </button>
              </div>
              ${f.ajuste ? `<p class="text-sm text-primary mt-1" title="${escapeHtml(f.ajuste.motivo)}">ajustado · calculado: ${f.promedioCalculado ?? '—'}</p>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>`;

  contenedor.querySelectorAll('.btn-ajustar').forEach((b) => {
    b.addEventListener('click', () => abrirAjuste(b.dataset.alumno));
  });

  contenedor.querySelectorAll('.btn-capturar-examen').forEach((b) => {
    b.addEventListener('click', () => abrirCaptura(b.dataset.alumno));
  });
}

// ---------- Ajuste manual del promedio ----------
// Existe porque el sistema puede equivocarse: un examen que no reconocio una
// respuesta valida, un bloqueo injusto. El ajuste NO reescribe el calculo:
// se guarda aparte, con motivo y autor, y la pantalla sigue mostrando cual
// era el promedio calculado. Asi la correccion es visible, no un borron.

function periodoDeLaVista() {
  return vistaActual === 'sin' || vistaActual === 'ciclo' ? null : vistaActual;
}

function abrirAjuste(alumnoId) {
  const filas = resultadosPorPeriodo[vistaActual] || [];
  const f = filas.find((x) => x.alumnoId === alumnoId);
  if (!f) return;
  filaEnAjuste = f;
  document.getElementById('ajuste-alumno').textContent = f.nombre;
  document.getElementById('ajuste-calculado').textContent = f.promedioCalculado ?? '—';
  document.getElementById('ajuste-valor').value = f.ajuste ? f.ajuste.valor : (f.promedioCalculado ?? '');
  document.getElementById('ajuste-motivo').value = f.ajuste ? f.ajuste.motivo : '';
  document.getElementById('btn-quitar-ajuste').classList.toggle('hidden', !f.ajuste);
  document.getElementById('dialogo-ajuste').style.display = 'flex';
}

function cerrarAjuste() {
  filaEnAjuste = null;
  document.getElementById('dialogo-ajuste').style.display = 'none';
}

async function guardarAjuste() {
  if (!filaEnAjuste) return;
  const valor = parseFloat(document.getElementById('ajuste-valor').value);
  const motivo = document.getElementById('ajuste-motivo').value.trim();

  if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
    mostrarError('La calificación debe ser un número entre 0 y 10');
    return;
  }
  if (motivo.length < 3) {
    mostrarError('Escribe el motivo del ajuste. Queda registrado junto con la calificación.');
    return;
  }

  const btn = document.getElementById('btn-guardar-ajuste');
  btn.disabled = true;
  try {
    const periodoId = periodoDeLaVista();
    // Borrar y volver a insertar: los indices unicos son parciales (por el
    // caso "sin periodo"), asi que un upsert normal no los aprovecharia.
    let q = supabase.from('ajustes_calificacion').delete()
      .eq('grupo_id', grupoId).eq('alumno_id', filaEnAjuste.alumnoId);
    q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
    const { error: errorBorrar } = await q;
    if (errorBorrar) throw new Error(errorBorrar.message);

    const { error } = await supabase.from('ajustes_calificacion').insert({
      grupo_id: grupoId,
      alumno_id: filaEnAjuste.alumnoId,
      periodo_id: periodoId,
      promedio_ajustado: valor,
      motivo,
      ajustado_por: profesorId,
    });
    if (error) throw new Error(error.message);

    cerrarAjuste();
    mostrarOk('Calificación ajustada. Queda marcada como tal en pantalla y en el Excel.');
    await recalcularTodo();
  } catch (e) {
    mostrarError(`No se pudo guardar el ajuste: ${e.message}`);
  } finally { btn.disabled = false; }
}

async function quitarAjuste() {
  if (!filaEnAjuste) return;
  if (!window.confirm('¿Quitar el ajuste y volver al promedio calculado?')) return;
  try {
    const periodoId = periodoDeLaVista();
    let q = supabase.from('ajustes_calificacion').delete()
      .eq('grupo_id', grupoId).eq('alumno_id', filaEnAjuste.alumnoId);
    q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
    const { error } = await q;
    if (error) throw new Error(error.message);
    cerrarAjuste();
    mostrarOk('Ajuste eliminado.');
    await recalcularTodo();
  } catch (e) {
    mostrarError(`No se pudo quitar: ${e.message}`);
  }
}

document.getElementById('btn-guardar-ajuste')?.addEventListener('click', guardarAjuste);
document.getElementById('btn-quitar-ajuste')?.addEventListener('click', quitarAjuste);
document.getElementById('btn-cancelar-ajuste')?.addEventListener('click', cerrarAjuste);

// ---------- Captura manual de Examenes ----------
// Varios maestros llevaban su registro en papel mientras el sistema se
// terminaba. Tareas y los rubros siempre se pudieron escribir a mano; este
// era el unico componente que no. Lo capturado manda sobre lo calculado,
// pero el promedio de los examenes presentados en la app se sigue mostrando
// para que se vea que no se borro nada.

function abrirCaptura(alumnoId) {
  const filas = resultadosPorPeriodo[vistaActual] || [];
  const f = filas.find((x) => x.alumnoId === alumnoId);
  if (!f) return;
  filaEnCaptura = f;
  document.getElementById('captura-titulo').textContent = `Capturar ${etiquetas.examenes}`;
  document.getElementById('captura-alumno').textContent = f.nombre;
  document.getElementById('captura-app').textContent = f.promExamenesApp !== null
    ? `${f.promExamenesApp} (promedio de ${f.examenesPresentados} presentado${f.examenesPresentados === 1 ? '' : 's'} en la app)`
    : 'Sin exámenes presentados en la app';
  document.getElementById('captura-valor').value = f.examenCapturado ? f.examenCapturado.valor : '';
  document.getElementById('captura-nota').value = f.examenCapturado ? f.examenCapturado.nota : '';
  document.getElementById('btn-quitar-captura').classList.toggle('hidden', !f.examenCapturado);
  document.getElementById('dialogo-captura').style.display = 'flex';
}

function cerrarCaptura() {
  filaEnCaptura = null;
  document.getElementById('dialogo-captura').style.display = 'none';
}

async function guardarCaptura() {
  if (!filaEnCaptura) return;
  const valor = parseFloat(document.getElementById('captura-valor').value);
  const nota = document.getElementById('captura-nota').value.trim();

  if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
    mostrarError('La calificación debe ser un número entre 0 y 10');
    return;
  }

  const btn = document.getElementById('btn-guardar-captura');
  btn.disabled = true;
  try {
    const periodoId = periodoDeLaVista();
    // Borrar y reinsertar: los indices unicos son parciales por el caso
    // "sin periodo", asi que un upsert normal no los aprovecharia.
    let q = supabase.from('examenes_capturados').delete()
      .eq('grupo_id', grupoId).eq('alumno_id', filaEnCaptura.alumnoId);
    q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
    const { error: errorBorrar } = await q;
    if (errorBorrar) throw new Error(errorBorrar.message);

    const { error } = await supabase.from('examenes_capturados').insert({
      grupo_id: grupoId,
      alumno_id: filaEnCaptura.alumnoId,
      periodo_id: periodoId,
      calificacion: valor,
      nota: nota || null,
      capturado_por: profesorId,
    });
    if (error) throw new Error(error.message);

    cerrarCaptura();
    mostrarOk(`${etiquetas.examenes} capturado. Queda marcado como tal en pantalla y en el Excel.`);
    await recalcularTodo();
  } catch (e) {
    mostrarError(`No se pudo guardar: ${e.message}`);
  } finally { btn.disabled = false; }
}

async function quitarCaptura() {
  if (!filaEnCaptura) return;
  if (!window.confirm('¿Quitar la calificación capturada y volver a la que calcula el sistema?')) return;
  try {
    const periodoId = periodoDeLaVista();
    let q = supabase.from('examenes_capturados').delete()
      .eq('grupo_id', grupoId).eq('alumno_id', filaEnCaptura.alumnoId);
    q = periodoId ? q.eq('periodo_id', periodoId) : q.is('periodo_id', null);
    const { error } = await q;
    if (error) throw new Error(error.message);
    cerrarCaptura();
    mostrarOk('Calificación capturada eliminada.');
    await recalcularTodo();
  } catch (e) {
    mostrarError(`No se pudo quitar: ${e.message}`);
  }
}

document.getElementById('btn-guardar-captura')?.addEventListener('click', guardarCaptura);
document.getElementById('btn-quitar-captura')?.addEventListener('click', quitarCaptura);
document.getElementById('btn-cancelar-captura')?.addEventListener('click', cerrarCaptura);

// Promedio del ciclo.
//
// Antes era el promedio simple de los parciales: todos valian igual. En la
// escuela no es asi — el primero vale 25, el segundo 30 y el tercero el resto.
// Si el grupo tiene pesos puestos se pondera; si estan todos en cero se sigue
// usando el promedio simple de siempre, para no cambiarle la calificacion a
// ningun grupo que ya venia trabajando.
//
// Se normaliza entre los parciales que SI tienen calificacion: a un alumno que
// llego a mitad del ciclo no se le cuenta como cero el parcial que no cursó.
function hayPesosDePeriodo() {
  return periodos.some((p) => (Number(p.peso) || 0) > 0);
}

function promedioCiclo(alumnoId) {
  const partes = periodos
    .map((p) => ({
      peso: Number(p.peso) || 0,
      valor: resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === alumnoId)?.promedioFinal,
    }))
    .filter((x) => x.valor !== null && x.valor !== undefined);

  if (partes.length === 0) return null;

  if (!hayPesosDePeriodo()) {
    return num(partes.reduce((s, x) => s + x.valor, 0) / partes.length);
  }

  const pesoUsado = partes.reduce((s, x) => s + x.peso, 0);
  if (pesoUsado <= 0) return null;
  return num(partes.reduce((s, x) => s + x.valor * x.peso, 0) / pesoUsado);
}

function renderTablaCiclo() {
  const contenedor = document.getElementById('tabla-container');
  const ponderado = hayPesosDePeriodo();

  contenedor.innerHTML = `
    <div class="p-6 border-b border-outline-variant">
      <h3 class="font-label-lg text-label-lg text-on-surface mb-1">Cuánto vale cada parcial (%)</h3>
      <p class="font-body-md text-body-md text-on-surface-variant mb-3">
        Déjalos todos en 0 y el promedio del ciclo es el promedio simple de los parciales.
        En cuanto pongas uno, se pondera.
      </p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        ${periodos.map((p) => `
          <div class="flex flex-col">
            <label class="font-label-lg text-label-lg text-on-surface mb-2" for="peso-periodo-${p.id}">${escapeHtml(p.nombre)}</label>
            <input id="peso-periodo-${p.id}" type="number" min="0" step="1" value="${Number(p.peso) || 0}"
                   class="px-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface focus:border-primary focus:ring-2 focus:ring-primary-fixed outline-none font-body-md text-body-md text-on-surface transition-colors"/>
          </div>`).join('')}
      </div>
      <div class="flex flex-wrap items-center gap-4 mt-3">
        <button id="btn-guardar-pesos-periodo" class="bg-primary-container text-on-primary-container font-button-text text-button-text rounded-full py-3 px-6 hover:bg-primary hover:text-on-primary transition-colors">Guardar</button>
        <p id="suma-pesos-periodo" class="font-body-md text-body-md text-on-surface-variant"></p>
      </div>
    </div>

    <div class="overflow-x-auto">
    <table class="w-full min-w-max">
      <thead class="bg-surface-container-high">
        <tr>
          <th class="text-left py-3 px-6 font-label-lg text-label-lg text-on-surface bg-surface-container-high" style="position:sticky;left:0;z-index:2;">Alumno</th>
          ${periodos.map((p) => {
            const peso = Number(p.peso) || 0;
            return `<th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">${escapeHtml(p.nombre)}${ponderado ? `<span class="block font-body-md text-on-surface-variant" style="font-size:12px;">${peso}%</span>` : ''}</th>`;
          }).join('')}
          <th class="text-center py-3 px-6 font-label-lg text-label-lg text-on-surface">Promedio del ciclo</th>
        </tr>
      </thead>
      <tbody>
        ${alumnosGrupo.map((a, i) => `
          <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
            <td class="py-3 px-6 font-body-md text-body-md text-on-surface bg-surface-container-lowest" style="position:sticky;left:0;z-index:1;">${escapeHtml(a.nombre)}</td>
            ${periodos.map((p) => {
              const val = resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === a.id)?.promedioFinal;
              return `<td class="py-3 px-6 text-center font-body-md text-body-md text-on-surface-variant">${val ?? '—'}</td>`;
            }).join('')}
            <td class="py-3 px-6 text-center font-headline-lg-mobile text-on-surface font-bold">${promedioCiclo(a.id) ?? '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>`;

  const sumaPesos = () => {
    const total = periodos.reduce((s, p) =>
      s + (parseFloat(document.getElementById(`peso-periodo-${p.id}`)?.value) || 0), 0);
    const el = document.getElementById('suma-pesos-periodo');
    if (el) {
      el.textContent = total === 0
        ? 'Todos en 0: se usa el promedio simple.'
        : `Suma: ${total}%` + (total === 100 ? ' ✓' : ' (no tiene que dar 100, se reparte en proporción)');
    }
  };

  periodos.forEach((p) => {
    document.getElementById(`peso-periodo-${p.id}`)?.addEventListener('input', sumaPesos);
  });
  sumaPesos();

  document.getElementById('btn-guardar-pesos-periodo')?.addEventListener('click', guardarPesosDePeriodo);
}

async function guardarPesosDePeriodo() {
  const btn = document.getElementById('btn-guardar-pesos-periodo');
  btn.disabled = true;
  try {
    for (const p of periodos) {
      const valor = parseFloat(document.getElementById(`peso-periodo-${p.id}`)?.value) || 0;
      if (valor < 0) throw new Error(`El peso de "${p.nombre}" no puede ser negativo`);
      const { error } = await supabase.from('periodos').update({ peso: valor }).eq('id', p.id);
      if (error) throw new Error(error.message);
      p.peso = valor;
    }
    mostrarOk('Listo. El promedio del ciclo ya usa estos pesos.');
    renderVistaActual();
  } catch (e) {
    mostrarError(`No se pudo guardar: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
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
        [`${etiquetas.examenes} (0-10)`]: f.promExamenes ?? '',
        [`${etiquetas.tareas} (0-10)`]: f.promTareas ?? '',
        [`${etiquetas.participacion} (0-10)`]: f.participacionDiez ?? '',
        [`Detalle ${etiquetas.participacion}`]: f.etiquetaParticipacion,
      };
      rubrosPeriodo.forEach((r) => { fila[r.nombre] = f.valoresPorRubro[r.id] ?? ''; });
      fila['Promedio Final (0-10)'] = f.promedioFinal ?? '';
      fila['Calculado por el sistema'] = f.promedioCalculado ?? '';
      fila['Motivo del ajuste'] = f.ajuste ? f.ajuste.motivo : '';
      fila[`${etiquetas.examenes} capturado a mano`] = f.examenCapturado ? 'Sí' : '';
      fila[`${etiquetas.examenes} calculado por la app`] = f.examenCapturado ? (f.promExamenesApp ?? '') : '';
      fila['Nota de la captura'] = f.examenCapturado ? f.examenCapturado.nota : '';
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
          [`${etiquetas.examenes} (0-10)`]: f.promExamenes ?? '',
          [`${etiquetas.tareas} (0-10)`]: f.promTareas ?? '',
          [`${etiquetas.participacion} (0-10)`]: f.participacionDiez ?? '',
        };
        rubrosPeriodo.forEach((r) => { fila[r.nombre] = f.valoresPorRubro[r.id] ?? ''; });
        fila['Promedio (0-10)'] = f.promedioFinal ?? '';
        fila['Calculado por el sistema'] = f.promedioCalculado ?? '';
        fila['Motivo del ajuste'] = f.ajuste ? f.ajuste.motivo : '';
        fila[`${etiquetas.examenes} capturado a mano`] = f.examenCapturado ? 'Sí' : '';
        fila[`${etiquetas.examenes} calculado por la app`] = f.examenCapturado ? (f.promExamenesApp ?? '') : '';
        fila['Nota de la captura'] = f.examenCapturado ? f.examenCapturado.nota : '';
        return fila;
      });
      const nombreHoja = p.nombre.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Periodo';
      window.XLSX.utils.book_append_sheet(libro, window.XLSX.utils.json_to_sheet(datos), nombreHoja);
    });

    const ponderado = hayPesosDePeriodo();
    const resumen = alumnosGrupo.map((a) => {
      const fila = { Alumno: a.nombre };
      periodos.forEach((p) => {
        // Si el ciclo esta ponderado, el encabezado dice cuanto vale cada
        // parcial: si no, quien abre el Excel no puede reproducir el promedio.
        const col = ponderado ? `${p.nombre} (${Number(p.peso) || 0}%)` : p.nombre;
        fila[col] = resultadosPorPeriodo[p.id]?.find((f) => f.alumnoId === a.id)?.promedioFinal ?? '';
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

  profesorId = profesor.id;
  modoParticipacion = profesor.modo_participacion || 'simple';
  etiquetas = {
    examenes: profesor.etiqueta_examenes || 'Exámenes',
    tareas: profesor.etiqueta_tareas || 'Tareas',
    participacion: profesor.etiqueta_participacion || 'Participación',
  };
  document.getElementById('etiqueta-label-examenes').textContent = etiquetas.examenes;
  document.getElementById('etiqueta-label-tareas').textContent = etiquetas.tareas;
  document.getElementById('etiqueta-label-participacion').textContent = etiquetas.participacion;

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

  const { data: periodosData } = await supabase.from('periodos').select('id, nombre, peso').eq('grupo_id', grupoId).order('orden', { ascending: true });
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