import { supabase, SUPABASE_URL } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

// ---------- Estado ----------

let examenInfo = null;
let intentoId = null;
let preguntas = [];
let indiceActual = 0;
let respuestasEstado = {};      // { pregunta_id: valor-según-tipo }
let enviando = false;           // hay una entrega en curso (o en cola de reintentos)
let examenTerminado = false;    // ya se confirmó entrega/bloqueo: ignorar todo
let usaFullscreen = false;      // ¿de verdad logramos entrar a pantalla completa?
let deteccionActiva = false;
let pausadoPorAviso = false;    // hay un modal encima: no contar salidas

let advertencias = 0;
let advertenciasLocales = 0;  // cuenta que sigue corriendo aunque no haya red
let maxAdvertencias = 1;
let eventosOffline = [];        // salidas detectadas sin red (no cuentan, solo se registran)

let cronometroInterval = null;
let finTs = null;               // momento de cierre, en ms del reloj del SERVIDOR
let desfaseReloj = 0;           // reloj servidor − reloj del dispositivo

// Ventana después de un cambio de conectividad en la que NO se cuenta ninguna
// salida. Cuando el wifi de la escuela se cae, el sistema operativo levanta su
// propia alerta ("no hay internet", "inicia sesión en la red") encima del
// navegador: eso dispara blur/visibilitychange sin que el alumno haya hecho
// nada malo. Ésta era la causa principal de los bloqueos injustos.
const VENTANA_RED_MS = 10000;
let ultimoCambioRed = 0;

// El teclado en pantalla y algunos menús nativos también roban el foco un
// instante; ignoramos blur justo después de tocar un campo.
let ultimoFocoInput = 0;

const LS_PREFIX = 'aulafacil_examen_';

// Se muestra en la pantalla de entrada para saber de un vistazo que version
// esta corriendo el dispositivo. Subirla junto con VERSION en sw.js.
const VERSION_APP = 'v6';

// ---------- Utilidades ----------

const VISTAS = [
  'vista-login', 'vista-entrada', 'vista-examen',
  'vista-enviando', 'vista-bloqueo', 'vista-entregado', 'vista-error',
];

