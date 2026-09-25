import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-client.js';

const params = new URLSearchParams(window.location.search);
// Parámetros que trae el QR de la clase.
const qr = {
  sesion: params.get('s'),
  ventana: params.get('v'),
  codigo: params.get('c'),
};

let alumno = null;
let miPerfil = null;   // {nombre, matricula} del dueño de la sesión
let sesion = null;
let grupo = null;
let actividades = [];
let mias = {};          // { actividad_id: 'pendiente' | 'aprobada' | 'rechazada' }
let sondeo = null;

const LS_COLA = 'aulafacil_cola_alumno';
const SS_PASE = 'aulafacil_pase_qr';
const SS_YA = 'aulafacil_presencia_ok';

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function vista(id) {
  ['vista-login', 'vista-panel', 'vista-sin-clase', 'vista-error']
    .forEach((v) => document.getElementById(v)?.classList.toggle('hidden', v !== id));
}

function aviso(msg, esError = false) {
  const el = document.getElementById('aviso');
  if (!el) return;
  el.textContent = msg;
  el.className = `rounded-DEFAULT p-3 mb-3 font-body-md text-body-md ${
    esError ? 'bg-error-container text-on-error-container' : 'bg-secondary-container text-on-secondary-container'}`;
  el.classList.remove('hidden');
}

function pintarRed() {
  document.getElementById('banner-offline')?.classList.toggle('hidden', navigator.onLine);
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
  if (!resp.ok) throw new Error(data.error || 'No se pudo completar');
  return data;
}

// ---------- Cola para cuando no hay red ----------
// El salón es justo donde peor está el wifi. Nada se pierde: lo que no se pudo
// mandar queda guardado y se reintenta al recuperar señal.

function leerCola() {
  try { return JSON.parse(localStorage.getItem(LS_COLA) || '[]'); } catch { return []; }
}
function guardarCola(c) {
  try { localStorage.setItem(LS_COLA, JSON.stringify(c.slice(-30))); } catch { /* noop */ }
}
function encolar(funcion, cuerpo) {
  const c = leerCola();
  c.push({ funcion, cuerpo, ts: Date.now() });
  guardarCola(c);
}

async function vaciarCola() {
  if (!navigator.onLine) return;
  const cola = leerCola();
  if (cola.length === 0) return;
  const quedan = [];
  for (const item of cola) {
    try { await llamar(item.funcion, item.cuerpo); }
    catch (e) {
      // Un rechazo del servidor (código expirado, actividad cerrada) no se
      // reintenta para siempre: se descarta. Solo se conserva lo que falló
      // por falta de red.
      if (navigator.onLine) continue;
      quedan.push(item);
    }
  }
  guardarCola(quedan);
  if (cola.length !== quedan.length) await cargar();
}

// ---------- Login del alumno ----------

document.getElementById('form-login')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  const usuario = document.getElementById('usuario').value.trim();
  const password = document.getElementById('password').value;
  const email = usuario.includes('@') ? usuario : `${usuario.toLowerCase()}@alumnos.easyteacher.app`;
  const btn = document.getElementById('btn-login');
  btn.disabled = true;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    err.textContent = 'Matrícula o contraseña incorrectas';
    err.classList.remove('hidden');
    btn.disabled = false;
    return;
  }
  await arrancar();
});

// ---------- Pase de entrada ----------
// El QR solo vive 60 s, a proposito: asi una captura de pantalla mandada por
// WhatsApp no le sirve a nadie. El problema es que el alumno que llega sin
// sesion iniciada gasta mas de un minuto tecleando su matricula, y para
// cuando termina el codigo ya expiro (el 18/09 se cayeron asi 85 de 89
// registros de asistencia).
//
// Por eso el codigo se canjea AQUI, en cuanto abre el link y antes de
// cualquier login, por un pase firmado que dura unos minutos. Escanear sigue
// siendo obligatorio; lo unico que cambia es que ya no hay prisa despues.

function leerPase() {
  try {
    const p = JSON.parse(sessionStorage.getItem(SS_PASE) || 'null');
    if (!p || p.sesion_id !== qr.sesion) return null;
    if (!p.expira || p.expira * 1000 < Date.now()) return null;
    return p;
  } catch { return null; }
}

async function canjearPase() {
  if (!qr.sesion || !qr.ventana || !qr.codigo) return;
  if (leerPase()) return;               // ya hay uno vigente
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/validar-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        sesion_id: qr.sesion, ventana: Number(qr.ventana), codigo: qr.codigo,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return;               // codigo vencido o invalido: se avisa al registrar
    sessionStorage.setItem(SS_PASE, JSON.stringify({
      sesion_id: qr.sesion, pase: data.pase, expira: data.expira,
    }));
  } catch { /* sin red: se reintenta con el codigo tal cual */ }
}

