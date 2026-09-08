import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';

const params = new URLSearchParams(window.location.search);
const grupoId = params.get('id');

const ETIQUETAS_FICHA = { verde: 'Verde', azul: 'Azul', roja: 'Roja', blanca: 'Blanca', negra: 'Negra' };
const COLORES_FICHA = { verde: '#2c694e', azul: '#0b5fae', roja: '#ba1a1a', blanca: '#ffffff', negra: '#191c21' };

let modoParticipacion = 'simple';
let valoresFicha = { verde: 1, azul: 2, roja: 5, blanca: 10 };
let alumnos = []; // [{id, nombre}]
let totales = {}; // { alumno_id: suma de participaciones }
let periodos = []; // [{id, nombre}]
let fichasHoyPorAlumno = {}; // { alumno_id: [{id, tipo_ficha, valor}] } — de la fecha seleccionada
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

function hoyLocal() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

// ================= MODO SIMPLE =================

async function cargarModoSimple() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  alumnos = (alumnosData || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const periodoId = document.getElementById('simple-periodo').value || null;
  let consulta = supabase.from('participacion_simple').select('alumno_id, calificacion').eq('grupo_id', grupoId);
  consulta = periodoId ? consulta.eq('periodo_id', periodoId) : consulta.is('periodo_id', null);
  const { data: calificaciones, error: errorCalif } = await consulta;

  if (errorCalif) {
    mostrarError(`No se pudieron cargar las calificaciones: ${errorCalif.message}`);
    return;
  }

  const calificacionPorAlumno = {};
  (calificaciones || []).forEach((c) => { calificacionPorAlumno[c.alumno_id] = c.calificacion ?? ''; });

  const tbody = document.getElementById('tabla-simple-body');
  if (alumnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="py-6 px-6 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>';
    return;
  }

  tbody.innerHTML = alumnos.map((a, i) => `
    <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
      <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
      <td class="py-3 px-6">
        <input type="number" min="0" max="10" step="0.1" class="input-simple w-24 px-3 py-2 rounded-DEFAULT border border-outline-variant focus:border-2 transition-colors" style="border-color:#c2c6d4;" onfocus="this.style.borderColor='#d02b2f'" onblur="this.style.borderColor='#c2c6d4'" data-alumno="${a.id}" value="${calificacionPorAlumno[a.id] ?? ''}" placeholder="—"/>
      </td>
    </tr>`).join('');
}

document.getElementById('simple-periodo').addEventListener('change', cargarModoSimple);

document.getElementById('btn-guardar-simple').addEventListener('click', async () => {
  const periodoId = document.getElementById('simple-periodo').value || null;
  const filas = [...document.querySelectorAll('.input-simple')].map((el) => ({
    grupo_id: grupoId,
    alumno_id: el.dataset.alumno,
    periodo_id: periodoId,
    calificacion: el.value === '' ? null : parseFloat(el.value),
  }));

  const btn = document.getElementById('btn-guardar-simple');
  btn.disabled = true;

  const { error } = await supabase.from('participacion_simple').upsert(filas, { onConflict: 'grupo_id,alumno_id,periodo_id' });

  btn.disabled = false;

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  mostrarOk('Calificaciones de participación guardadas.');
});

// ================= MODO FICHAS =================

function renderLeyenda() {
  const cont = document.getElementById('leyenda-fichas');
  const orden = ['verde', 'azul', 'roja', 'blanca', 'negra'];
  cont.innerHTML = orden.map((t) => {
    const valorTexto = t === 'negra' ? 'x2 (tú decides)' : `= ${valoresFicha[t]}`;
    return `<span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full inline-block border border-outline-variant" style="background:${COLORES_FICHA[t]}"></span> ${ETIQUETAS_FICHA[t]} ${valorTexto}</span>`;
  }).join('');
}