function mostrarVista(id) {
  VISTAS.forEach((v) => {
    const el = document.getElementById(v);
    if (el) el.classList.toggle('hidden', v !== id);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function mostrarErrorFatal(mensaje) {
  const el = document.getElementById('error-mensaje');
  if (el) el.textContent = mensaje;
  mostrarVista('vista-error');
}

function ahoraServidor() {
  return Date.now() + desfaseReloj;
}

// fetch con límite de tiempo: en una red mala, una petición puede quedarse
// colgada para siempre y dejar al alumno mirando una pantalla congelada.
async function fetchConTiempo(url, opciones, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

// ---------- Persistencia local ----------
// Todo lo que el alumno contesta se guarda en el propio dispositivo al
// instante. Si se cae la red, se recarga la página, se muere la batería o el
// navegador cierra la pestaña, las respuestas siguen ahí.

function claveLocal() {
  return LS_PREFIX + intentoId;
}

function guardarLocal(extra = {}) {
  if (!intentoId) return;
  try {
    const previo = leerLocal() || {};
    localStorage.setItem(claveLocal(), JSON.stringify({
      ...previo,
      respuestas: respuestasEstado,
      indice: indiceActual,
      eventosOffline,
      advertenciasLocales,
      actualizado: new Date().toISOString(),
      ...extra,
    }));
  } catch { /* modo privado o almacenamiento lleno: seguimos sin persistencia */ }
}

function leerLocal() {
  if (!intentoId) return null;
  try {
    const raw = localStorage.getItem(claveLocal());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function limpiarLocal() {
  try { localStorage.removeItem(claveLocal()); } catch { /* noop */ }
}

// ---------- Conectividad ----------

// Solo se perdona una salida cuando coincide con un CAMBIO reciente de
// conectividad: eso es la alerta del sistema ("no hay internet", "inicia
// sesion en la red") tapando el navegador, que era la causa de los bloqueos
// injustos en la escuela.
//
// Estar sin internet a secas ya NO da inmunidad. Si la diera, bastaria con
// apagar los datos para cambiar de pestana con toda libertad. Sin red la
// salida se cuenta igual, solo que en el dispositivo, y se sincroniza con el
// servidor al recuperar senal o al entregar.
function esParpadeoDeRed() {
  return (Date.now() - ultimoCambioRed) < VENTANA_RED_MS;
}

function pintarEstadoRed() {
  const banner = document.getElementById('banner-offline');
  if (!banner) return;
  banner.classList.toggle('hidden', navigator.onLine);
}

window.addEventListener('offline', () => {
  ultimoCambioRed = Date.now();
  pintarEstadoRed();
});

window.addEventListener('online', () => {
  ultimoCambioRed = Date.now();
  pintarEstadoRed();
  // Si había una entrega esperando, se reintenta de inmediato en cuanto vuelve
  // la señal, sin esperar al siguiente ciclo del backoff.
  if (enviando && !examenTerminado) reintentarYa();
});

// ---------- Autenticación del alumno ----------

async function revisarSesion() {
  pintarEstadoRed();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await cargarExamen();
  } else {
    mostrarVista('vista-login');
  }
}

document.getElementById('form-login-alumno').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('login-error');
  errorBox.classList.add('hidden');

  const usuario = document.getElementById('alumno-usuario').value.trim();
  const password = document.getElementById('alumno-password').value;
  const email = usuario.includes('@') ? usuario : `${usuario.toLowerCase()}@alumnos.easyteacher.app`;

  const btn = document.getElementById('btn-login-alumno');
  btn.disabled = true;

  if (!navigator.onLine) {
    errorBox.textContent = 'Tu dispositivo no tiene conexión. Conéctate al wifi e inténtalo otra vez.';
    errorBox.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorBox.textContent = 'Matrícula/correo o contraseña incorrectos';
    errorBox.classList.remove('hidden');
    btn.disabled = false;
    return;
  }

  await cargarExamen();
});

// ---------- Cargar el examen ----------

async function cargarExamen() {
  if (!token) {
    mostrarErrorFatal('Este link no trae un examen válido.');
    return;
  }

  let data;
  try {
    const resp = await fetchConTiempo(`${SUPABASE_URL}/functions/v1/iniciar-examen`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ token }),
    });
    data = await resp.json();
    if (!resp.ok) {
      mostrarErrorFatal(data.error || 'No se pudo cargar el examen.');
      return;
    }
  } catch {
    mostrarErrorFatal(
      'No se pudo conectar para cargar el examen. Revisa tu conexión y vuelve a entrar al link.'
    );
    return;
  }

  if (data.estado === 'entregado') {
    examenTerminado = true;
    mostrarVista('vista-entregado');
    return;
  }
  if (data.estado === 'bloqueado') {
    examenTerminado = true;
    const resumen = document.getElementById('bloqueo-resumen');
    if (resumen) resumen.textContent = data.motivo || '';
    mostrarVista('vista-bloqueo');
    return;
  }

  examenInfo = data.examen;
  intentoId = data.intento_id;
  preguntas = data.preguntas;
  advertencias = data.advertencias ?? 0;
  advertenciasLocales = advertencias;
  maxAdvertencias = data.max_advertencias ?? 1;

  if (data.servidor_ahora) {
    desfaseReloj = new Date(data.servidor_ahora).getTime() - Date.now();
  }

  // El cronómetro se ancla al servidor: recargar la página ya no regala tiempo.
  const limites = [];
  if (data.intento_inicio && examenInfo.duracion_min) {
    limites.push(new Date(data.intento_inicio).getTime() + examenInfo.duracion_min * 60000);
  }
  if (examenInfo.fecha_cierre) {
    limites.push(new Date(examenInfo.fecha_cierre).getTime());
  }
  finTs = limites.length ? Math.min(...limites) : null;

  // ¿Quedó una entrega a medias (se cayó la red o se cerró el navegador)?
  const guardado = leerLocal();
  if (guardado?.pendiente) {
    respuestasEstado = guardado.respuestas || {};
    eventosOffline = guardado.eventosOffline || [];
    enviando = true;
    mostrarVista('vista-enviando');
    procesarCola(guardado.pendiente);
    return;
  }

  let recuperado = false;
  if (guardado?.respuestas && Object.keys(guardado.respuestas).length > 0) {
    respuestasEstado = guardado.respuestas;
    indiceActual = Math.min(guardado.indice ?? 0, Math.max(0, preguntas.length - 1));
    eventosOffline = guardado.eventosOffline || [];
    // Nunca se pierde una advertencia por recargar: gana la cuenta mas alta.
    advertenciasLocales = Math.max(advertencias, guardado.advertenciasLocales || 0);
    advertencias = advertenciasLocales;
    recuperado = true;
  }

  const tituloEl = document.getElementById('page-title');
  if (tituloEl) tituloEl.textContent = `AulaFácil - ${examenInfo.titulo}`;
  document.getElementById('entrada-titulo').textContent = examenInfo.titulo;
  document.getElementById('entrada-info').textContent =
    `${preguntas.length} pregunta${preguntas.length === 1 ? '' : 's'}` +
    (examenInfo.duracion_min ? ` · ${examenInfo.duracion_min} minutos` : '');

  // Aviso de reglas, redactado con el número real de oportunidades.
  const reglas = document.getElementById('entrada-reglas');
  if (reglas) {
    reglas.textContent = maxAdvertencias > 0
      ? `Si sales de la pantalla del examen recibirás un aviso. ` +
        `A la ${maxAdvertencias === 1 ? 'segunda' : `${maxAdvertencias + 1}ª`} vez, ` +
        `tu examen se cierra y se entrega automáticamente. ` +
        `Si se te cae el internet no pasa nada: eso no cuenta como salida.`
      : 'Si sales de la pantalla del examen, se cerrará y se entregará automáticamente.';
  }

  const avisoRecuperado = document.getElementById('entrada-recuperado');
  if (avisoRecuperado) avisoRecuperado.classList.toggle('hidden', !recuperado);

  const btnComenzar = document.getElementById('btn-comenzar');
  if (btnComenzar) {
    btnComenzar.textContent = recuperado ? 'Continuar examen' : 'Comenzar examen';
  }

  const avisoPrevias = document.getElementById('entrada-advertencias');
  if (avisoPrevias) {
    const restantes = Math.max(0, maxAdvertencias - advertencias);
    avisoPrevias.classList.toggle('hidden', advertencias === 0);
    avisoPrevias.textContent = advertencias > 0
      ? `Ya llevas ${advertencias} aviso${advertencias === 1 ? '' : 's'}. ` +
        `Te queda${restantes === 1 ? '' : 'n'} ${restantes} oportunidad${restantes === 1 ? '' : 'es'}.`
      : '';
  }

  const versionEl = document.getElementById('entrada-version');
  if (versionEl) versionEl.textContent = VERSION_APP;

  mostrarVista('vista-entrada');
}

