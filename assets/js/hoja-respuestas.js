import { supabase } from './supabase-client.js';
import { requireProfesor } from './auth-guard.js';
import { toString as qrSvg } from '../vendor/qrcode.js';
import {
  MARCA, MARCAS, QR, RETICULA, MAX_PREGUNTAS,
  posicionFila, centroBurbuja, filasDeExamen, textoQr,
} from './hoja-geometria.js';

// Hojas de respuestas para imprimir: una por alumno, cada una con su QR.
// La foto se califica despues en calificar-hojas.html.
//
// Las medidas salen de hoja-geometria.js y se escriben en milimetros, para
// que lo impreso caiga donde el lector espera encontrarlo.

const params = new URLSearchParams(window.location.search);
const examenId = params.get('examen_id');

let examen = null;
let preguntas = [];
let filasHoja = [];   // renglones de la hoja (relacionar ocupa uno por par)
let alumnos = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function aviso(msg) {
  const box = document.getElementById('aviso');
  box.textContent = msg;
  box.style.display = msg ? '' : 'none';
}

const mm = (v) => `${Math.round(v * 100) / 100}mm`;

async function dibujarHoja(alumno) {
  const marcas = MARCAS.map((c) => `<div class="marca" style="left:${mm(c.x - MARCA.lado / 2)};top:${mm(c.y - MARCA.lado / 2)};width:${mm(MARCA.lado)};height:${mm(MARCA.lado)}"></div>`).join('');

  const qr = await qrSvg(textoQr(examen.id, alumno?.id || ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });

  const filas = filasHoja.map((fila, i) => {
    const f = posicionFila(i);
    const numero = `<div class="num${fila.sub !== null ? ' sub' : ''}" style="left:${mm(f.x - 2)};top:${mm(f.y - 2.2)}">${fila.etiqueta}</div>`;
    const burbujas = fila.burbujas;
    if (burbujas.length === 0) {
      const c = centroBurbuja(i, 0);
      return numero + `<div class="mano" style="left:${mm(c.x - RETICULA.diametro / 2)};top:${mm(f.y - 1.8)}">a mano</div>`;
    }
    return numero + burbujas.map((b, k) => {
      const c = centroBurbuja(i, k);
      const d = RETICULA.diametro;
      return `<div class="burbuja" style="left:${mm(c.x - d / 2)};top:${mm(c.y - d / 2)};width:${mm(d)};height:${mm(d)}"><span>${b.etiqueta}</span></div>`;
    }).join('');
  }).join('');

  const nombre = alumno ? escapeHtml(alumno.nombre) : '';
  return `
    <section class="hoja">
      ${marcas}
      <img class="logo" src="assets/img/logo-escuela.png" alt="" style="left:${mm(22)};top:${mm(21)}">
      <div class="encabezado" style="left:${mm(40)};top:${mm(20)};width:${mm(QR.x - 44)}">
        <div class="titulo">${escapeHtml(examen.titulo)}</div>
        <div class="dato">Grupo: <b>${escapeHtml(examen.grupos?.nombre || '')}</b></div>
        <div class="dato">Alumno: ${nombre ? `<b>${nombre}</b>` : '<span class="linea"></span>'}</div>
        <div class="dato">Fecha: <span class="linea corta"></span> &nbsp; Calificación: <span class="linea corta"></span></div>
      </div>
      <div class="qr" style="left:${mm(QR.x)};top:${mm(QR.y)};width:${mm(QR.lado)};height:${mm(QR.lado)}">${qr}</div>
      <div class="instrucciones" style="left:${mm(20)};top:${mm(52)};width:${mm(176)}">
        Rellena por completo <b>un solo círculo</b> por renglón, con lápiz o pluma oscura. Si te equivocas, borra bien.
        ${filasHoja.some((f) => f.sub !== null) ? 'En relacionar, cada renglón (como 4.1, 4.2…) es un elemento de la izquierda. ' : ''}No dobles la hoja ni escribas sobre los cuadros negros ni sobre el código.
      </div>
      ${filas}
    </section>`;
}

async function dibujarTodo() {
  const cont = document.getElementById('hojas');
  const eleccion = document.getElementById('para-quien').value;
  cont.innerHTML = '';
  const lista = eleccion === 'blanco' ? [null] : alumnos;
  if (lista.length === 0) {
    aviso('Este grupo no tiene alumnos. Elige "Hoja sin nombre" para imprimir una en blanco.');
    return;
  }
  aviso('');
  const partes = [];
  for (const a of lista) partes.push(await dibujarHoja(a));
  cont.innerHTML = partes.join('');
  document.getElementById('contador').textContent = eleccion === 'blanco'
    ? '1 hoja sin nombre: al calificarla eliges a qué alumno pertenece.'
    : `${lista.length} hoja(s), una por alumno.`;
}

async function init() {
  const profesor = await requireProfesor();
  if (!profesor) return;
  if (!examenId) { aviso('Falta el examen en la dirección.'); return; }

  const { data, error } = await supabase
    .from('examenes').select('id, titulo, grupo_id, modo, grupos(nombre)').eq('id', examenId).maybeSingle();
  if (error || !data) { aviso('No se pudo cargar el examen (o no es de uno de tus grupos).'); return; }
  examen = data;
  document.getElementById('link-volver').href = `grupo.html?id=${examen.grupo_id}`;
  document.getElementById('link-calificar').href = `calificar-hojas.html?examen_id=${examen.id}`;
  // El examen en papel de "solo la clave" no tiene texto que imprimir.
  const linkExamen = document.getElementById('link-examen');
  if (examen.modo === 'papel') linkExamen.style.display = 'none';
  else linkExamen.href = `imprimir-examen.html?examen_id=${examen.id}`;
  document.title = `AulaFácil - Hojas - ${examen.titulo}`;

  const [{ data: pregs }, { data: inscritos }] = await Promise.all([
    supabase.from('preguntas').select('id, tipo, orden, contenido_json, opciones(id, texto, orden)').eq('examen_id', examenId).order('orden', { ascending: true }),
    supabase.from('grupo_alumnos').select('alumnos(id, nombre)').eq('grupo_id', examen.grupo_id),
  ]);
  preguntas = pregs || [];
  alumnos = (inscritos || []).map((r) => r.alumnos).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (preguntas.length === 0) { aviso('El examen todavía no tiene preguntas.'); return; }
  filasHoja = filasDeExamen(preguntas);
  if (filasHoja.length > MAX_PREGUNTAS) {
    aviso(`La hoja admite hasta ${MAX_PREGUNTAS} renglones y este examen necesita ${filasHoja.length} (cada elemento de relacionar columnas usa uno).`);
    return;
  }
  const aMano = filasHoja.filter((f) => f.burbujas.length === 0).length;
  if (aMano) {
    document.getElementById('nota-mano').textContent =
      `${aMano} pregunta(s) se califican a mano (completar, o relacionar con más de 5 pares): en la hoja dicen "a mano" y sus puntos se ponen al revisar la foto.`;
  }

  await dibujarTodo();
}

document.getElementById('para-quien').addEventListener('change', dibujarTodo);
document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

init();