function botonFicha(tipo, alumnoId) {
  const esBlanca = tipo === 'blanca';
  const esNegra = tipo === 'negra';
  const contenido = esNegra ? '×2' : valoresFicha[tipo];
  const bg = esBlanca ? '#ffffff' : COLORES_FICHA[tipo];
  return `
    <div class="flex flex-col items-center">
      <button class="btn-ficha ficha-chip ${esBlanca ? 'ficha-chip--blanca' : ''}" data-tipo="${tipo}" data-alumno="${alumnoId}" style="background:${bg};" title="${ETIQUETAS_FICHA[tipo]}${esNegra ? ' (multiplicador)' : ''}">
        <span>${contenido}</span>
      </button>
      <span class="ficha-caption">${ETIQUETAS_FICHA[tipo]}</span>
    </div>`;
}

async function cargarAlumnosYTotales() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  alumnos = (alumnosData || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: participaciones, error: errorPart } = await supabase
    .from('participaciones')
    .select('alumno_id, valor')
    .eq('grupo_id', grupoId);

  if (errorPart) {
    mostrarError(`No se pudieron cargar los totales: ${errorPart.message}`);
    return;
  }

  totales = {};
  (participaciones || []).forEach((p) => {
    totales[p.alumno_id] = (totales[p.alumno_id] || 0) + Number(p.valor);
  });

  await cargarFichasHoy();
  renderLista();
}

async function cargarFichasHoy() {
  const fecha = document.getElementById('fecha-participacion').value;
  const { data, error } = await supabase
    .from('participaciones')
    .select('id, alumno_id, tipo_ficha, valor')
    .eq('grupo_id', grupoId)
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  if (error) {
    mostrarError(`No se pudo cargar el detalle del día: ${error.message}`);
    return;
  }

  fichasHoyPorAlumno = {};
  (data || []).forEach((p) => {
    (fichasHoyPorAlumno[p.alumno_id] ||= []).push(p);
  });
}

function renderLista() {
  const cont = document.getElementById('lista-alumnos');

  if (alumnos.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</p>';
    return;
  }

  const filtro = terminoBusqueda.trim().toLowerCase();
  const visibles = filtro ? alumnos.filter((a) => a.nombre.toLowerCase().includes(filtro)) : alumnos;

  if (visibles.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Ningún alumno coincide con la búsqueda.</p>';
    return;
  }

  cont.innerHTML = visibles.map((a, i) => {
    const fichasHoy = fichasHoyPorAlumno[a.id] || [];
    const tagsHoy = fichasHoy.length ? `
      <div class="flex flex-wrap gap-1.5 mt-2 w-full">
        ${fichasHoy.map((f) => `
          <span class="inline-flex items-center gap-1 text-xs pl-2 pr-1 py-1 rounded-full border border-outline-variant bg-surface" style="color:${f.tipo_ficha === 'blanca' ? '#3a3b3e' : COLORES_FICHA[f.tipo_ficha]};">
            <span class="w-2 h-2 rounded-full inline-block" style="background:${COLORES_FICHA[f.tipo_ficha]}; border:1px solid #c2c6d4;"></span>
            +${f.valor}
            <button class="btn-quitar-ficha-hoy hover:bg-error-container rounded-full p-0.5 transition-colors" data-id="${f.id}" data-alumno="${a.id}" data-valor="${f.valor}" title="Quitar esta ficha" aria-label="Quitar">
              <span class="material-symbols-outlined text-sm" style="font-size:14px;">close</span>
            </button>
          </span>`).join('')}
      </div>` : '';

    return `
    <div class="card-hover bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 flex items-center justify-between gap-4 flex-wrap" style="animation: popIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.05}s both;">
      <div class="flex flex-col flex-1 min-w-[160px]">
        <div class="flex items-center gap-3">
          <span class="font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</span>
          <span class="bg-surface-container-high text-on-surface-variant text-sm px-3 py-1 rounded-full">${totales[a.id] || 0} pts</span>
        </div>
        ${tagsHoy}
      </div>
      <div class="flex gap-3 flex-wrap items-start">
        ${['verde', 'azul', 'roja', 'blanca', 'negra'].map((t) => botonFicha(t, a.id)).join('')}
      </div>
    </div>`;
  }).join('');

  cont.querySelectorAll('.btn-ficha').forEach((btn) => {
    btn.addEventListener('click', () => otorgarFicha(btn.dataset.alumno, btn.dataset.tipo));
  });

  cont.querySelectorAll('.btn-quitar-ficha-hoy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { error } = await supabase.from('participaciones').delete().eq('id', btn.dataset.id);
      if (error) {
        alert(`No se pudo quitar: ${error.message}`);
        return;
      }
      const alumnoId = btn.dataset.alumno;
      totales[alumnoId] = (totales[alumnoId] || 0) - Number(btn.dataset.valor);
      fichasHoyPorAlumno[alumnoId] = (fichasHoyPorAlumno[alumnoId] || []).filter((f) => f.id !== btn.dataset.id);
      renderLista();
    });
  });
}