// ---------- Comenzar ----------

document.getElementById('btn-comenzar').addEventListener('click', async () => {
  // Si el alumno cerró la pestaña y volvió cuando ya se había acabado el
  // tiempo (o cerró el examen por hora), no se le abre el examen: se entrega
  // directo lo que tenía guardado.
  if (finTs && segundosRestantes() <= 0) {
    entregar(false);
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
    usaFullscreen = true;
  } catch {
    // iPhone (Safari) no soporta pantalla completa. Se continúa igual: se
    // detecta el cambio de app con visibilitychange, que ahí sí funciona.
    usaFullscreen = false;
  }

  if (finTs) iniciarCronometro();

  renderPregunta();
  mostrarVista('vista-examen');
  activarDeteccionSalida();
});

// ---------- Cronómetro ----------

function iniciarCronometro() {
  actualizarCronometroUI();
  if (cronometroInterval) clearInterval(cronometroInterval);
  cronometroInterval = setInterval(() => {
    actualizarCronometroUI();
    if (segundosRestantes() <= 0) {
      clearInterval(cronometroInterval);
      entregar(false); // se acabó el tiempo: entrega normal con lo que haya
    }
  }, 1000);
}

function segundosRestantes() {
  if (!finTs) return Infinity;
  return Math.max(0, Math.round((finTs - ahoraServidor()) / 1000));
}