// ---------- Registrar presencia con el QR ----------

function cuerpoPresencia() {
  const p = leerPase();
  if (p) return { sesion_id: qr.sesion, pase: p.pase, expira: p.expira };
  if (qr.ventana && qr.codigo) {
    return { sesion_id: qr.sesion, ventana: Number(qr.ventana), codigo: qr.codigo };
  }
  return null;
}

async function registrarPresencia() {
  if (!qr.sesion) return;
  // Si recarga la pagina con el mismo link, el codigo de la URL ya esta
  // viejo. No tiene caso reintentar ni ensenarle un error: ya quedo.
  try { if (sessionStorage.getItem(SS_YA) === qr.sesion) return; } catch { /* noop */ }
  const cuerpo = cuerpoPresencia();
  if (!cuerpo) return;
  try {
    const r = await llamar('registrar-presencia', cuerpo);
    aviso(r?.estado === 'retardo'
      ? `Asistencia registrada con retardo (llegaste después de los ${r.tolerancia_min} min de tolerancia)`
      : 'Presencia registrada');
    try {
      sessionStorage.setItem(SS_YA, qr.sesion);
      sessionStorage.removeItem(SS_PASE);
    } catch { /* noop */ }
  } catch (e) {
    if (!navigator.onLine) {
      encolar('registrar-presencia', cuerpo);
      aviso('Sin conexión: tu presencia se enviará sola en cuanto vuelva la señal.');
    } else {
      aviso(e.message, true);
    }
  }
}

// ---------- Quién está usando este teléfono ----------
// El telefono guarda la sesion de la ultima vez. Si es de otra cuenta —otra
// prueba, otro maestro— el alumno escanea y no pasa nada, sin entender por
// que. Antes esta pantalla decia "no hay clase activa", que era falso: si
// habia clase, pero no para esa cuenta, y no habia manera de salirse.

async function cargarMiPerfil() {
  if (!alumno) return;
  const { data } = await supabase
    .from('alumnos').select('nombre, matricula').eq('id', alumno.id).maybeSingle();
  miPerfil = data || null;
}

function mostrarQuienEntro(spanId, cajaId) {
  const caja = document.getElementById(cajaId);
  const span = document.getElementById(spanId);
  if (!caja || !span) return;
  if (!miPerfil || !miPerfil.nombre) { caja.style.display = 'none'; return; }
  span.textContent = miPerfil.matricula
    ? `${miPerfil.nombre} (${miPerfil.matricula})`
    : miPerfil.nombre;
  caja.style.display = 'block';
}

document.getElementById('btn-otra-cuenta-alumno')?.addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try { await supabase.auth.signOut(); } catch { /* da igual: se recarga */ }
  window.location.reload();
});

// ---------- Cargar el panel ----------

async function cargar() {
  // La RLS ya limita a las sesiones de sus grupos: no hace falta filtrar aquí.
  let consulta = supabase.from('sesiones')
    .select('id, grupo_id, fecha, estado, grupos(nombre, materia)')
    .eq('estado', 'activa');
  if (qr.sesion) consulta = consulta.eq('id', qr.sesion);

  const { data: sesiones } = await consulta.order('inicio', { ascending: false }).limit(1);
  sesion = (sesiones || [])[0] || null;

  if (!sesion) {
    const titulo = document.getElementById('sinclase-titulo');
    const texto = document.getElementById('sinclase-texto');
    // Si venia escaneando una clase concreta y no la ve, no es que no haya
    // clase: es que esta cuenta no esta en ese grupo, o ya termino.
    if (qr.sesion && titulo && texto) {
      document.getElementById('sinclase-icono').textContent = 'person_alert';
      titulo.textContent = 'Esta clase no es de tu cuenta';
      texto.textContent = 'Escaneaste el código de una clase que no le toca a esta cuenta. '
        + 'Puede que tu maestro ya la haya cerrado, o que hayas entrado con la cuenta de otra materia.';
    }
    mostrarQuienEntro('sinclase-quien', 'sinclase-sesion');
    vista('vista-sin-clase');
    return;
  }
  grupo = sesion.grupos;

  const { data: acts } = await supabase
    .from('actividades_sesion').select('id, nombre, valor, abierta')
    .eq('sesion_id', sesion.id).order('orden');
  actividades = acts || [];

  mias = {};
  if (actividades.length > 0) {
    const { data: parts } = await supabase
      .from('participaciones_sesion').select('actividad_id, estado, puntos')
      .in('actividad_id', actividades.map((a) => a.id));
    (parts || []).forEach((p) => { mias[p.actividad_id] = p; });
  }

  pintar();
  vista('vista-panel');
}