document.getElementById('buscador-alumnos').addEventListener('input', (e) => {
  terminoBusqueda = e.target.value;
  renderLista();
});

async function otorgarFicha(alumnoId, tipo) {
  const fecha = document.getElementById('fecha-participacion').value;
  let valor = valoresFicha[tipo];
  let nota = null;

  if (tipo === 'negra') {
    const respuesta = window.prompt('Ficha negra — multiplicador fijo x2. Escribe cuántos puntos otorgar en total (tú decides cómo aplicarlo):');
    if (respuesta === null) return;
    valor = parseFloat(respuesta);
    if (isNaN(valor)) {
      alert('Escribe un número válido');
      return;
    }
    nota = 'Multiplicador x2 aplicado manualmente';
  }

  const { data: nuevaFicha, error } = await supabase
    .from('participaciones')
    .insert({ grupo_id: grupoId, alumno_id: alumnoId, fecha, tipo_ficha: tipo, valor, nota })
    .select()
    .single();

  if (error) {
    mostrarError(`No se pudo registrar: ${error.message}`);
    return;
  }

  totales[alumnoId] = (totales[alumnoId] || 0) + valor;
  (fichasHoyPorAlumno[alumnoId] ||= []).push(nuevaFicha);
  renderLista();
  mostrarOk(`Ficha ${ETIQUETAS_FICHA[tipo].toLowerCase()} registrada.`);

  if (!document.getElementById('registro-container').classList.contains('hidden')) await cargarRegistro();
}