function actualizarCronometroUI() {
  const el = document.getElementById('cronometro');
  if (!el || !finTs) return;
  const s = segundosRestantes();
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  el.innerHTML = `<span class="material-symbols-outlined text-lg">timer</span> ${mm}:${ss}`;
  el.classList.toggle('text-error', s <= 60);
  el.classList.toggle('text-primary', s > 60);
}

// ---------- Detección de salida ----------

function activarDeteccionSalida() {
  if (deteccionActiva) return;
  deteccionActiva = true;
  document.addEventListener('fullscreenchange', () => onPosibleSalida('fullscreenchange'));
  document.addEventListener('visibilitychange', onCambioVisibilidad);
  window.addEventListener('blur', () => onPosibleSalida('blur'));
  document.addEventListener('focusin', (e) => {
    if (e.target?.matches?.('input, select, textarea')) ultimoFocoInput = Date.now();
  });

  // Refuerzo para iPhone: Safari a veces manda la pagina al bfcache al cambiar
  // de app sin dejar un visibilitychange aprovechable. pagehide/pageshow si
  // llegan, y alimentan la misma medicion de "cuanto estuvo fuera".
  window.addEventListener('pagehide', () => {
    if (!deteccionActiva || examenTerminado || enviando || pausadoPorAviso) return;
    if (tsOculto === null) tsOculto = Date.now();
  });
  window.addEventListener('pageshow', onCambioVisibilidad);
}

let temporizadorSalida = null;
let tsOculto = null;      // momento en que la pagina paso a segundo plano
let ultimaSalidaMs = 0;   // para no contar dos veces el mismo salto

// Cambiar de app o de pestana se mide MIDIENDO AL REGRESAR, no con un
// temporizador.
//
// Motivo: cuando la pagina queda en segundo plano el navegador estrangula los
// setTimeout, y en iOS suspende la pagina por completo. Un setTimeout(700)
// programado al salir puede no ejecutarse nunca; y si el alumno regresa antes,
// se cancela y al evaluarse ya esta todo normal. Resultado: salir y volver
// rapido burlaba la deteccion.
//
// Restar Date.now() al volver usa reloj de pared, asi que funciona aunque el
// navegador haya congelado la pagina entera.
const MIN_OCULTO_MS = 600;

function onCambioVisibilidad() {
  if (!deteccionActiva || examenTerminado || enviando) return;

  // OJO: aqui a proposito NO se ignora pausadoPorAviso. Si el alumno se sale
  // teniendo el modal de advertencia encima, esa salida cuenta igual. Antes
  // no: bastaba con dejar el aviso abierto sin cerrarlo para poder cambiar de
  // app las veces que quisiera sin que se registrara nada.
  // pausadoPorAviso si sigue silenciando fullscreen/blur, que es ruido que
  // genera el propio modal al cerrarse.

  if (document.hidden) {
    tsOculto = Date.now();
    return;
  }

  if (tsOculto === null) return;
  const fuera = Date.now() - tsOculto;
  tsOculto = null;

  // Menos de medio segundo es el parpadeo de un <select> nativo en movil,
  // no el alumno saliendose.
  if (fuera < MIN_OCULTO_MS) return;

  registrarSalida('visibilitychange');
}