function pintar() {
  const quien = document.getElementById('panel-quien');
  if (quien) {
    quien.textContent = miPerfil?.nombre
      ? (miPerfil.matricula ? `${miPerfil.nombre} (${miPerfil.matricula})` : miPerfil.nombre)
      : '';
  }
  document.getElementById('panel-materia').textContent = grupo?.materia || grupo?.nombre || 'Clase';
  document.getElementById('panel-grupo').textContent = grupo?.nombre || '';
  document.getElementById('panel-fecha').textContent =
    new Date(`${sesion.fecha}T12:00:00`).toLocaleDateString('es-MX',
      { weekday: 'long', day: '2-digit', month: 'long' });

  const ganados = Object.values(mias)
    .filter((p) => p.estado === 'aprobada')
    .reduce((s, p) => s + Number(p.puntos || 0), 0);
  document.getElementById('panel-puntos').textContent = ganados;

  const cont = document.getElementById('lista-actividades');
  if (actividades.length === 0) {
    cont.innerHTML = '<p class="text-on-surface-variant font-body-md">Tu maestro todavía no registra actividades en esta clase.</p>';
    return;
  }

  cont.innerHTML = actividades.map((a) => {
    const mia = mias[a.id];
    let estado = '';
    let boton = '';

    if (mia?.estado === 'aprobada') {
      estado = `<span class="px-3 py-1 rounded-full text-sm font-label-lg bg-secondary-container text-on-secondary-container">+${mia.puntos} puntos</span>`;
    } else if (mia?.estado === 'pendiente') {
      estado = '<span class="px-3 py-1 rounded-full text-sm font-label-lg bg-tertiary-container text-on-tertiary-container">Esperando a tu maestro</span>';
    } else if (mia?.estado === 'rechazada') {
      estado = '<span class="px-3 py-1 rounded-full text-sm font-label-lg bg-surface-container-high text-on-surface-variant">No contabilizada</span>';
    } else if (a.abierta) {
      boton = `<button class="btn-reclamar bg-primary text-on-primary font-label-lg text-label-lg rounded-full py-2 px-5" data-id="${a.id}">Yo la hice</button>`;
    } else {
      estado = '<span class="px-3 py-1 rounded-full text-sm font-label-lg bg-surface-container-high text-on-surface-variant">Cerrada</span>';
    }

    return `
      <div class="bg-surface-container-lowest border border-outline-variant rounded-DEFAULT p-4 mb-3 flex items-center justify-between gap-3">
        <div>
          <p class="font-label-lg text-label-lg text-on-surface">${esc(a.nombre)}</p>
          <p class="font-body-md text-body-md text-on-surface-variant">${a.valor} puntos</p>
        </div>
        ${boton || estado}
      </div>`;
  }).join('');

  cont.querySelectorAll('.btn-reclamar').forEach((b) => {
    b.addEventListener('click', () => reclamar(b.dataset.id, b));
  });
}

async function reclamar(actividadId, boton) {
  boton.disabled = true;
  boton.textContent = 'Enviando...';
  try {
    await llamar('reclamar-participacion', { actividad_id: actividadId });
    await cargar();
  } catch (e) {
    if (!navigator.onLine) {
      encolar('reclamar-participacion', { actividad_id: actividadId });
      mias[actividadId] = { estado: 'pendiente', puntos: 0 };
      pintar();
      aviso('Sin conexión: se enviará solo en cuanto vuelva la señal.');
    } else {
      aviso(e.message, true);
      boton.disabled = false;
      boton.textContent = 'Yo la hice';
    }
  }
}

// ---------- Arranque ----------

async function arrancar() {
  // Primero el canje: corre aunque todavia no haya sesion iniciada, que es
  // justo cuando el codigo esta fresco.
  await canjearPase();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { vista('vista-login'); return; }

  alumno = session.user;
  await cargarMiPerfil();
  await vaciarCola();
  await registrarPresencia();
  await cargar();

  if (sondeo) clearInterval(sondeo);
  sondeo = setInterval(() => { if (!document.hidden && navigator.onLine) cargar(); }, 8000);
}

window.addEventListener('online', () => { pintarRed(); vaciarCola(); });
window.addEventListener('offline', pintarRed);

document.getElementById('btn-salir')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'panel-alumno.html';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

pintarRed();
arrancar();