async function cargarRegistro() {
  const cont = document.getElementById('registro-container');
  const fecha = document.getElementById('fecha-participacion').value;
  cont.innerHTML = '<p class="text-on-surface-variant">Cargando...</p>';

  const { data, error } = await supabase
    .from('participaciones')
    .select('id, alumno_id, tipo_ficha, valor, nota, alumnos(nombre)')
    .eq('grupo_id', grupoId)
    .eq('fecha', fecha)
    .order('created_at', { ascending: false });

  if (error) {
    cont.innerHTML = `<p class="text-error">No se pudo cargar el registro: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant">Sin registros en esta fecha.</p>';
    return;
  }

  cont.innerHTML = data.map((p) => `
    <div class="flex items-center justify-between gap-4 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-3">
      <div class="flex items-center gap-3">
        <span class="w-3 h-3 rounded-full inline-block border border-outline-variant" style="background:${COLORES_FICHA[p.tipo_ficha]}"></span>
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(p.alumnos?.nombre || '')}</span>
        <span class="text-on-surface-variant text-sm">${ETIQUETAS_FICHA[p.tipo_ficha]} · +${p.valor}${p.nota ? ` · ${escapeHtml(p.nota)}` : ''}</span>
      </div>
      <button class="btn-deshacer text-error hover:bg-error-container p-2 rounded-full transition-colors" data-id="${p.id}" data-alumno="${p.alumno_id}" data-valor="${p.valor}" aria-label="Deshacer">
        <span class="material-symbols-outlined text-lg">undo</span>
      </button>
    </div>`).join('');

  cont.querySelectorAll('.btn-deshacer').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { error: errorBorrar } = await supabase.from('participaciones').delete().eq('id', btn.dataset.id);
      if (errorBorrar) { alert(`No se pudo deshacer: ${errorBorrar.message}`); return; }
      totales[btn.dataset.alumno] = (totales[btn.dataset.alumno] || 0) - Number(btn.dataset.valor);
      renderLista();
      await cargarRegistro();
    });
  });
}

document.getElementById('btn-toggle-registro').addEventListener('click', async () => {
  const cont = document.getElementById('registro-container');
  const oculto = cont.classList.contains('hidden');
  document.getElementById('valores-container').classList.add('hidden');
  document.getElementById('corte-container').classList.add('hidden');

  if (oculto) {
    await cargarRegistro();
    cont.classList.remove('hidden');
    cont.classList.add('flex');
  } else {
    cont.classList.add('hidden');
    cont.classList.remove('flex');
  }
});

// -------- Editar valores de las fichas --------

document.getElementById('btn-toggle-valores').addEventListener('click', () => {
  const cont = document.getElementById('valores-container');
  document.getElementById('registro-container').classList.add('hidden');
  document.getElementById('corte-container').classList.add('hidden');

  const oculto = cont.classList.contains('hidden');
  if (oculto) {
    renderEditorValores();
    cont.classList.remove('hidden');
  } else {
    cont.classList.add('hidden');
  }
});

function renderEditorValores() {
  const cont = document.getElementById('valores-lista');
  cont.innerHTML = ['verde', 'azul', 'roja', 'blanca'].map((t) => `
    <div class="flex flex-col">
      <label class="font-label-lg text-label-lg text-on-surface mb-2">${ETIQUETAS_FICHA[t]}</label>
      <input type="number" min="0" step="0.5" class="input-valor-ficha px-4 py-3 rounded-DEFAULT border border-outline-variant bg-surface focus:border-primary focus:ring-2 focus:ring-primary-fixed outline-none font-body-md text-body-md text-on-surface transition-colors" data-tipo="${t}" value="${valoresFicha[t]}"/>
    </div>`).join('');
}

document.getElementById('btn-guardar-valores').addEventListener('click', async () => {
  const nuevos = { ...valoresFicha };
  document.querySelectorAll('.input-valor-ficha').forEach((el) => {
    nuevos[el.dataset.tipo] = parseFloat(el.value) || 0;
  });

  const { error } = await supabase.from('grupos').update({ valores_fichas: nuevos }).eq('id', grupoId);

  if (error) {
    mostrarError(`No se pudo guardar: ${error.message}`);
    return;
  }

  valoresFicha = nuevos;
  renderLeyenda();
  renderLista();
  mostrarOk('Valores de las fichas actualizados (aplica a partir de ahora, no cambia lo ya registrado).');
});

// -------- Corte --------

document.getElementById('btn-toggle-corte').addEventListener('click', async () => {
  const cont = document.getElementById('corte-container');
  document.getElementById('registro-container').classList.add('hidden');
  document.getElementById('valores-container').classList.add('hidden');

  const oculto = cont.classList.contains('hidden');
  if (oculto) {
    await abrirCorte();
    cont.classList.remove('hidden');
  } else {
    cont.classList.add('hidden');
  }
});

async function abrirCorte() {
  const ranking = alumnos
    .map((a) => ({ nombre: a.nombre, puntos: totales[a.id] || 0 }))
    .sort((a, b) => b.puntos - a.puntos);

  document.getElementById('ranking-lista').innerHTML = ranking.map((r, i) => `
    <div class="flex items-center justify-between px-4 py-2 rounded-DEFAULT ${i === 0 ? 'bg-primary-fixed' : 'bg-surface-container-high'}">
      <span class="font-body-md text-body-md text-on-surface">${i + 1}. ${escapeHtml(r.nombre)}</span>
      <span class="font-label-lg text-label-lg text-on-surface">${r.puntos} pts</span>
    </div>`).join('') || '<p class="text-on-surface-variant">Sin alumnos.</p>';

  const sugerido = ranking.length ? (ranking[Math.floor(ranking.length / 2)] || ranking[0]).puntos : 0;
  document.getElementById('corte-media').value = sugerido;

  await mostrarUltimoCorte();
}

async function mostrarUltimoCorte() {
  const periodoId = document.getElementById('corte-periodo').value || null;
  let consulta = supabase.from('cortes_participacion').select('fecha, media, created_at').eq('grupo_id', grupoId);
  consulta = periodoId ? consulta.eq('periodo_id', periodoId) : consulta.is('periodo_id', null);
  const { data: ultimoCorte } = await consulta.order('created_at', { ascending: false }).limit(1).maybeSingle();

  document.getElementById('ultimo-corte-info').textContent = ultimoCorte
    ? `Último corte de este periodo: ${ultimoCorte.fecha} con referencia de ${ultimoCorte.media} pts.`
    : 'Aún no se ha hecho corte para este periodo.';
}

document.getElementById('corte-periodo')?.addEventListener('change', mostrarUltimoCorte);

document.getElementById('btn-aplicar-corte').addEventListener('click', async () => {
  const media = parseFloat(document.getElementById('corte-media').value);
  const periodoId = document.getElementById('corte-periodo').value || null;
  if (!media || media <= 0) {
    mostrarError('Escribe un valor de referencia mayor a cero');
    return;
  }

  const confirmado = window.confirm(`¿Aplicar corte con referencia de ${media} puntos? Esto guarda la calificación de participación de todos como una foto fija de este momento.`);
  if (!confirmado) return;

  const btn = document.getElementById('btn-aplicar-corte');
  btn.disabled = true;

  try {
    const { data: corte, error: errorCorte } = await supabase
      .from('cortes_participacion')
      .insert({ grupo_id: grupoId, media, periodo_id: periodoId })
      .select()
      .single();

    if (errorCorte) throw errorCorte;

    const filas = alumnos.map((a) => {
      const puntos = totales[a.id] || 0;
      const calificacion = Math.min(10, Math.round((puntos / media) * 10 * 10) / 10);
      return { corte_id: corte.id, alumno_id: a.id, puntos_al_momento: puntos, calificacion };
    });

    if (filas.length > 0) {
      const { error: errorFilas } = await supabase.from('calificaciones_corte_participacion').insert(filas);
      if (errorFilas) throw errorFilas;
    }

    mostrarOk('Corte aplicado. Las calificaciones finales ya usan este resultado para participación.');
    await abrirCorte();
  } catch (err) {
    mostrarError(err.message || 'No se pudo aplicar el corte');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('fecha-participacion').addEventListener('change', async () => {
  await cargarFichasHoy();
  renderLista();
  if (!document.getElementById('registro-container').classList.contains('hidden')) await cargarRegistro();
});

// ================= MODO DIARIO =================

let alumnosDiario = [];
let totalesDiario = {};
let valoresHoyDiario = {}; // { alumno_id: string del input }

async function cargarDiario() {
  const { data: alumnosData, error: errorAlumnos } = await supabase
    .from('grupo_alumnos')
    .select('alumnos(id, nombre)')
    .eq('grupo_id', grupoId);

  if (errorAlumnos) {
    mostrarError(`No se pudieron cargar los alumnos: ${errorAlumnos.message}`);
    return;
  }

  alumnosDiario = (alumnosData || []).map((row) => row.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const { data: todas, error: errorTodas } = await supabase
    .from('participaciones')
    .select('alumno_id, valor')
    .eq('grupo_id', grupoId)
    .eq('tipo_ficha', 'diario');

  if (errorTodas) {
    mostrarError(`No se pudieron cargar los totales: ${errorTodas.message}`);
    return;
  }

  totalesDiario = {};
  (todas || []).forEach((p) => { totalesDiario[p.alumno_id] = (totalesDiario[p.alumno_id] || 0) + Number(p.valor); });

  await cargarValoresDeHoy();
}

async function cargarValoresDeHoy() {
  const fecha = document.getElementById('diario-fecha').value;
  const { data, error } = await supabase
    .from('participaciones')
    .select('alumno_id, valor')
    .eq('grupo_id', grupoId)
    .eq('tipo_ficha', 'diario')
    .eq('fecha', fecha);

  if (error) {
    mostrarError(`No se pudo cargar el registro de esta fecha: ${error.message}`);
    return;
  }

  valoresHoyDiario = {};
  (data || []).forEach((p) => { valoresHoyDiario[p.alumno_id] = String(p.valor); });

  renderDiario();
}

function renderDiario() {
  const tbody = document.getElementById('tabla-diario-body');

  if (alumnosDiario.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="py-6 px-6 text-center text-on-surface-variant">Este grupo todavía no tiene alumnos inscritos.</td></tr>';
    return;
  }

  tbody.innerHTML = alumnosDiario.map((a, i) => `
    <tr class="border-t border-outline-variant hover:bg-surface-bright transition-colors" style="animation: fadeIn 0.4s ease-out ${i * 0.03}s both;">
      <td class="py-3 px-6 font-body-md text-body-md text-on-surface">${escapeHtml(a.nombre)}</td>
      <td class="py-3 px-6">
        <span class="bg-surface-container-high text-on-surface-variant text-sm px-3 py-1 rounded-full">${totalesDiario[a.id] || 0} pts</span>
      </td>
      <td class="py-3 px-6">
        <input type="number" min="0" step="0.5" class="input-valor-diario w-24 px-3 py-2 rounded-DEFAULT border border-outline-variant transition-colors" data-alumno="${a.id}" value="${valoresHoyDiario[a.id] ?? ''}" placeholder="—"/>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.input-valor-diario').forEach((el) => {
    el.addEventListener('input', () => { valoresHoyDiario[el.dataset.alumno] = el.value; });
  });
}