function onPosibleSalida(tipo) {
  if (!deteccionActiva || examenTerminado || enviando || pausadoPorAviso) return;

  // blur es la senal mas ruidosa (notificaciones, teclado, alertas del
  // sistema), asi que se confirma con mas calma que las demas.
  const espera = tipo === 'blur' ? 1500 : 700;

  if (temporizadorSalida) clearTimeout(temporizadorSalida);
  temporizadorSalida = setTimeout(() => {
    if (examenTerminado || enviando || pausadoPorAviso) return;

    // Si acaba de tocar un campo de texto, el blur es del teclado: no cuenta.
    if (tipo === 'blur' && Date.now() - ultimoFocoInput < 2000) return;

    // Si la pagina esta oculta, de esto se encarga onCambioVisibilidad cuando
    // el alumno regrese. Aqui solo interesan las salidas con la pagina a la
    // vista: salir de pantalla completa, o cambiar de ventana en escritorio.
    if (document.hidden) return;

    const fueraDeFullscreen = usaFullscreen && !document.fullscreenElement;
    const sinFoco = typeof document.hasFocus === 'function' ? !document.hasFocus() : false;

    const salio = fueraDeFullscreen || (tipo === 'blur' && sinFoco);
    if (!salio) return;

    registrarSalida(tipo);
  }, espera);
}

// Un mismo salto fuera del examen dispara varios eventos a la vez (se sale de
// pantalla completa Y se oculta la pestana). Se cuenta una sola vez.
function registrarSalida(tipo) {
  if (Date.now() - ultimaSalidaMs < 3000) return;
  ultimaSalidaMs = Date.now();
  manejarSalida(tipo);
}

async function manejarSalida(tipo) {
  // Caso 1: la conectividad acaba de cambiar. Alerta del sistema, no el
  // alumno. Queda en la bitacora pero no cuenta.
  if (esParpadeoDeRed()) {
    anotarEvento(tipo, false);
    mostrarModalRed();
    return;
  }

  // Caso 2: salida real. Se cuenta SIEMPRE, haya red o no.
  advertenciasLocales++;

  let data = null;
  if (navigator.onLine) {
    try {
      const resp = await fetchConTiempo(`${SUPABASE_URL}/functions/v1/registrar-advertencia`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ intento_id: intentoId, tipo }),
      }, 10000);
      const cuerpo = await resp.json();
      if (resp.ok) data = cuerpo;
    } catch { /* sin servidor: seguimos con la cuenta local */ }
  }

  if (data) {
    // El servidor manda: su contador no se borra recargando la pagina.
    // Ya anoto el evento en su bitacora, asi que aqui no se duplica.
    advertencias = Math.max(data.advertencias ?? 0, advertenciasLocales);
  } else {
    // No se pudo avisar. Cuenta local y se sincroniza al entregar.
    advertencias = advertenciasLocales;
    anotarEvento(tipo, true);
  }
  advertenciasLocales = advertencias;
  guardarLocal();

  if (advertencias > maxAdvertencias) {
    entregar(true, 'Salio de la pantalla del examen despues del aviso');
    return;
  }

  mostrarModalAviso(Math.max(0, maxAdvertencias - advertencias));
}

// Bitacora local de salidas que el servidor todavia no conoce. Se vacia al
// entregar. `conto` dice si ademas suma como advertencia.
function anotarEvento(tipo, conto) {
  eventosOffline.push({ ts: new Date().toISOString(), tipo, conto: !!conto });
  if (eventosOffline.length > 60) eventosOffline = eventosOffline.slice(-60);
  guardarLocal();
}

// ---------- Modales ----------

function abrirModal(id) {
  pausadoPorAviso = true;
  if (temporizadorSalida) clearTimeout(temporizadorSalida);
  document.getElementById(id)?.classList.remove('hidden');
}