document.getElementById('diario-fecha').addEventListener('change', cargarValoresDeHoy);

document.getElementById('btn-guardar-diario').addEventListener('click', async () => {
  const fecha = document.getElementById('diario-fecha').value;
  const btn = document.getElementById('btn-guardar-diario');
  btn.disabled = true;

  try {
    for (const a of alumnosDiario) {
      const valorTexto = valoresHoyDiario[a.id];

      // Primero se borra lo que ya hubiera ese día para ese alumno (para que
      // "guardar" reemplace el valor del día, en vez de ir sumando cada vez
      // que le das clic — como en Asistencia).
      const { error: errorBorrar } = await supabase
        .from('participaciones')
        .delete()
        .eq('grupo_id', grupoId)
        .eq('alumno_id', a.id)
        .eq('tipo_ficha', 'diario')
        .eq('fecha', fecha);
      if (errorBorrar) throw errorBorrar;

      if (valorTexto !== undefined && valorTexto !== '') {
        const { error: errorInsertar } = await supabase
          .from('participaciones')
          .insert({ grupo_id: grupoId, alumno_id: a.id, fecha, tipo_ficha: 'diario', valor: parseFloat(valorTexto) });
        if (errorInsertar) throw errorInsertar;
      }
    }

    mostrarOk('Registro del día guardado.');
    await cargarDiario();
  } catch (err) {
    mostrarError(err.message || 'No se pudo guardar el registro');
  } finally {
    btn.disabled = false;
  }
});