async function cerrarModalYVolver(id) {
  document.getElementById(id)?.classList.add('hidden');
  tsOculto = null;
  // Volver a pantalla completa requiere un gesto del usuario: por eso el modal
  // se cierra con un botón y no solo.
  if (usaFullscreen && !document.fullscreenElement) {
    try { await document.documentElement.requestFullscreen(); } catch { /* noop */ }
  }
  // Margen para que el fullscreenchange del propio botón no cuente como salida.
  setTimeout(() => { pausadoPorAviso = false; }, 800);
}

function mostrarModalAviso(restantes) {
  const texto = document.getElementById('aviso-texto');
  if (texto) {
    texto.textContent = restantes > 0
      ? `Si vuelves a salir, tu examen se cerrará y se entregará con lo que lleves contestado. ` +
        `Te queda${restantes === 1 ? '' : 'n'} ${restantes} oportunidad${restantes === 1 ? '' : 'es'}.`
      : 'Si vuelves a salir, tu examen se cerrará y se entregará automáticamente.';
  }
  abrirModal('modal-aviso');
}

function mostrarModalRed() {
  abrirModal('modal-red');
}

document.getElementById('btn-aviso-entendido')?.addEventListener('click', () => cerrarModalYVolver('modal-aviso'));
document.getElementById('btn-red-entendido')?.addEventListener('click', () => cerrarModalYVolver('modal-red'));

// ---------- Render de la pregunta actual ----------

function renderPregunta() {
  const p = preguntas[indiceActual];
  document.getElementById('contador-pregunta').textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
  document.getElementById('barra-progreso').style.width = `${((indiceActual + 1) / preguntas.length) * 100}%`;

  const cont = document.getElementById('pregunta-contenedor');
  let camposHtml = '';

  if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
    const seleccion = respuestasEstado[p.id];
    camposHtml = p.opciones.map((o) => `
      <label class="flex items-center gap-3 border border-outline-variant rounded-DEFAULT p-4 mb-3 cursor-pointer hover:bg-surface-container-high transition-colors ${seleccion === o.id ? 'border-primary bg-primary-fixed' : ''}">
        <input type="radio" name="opcion" value="${o.id}" class="input-respuesta" ${seleccion === o.id ? 'checked' : ''}/>
        <span class="font-body-md text-body-md text-on-surface">${escapeHtml(o.texto)}</span>
      </label>`).join('');
  } else if (p.tipo === 'completar') {
    const respuestasPrevias = respuestasEstado[p.id] || [];
    const partes = p.plantilla.split('___');
    camposHtml = '<p class="font-body-lg text-body-lg text-on-surface leading-loose">' + partes.map((parte, idx) => {
      if (idx === partes.length - 1) return escapeHtml(parte);
      const valor = escapeHtml(respuestasPrevias[idx] || '');
      return `${escapeHtml(parte)}<input type="text" class="input-blanco border-b-2 border-primary bg-transparent outline-none px-2 mx-1 font-bold text-primary" data-idx="${idx}" style="width:120px;" value="${valor}"/>`;
    }).join('') + '</p>';
  } else if (p.tipo === 'relacionar') {
    const seleccion = respuestasEstado[p.id] || {};
    camposHtml = `
      <div class="grid grid-cols-1 gap-3">
        ${p.izquierda.map((izq) => `
          <div class="flex items-center gap-3 border border-outline-variant rounded-DEFAULT p-3">
            <span class="font-body-md text-body-md text-on-surface flex-1">${escapeHtml(izq.texto)}</span>
            <span class="material-symbols-outlined text-on-surface-variant">arrow_forward</span>
            <select class="select-relacionar border border-outline-variant rounded-DEFAULT p-2 flex-1" data-izq="${izq.id}">
              <option value="">Selecciona...</option>
              ${p.derecha.map((d) => `<option value="${d.id}" ${seleccion[izq.id] === d.id ? 'selected' : ''}>${escapeHtml(d.texto)}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>`;
  }

  cont.innerHTML = `
    <span class="inline-block bg-surface-container-high text-on-surface-variant text-sm px-3 py-1 rounded-full mb-3">${p.puntos} pts</span>
    <p class="font-headline-lg-mobile text-headline-lg-mobile text-on-surface mb-stack-md">${escapeHtml(p.texto)}</p>
    ${p.imagen_url ? `<img src="${escapeHtml(p.imagen_url)}" class="rounded-DEFAULT mb-stack-md w-full"/>` : ''}
    <div>${camposHtml}</div>`;

  cont.querySelectorAll('.input-respuesta').forEach((el) => {
    el.addEventListener('change', () => { respuestasEstado[p.id] = el.value; guardarLocal(); });
  });
  cont.querySelectorAll('.input-blanco').forEach((el) => {
    el.addEventListener('input', () => {
      const arr = respuestasEstado[p.id] || [];
      arr[Number(el.dataset.idx)] = el.value;
      respuestasEstado[p.id] = arr;
      guardarLocal();
    });
  });
  cont.querySelectorAll('.select-relacionar').forEach((el) => {
    el.addEventListener('change', () => {
      const obj = respuestasEstado[p.id] || {};
      obj[el.dataset.izq] = el.value;
      respuestasEstado[p.id] = obj;
      guardarLocal();
    });
  });

  document.getElementById('btn-anterior').style.visibility = indiceActual === 0 ? 'hidden' : 'visible';
  document.getElementById('btn-siguiente').innerHTML = indiceActual === preguntas.length - 1
    ? 'Entregar examen <span class="material-symbols-outlined">check</span>'
    : 'Siguiente <span class="material-symbols-outlined">arrow_forward</span>';
}

document.getElementById('btn-anterior').addEventListener('click', () => {
  if (indiceActual > 0) { indiceActual--; renderPregunta(); guardarLocal(); }
});

document.getElementById('btn-siguiente').addEventListener('click', () => {
  if (indiceActual < preguntas.length - 1) {
    indiceActual++;
    renderPregunta();
    guardarLocal();
  } else {
    const sinContestar = preguntas.filter((p) => {
      const r = respuestasEstado[p.id];
      if (r === undefined || r === null || r === '') return true;
      if (Array.isArray(r)) return r.every((v) => !v);
      if (typeof r === 'object') return Object.values(r).every((v) => !v);
      return false;
    }).length;

    const mensaje = sinContestar > 0
      ? `Te ${sinContestar === 1 ? 'falta' : 'faltan'} ${sinContestar} pregunta${sinContestar === 1 ? '' : 's'} por contestar. ¿Entregar de todos modos?`
      : '¿Entregar tu examen? Ya no podrás cambiar tus respuestas.';

    if (confirm(mensaje)) entregar(false);
  }
});

// ---------- Entregar, con cola de reintentos ----------

// Espera entre reintentos. La red de la escuela puede tardar en volver, así
// que después de los primeros intentos se sigue insistiendo cada 30 s en vez
// de rendirse: el alumno no pierde nada por esperar y sus respuestas están
// guardadas en el dispositivo mientras tanto.
const ESPERAS_MS = [0, 2000, 4000, 8000, 15000, 30000];
let intentoEnvio = 0;
let temporizadorEnvio = null;

function entregar(porBloqueo, motivo) {
  if (enviando || examenTerminado) return;
  enviando = true;
  deteccionActiva = false;
  if (cronometroInterval) clearInterval(cronometroInterval);
  if (temporizadorSalida) clearTimeout(temporizadorSalida);

  const pendiente = {
    porBloqueo: !!porBloqueo,
    motivo: porBloqueo ? (motivo || 'Salió de la pantalla del examen') : null,
    creado: new Date().toISOString(),
  };
  guardarLocal({ pendiente });

  mostrarVista('vista-enviando');
  intentoEnvio = 0;
  procesarCola(pendiente);
}

async function procesarCola(pendiente) {
  if (examenTerminado) return;

  pintarEstadoEnvio(pendiente);

  let ok = false;
  let errorFatal = null;

  try {
    const resp = await fetchConTiempo(`${SUPABASE_URL}/functions/v1/enviar-respuestas`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        intento_id: intentoId,
        respuestas: respuestasEstado,
        motivo_bloqueo: pendiente.porBloqueo ? pendiente.motivo : null,
        eventos_pendientes: eventosOffline,
        advertencias_locales: advertenciasLocales,
      }),
    }, 25000);

    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.ok) {
      ok = true;
      // El servidor manda la última palabra: si el intento ya estaba bloqueado
      // y este envío llegó tarde, se muestra la pantalla de bloqueo, no la de
      // entrega normal.
      if (data.estado === 'bloqueado') pendiente.porBloqueo = true;
      if (data.estado === 'entregado') pendiente.porBloqueo = false;
    } else if (resp.status === 400 || resp.status === 403 || resp.status === 404) {
      // Errores que no se arreglan reintentando.
      errorFatal = data.error || 'El servidor rechazó la entrega.';
    }
  } catch {
    // Red caída o petición agotada: se reintenta.
  }

  if (ok) {
    finalizarEntrega(pendiente.porBloqueo);
    return;
  }

  if (errorFatal) {
    mostrarErrorFatal(
      `${errorFatal} Tus respuestas siguen guardadas en este dispositivo; ` +
      `avísale a tu profesor sin cerrar esta pestaña.`
    );
    return;
  }

  intentoEnvio++;
  const espera = ESPERAS_MS[Math.min(intentoEnvio, ESPERAS_MS.length - 1)];
  if (temporizadorEnvio) clearTimeout(temporizadorEnvio);
  temporizadorEnvio = setTimeout(() => procesarCola(pendiente), espera);
  pintarEstadoEnvio(pendiente, espera);
}