// -------- Corte (modo diario) --------

document.getElementById('btn-toggle-corte-diario').addEventListener('click', async () => {
  const cont = document.getElementById('corte-diario-container');
  const oculto = cont.classList.contains('hidden');
  if (oculto) {
    await abrirCorteDiario();
    cont.classList.remove('hidden');
  } else {
    cont.classList.add('hidden');
  }
});

async function abrirCorteDiario() {
  const ranking = alumnosDiario
    .map((a) => ({ nombre: a.nombre, puntos: totalesDiario[a.id] || 0 }))
    .sort((a, b) => b.puntos - a.puntos);

  document.getElementById('ranking-diario-lista').innerHTML = ranking.map((r, i) => `
    <div class="flex items-center justify-between px-4 py-2 rounded-DEFAULT ${i === 0 ? 'bg-primary-fixed' : 'bg-surface-container-high'}">
      <span class="font-body-md text-body-md text-on-surface">${i + 1}. ${escapeHtml(r.nombre)}</span>
      <span class="font-label-lg text-label-lg text-on-surface">${r.puntos} pts</span>
    </div>`).join('') || '<p class="text-on-surface-variant">Sin alumnos.</p>';

  const sugerido = ranking.length ? (ranking[Math.floor(ranking.length / 2)] || ranking[0]).puntos : 0;
  document.getElementById('corte-diario-media').value = sugerido;

  await mostrarUltimoCorteDiario();
}

async function mostrarUltimoCorteDiario() {
  const periodoId = document.getElementById('diario-periodo').value || null;
  let consulta = supabase.from('cortes_participacion').select('fecha, media, created_at').eq('grupo_id', grupoId);
  consulta = periodoId ? consulta.eq('periodo_id', periodoId) : consulta.is('periodo_id', null);
  const { data: ultimoCorte } = await consulta.order('created_at', { ascending: false }).limit(1).maybeSingle();

  document.getElementById('ultimo-corte-diario-info').textContent = ultimoCorte
    ? `Último corte de este periodo: ${ultimoCorte.fecha} con referencia de ${ultimoCorte.media} pts.`
    : 'Aún no se ha hecho corte para este periodo.';
}