function reintentarYa() {
  const guardado = leerLocal();
  if (!guardado?.pendiente || examenTerminado) return;
  if (temporizadorEnvio) clearTimeout(temporizadorEnvio);
  intentoEnvio = 0;
  procesarCola(guardado.pendiente);
}

document.getElementById('btn-reintentar-envio')?.addEventListener('click', reintentarYa);

function pintarEstadoEnvio(pendiente, esperaMs) {
  const titulo = document.getElementById('enviando-titulo');
  const detalle = document.getElementById('enviando-detalle');
  if (titulo) {
    titulo.textContent = pendiente.porBloqueo ? 'Cerrando tu examen…' : 'Entregando tu examen…';
  }
  if (detalle) {
    if (intentoEnvio === 0) {
      detalle.textContent = 'Enviando tus respuestas al servidor.';
    } else if (!navigator.onLine) {
      detalle.textContent =
        'Tu dispositivo está sin conexión. Tus respuestas están guardadas y se enviarán solas ' +
        'en cuanto vuelva el internet. No cierres esta pantalla.';
    } else {
      const seg = Math.round((esperaMs ?? 0) / 1000);
      detalle.textContent =
        `La red está fallando. Reintentando${seg ? ` en ${seg} s` : ''}… ` +
        `(intento ${intentoEnvio + 1}). Tus respuestas están guardadas, no cierres esta pantalla.`;
    }
  }
}

async function finalizarEntrega(porBloqueo) {
  examenTerminado = true;
  enviando = false;
  deteccionActiva = false;
  if (temporizadorEnvio) clearTimeout(temporizadorEnvio);
  limpiarLocal();

  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* noop */ }
  }
  mostrarVista(porBloqueo ? 'vista-bloqueo' : 'vista-entregado');
}

// Último candado: si el alumno intenta cerrar la pestaña con una entrega
// todavía sin confirmar, el navegador le pregunta si está seguro.
window.addEventListener('beforeunload', (e) => {
  if (enviando && !examenTerminado) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- Service worker (modo offline) ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin SW se sigue funcionando */ });
  });
}

revisarSesion();