document.getElementById('diario-periodo')?.addEventListener('change', mostrarUltimoCorteDiario);

document.getElementById('btn-aplicar-corte-diario').addEventListener('click', async () => {
  const media = parseFloat(document.getElementById('corte-diario-media').value);
  const periodoId = document.getElementById('diario-periodo').value || null;
  if (!media || media <= 0) {
    mostrarError('Escribe un valor de referencia mayor a cero');
    return;
  }

  const confirmado = window.confirm(`¿Aplicar corte con referencia de ${media} puntos? Esto guarda la calificación de participación de todos como una foto fija de este momento.`);
  if (!confirmado) return;

  const btn = document.getElementById('btn-aplicar-corte-diario');
  btn.disabled = true;

  try {
    const { data: corte, error: errorCorte } = await supabase
      .from('cortes_participacion')
      .insert({ grupo_id: grupoId, media, periodo_id: periodoId })
      .select()
      .single();
    if (errorCorte) throw errorCorte;

    const filas = alumnosDiario.map((a) => {
      const puntos = totalesDiario[a.id] || 0;
      const calificacion = Math.min(10, Math.round((puntos / media) * 10 * 10) / 10);
      return { corte_id: corte.id, alumno_id: a.id, puntos_al_momento: puntos, calificacion };
    });

    if (filas.length > 0) {
      const { error: errorFilas } = await supabase.from('calificaciones_corte_participacion').insert(filas);
      if (errorFilas) throw errorFilas;
    }

    mostrarOk('Corte aplicado. Las calificaciones finales ya usan este resultado para participación.');
    await abrirCorteDiario();
  } catch (err) {
    mostrarError(err.message || 'No se pudo aplicar el corte');
  } finally {
    btn.disabled = false;
  }
});

// ================= INICIO =================

async function cargarPeriodosParticipacion() {
  const { data } = await supabase.from('periodos').select('id, nombre').eq('grupo_id', grupoId).order('orden', { ascending: true });
  periodos = data || [];
  if (periodos.length === 0) return;

  const opciones = '<option value="">Sin periodo (todo el ciclo)</option>' +
    periodos.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');

  const selectSimple = document.getElementById('simple-periodo');
  if (selectSimple) {
    selectSimple.innerHTML = opciones;
    document.getElementById('campo-periodo-simple').classList.remove('hidden');
  }

  const selectCorte = document.getElementById('corte-periodo');
  if (selectCorte) {
    selectCorte.innerHTML = opciones;
    document.getElementById('campo-periodo-corte').classList.remove('hidden');
  }

  const selectDiario = document.getElementById('diario-periodo');
  if (selectDiario) {
    selectDiario.innerHTML = opciones;
    document.getElementById('campo-periodo-diario').classList.remove('hidden');
  }
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
    .select('id, nombre, valores_fichas')
    .eq('id', grupoId)
    .maybeSingle();

  if (error || !grupo) {
    mostrarError('No se pudo cargar este grupo (o no tienes permiso sobre él)');
    return;
  }

  document.getElementById('grupo-nombre').textContent = grupo.nombre;
  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - Participación - ${grupo.nombre}`;

  modoParticipacion = profesor.modo_participacion || 'simple';
  valoresFicha = grupo.valores_fichas || valoresFicha;

  await cargarPeriodosParticipacion();

  if (modoParticipacion === 'fichas') {
    document.getElementById('vista-fichas').classList.remove('hidden');
    document.getElementById('fecha-participacion').value = hoyLocal();
    renderLeyenda();
    await cargarAlumnosYTotales();
  } else if (modoParticipacion === 'diario') {
    document.getElementById('vista-diario').classList.remove('hidden');
    document.getElementById('diario-fecha').value = hoyLocal();
    await cargarDiario();
  } else {
    document.getElementById('vista-simple').classList.remove('hidden');
    await cargarModoSimple();
  }
}

init();