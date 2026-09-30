#!/usr/bin/env node
// Vuelve a calificar un examen YA entregado.
//
// Para que sirve: la app nunca recalifica sola. Cuando se corrige una regla de
// calificacion (por ejemplo el dia que el apostrofe del iPad dejo de contar
// como error), los examenes viejos se quedan con la calificacion que les toco
// ese dia. Este script los vuelve a pasar por la MISMA logica que usa la Edge
// Function -- literalmente el mismo archivo, supabase/functions/_compartido/
// calificar.js -- y actualiza puntos y calificacion.
//
// Por defecto NO escribe nada: enseña que cambiaria y se sale. Hay que pedirle
// --aplicar para que toque la base.
//
//   Ver que pasaria:
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//       node scripts/recalificar.mjs <examen_id | link_token>
//
//   Aplicarlo:
//     ... node scripts/recalificar.mjs <examen_id | link_token> --aplicar
//
// La llave de servicio se saca de Supabase (Project Settings > API > service_role)
// y NUNCA se escribe en un archivo del repo: el repo es publico.

import { createClient } from '@supabase/supabase-js';
import { puntosDePregunta } from '../supabase/functions/_compartido/calificar.js';

const URL = process.env.SUPABASE_URL;
const LLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [, , referencia, ...banderas] = process.argv;
const aplicar = banderas.includes('--aplicar');

function morir(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

if (!URL || !LLAVE) {
  morir('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.\n' +
        '  Ejemplo (PowerShell):\n' +
        '    $env:SUPABASE_URL="https://xxxx.supabase.co"\n' +
        '    $env:SUPABASE_SERVICE_ROLE_KEY="..."\n' +
        '    node scripts/recalificar.mjs <examen_id>');
}
if (!referencia) morir('Falta el examen. Uso: node scripts/recalificar.mjs <examen_id | link_token> [--aplicar]');

const db = createClient(URL, LLAVE, { auth: { persistSession: false } });

const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referencia);

const { data: examen, error: errExamen } = await db
  .from('examenes')
  .select('id, titulo, grupos(nombre)')
  .eq(esUuid ? 'id' : 'link_token', referencia)
  .maybeSingle();
if (errExamen) morir(`No se pudo leer el examen: ${errExamen.message}`);
if (!examen) morir(`No encontre ningun examen con ${esUuid ? 'id' : 'link_token'} "${referencia}".`);

const { data: preguntas, error: errPreg } = await db
  .from('preguntas').select('*, opciones(*)').eq('examen_id', examen.id);
if (errPreg) morir(`No se pudieron leer las preguntas: ${errPreg.message}`);

const totalPuntos = (preguntas || []).reduce((s, p) => s + (Number(p.puntos) || 0), 0);
if (totalPuntos <= 0) morir('El examen no tiene puntos: no hay nada que recalcular.');

const { data: intentos, error: errInt } = await db
  .from('intentos')
  .select('id, alumno_id, calificacion, mapeo_relacionar, estado, alumnos(nombre)')
  .eq('examen_id', examen.id)
  .in('estado', ['entregado', 'bloqueado']);
if (errInt) morir(`No se pudieron leer los intentos: ${errInt.message}`);

console.log(`\n  ${examen.titulo}  ·  ${examen.grupos?.nombre ?? 'sin grupo'}`);
console.log(`  ${intentos.length} intento(s) entregados  ·  ${totalPuntos} puntos en total`);
console.log(aplicar ? '  MODO: aplicar (va a escribir en la base)\n' : '  MODO: solo vista previa, no escribe nada\n');

let cambiados = 0;
const porCorregir = [];

for (const intento of intentos) {
  const { data: respuestas, error: errResp } = await db
    .from('respuestas').select('id, pregunta_id, respuesta_json, puntos_obtenidos')
    .eq('intento_id', intento.id);
  if (errResp) morir(`Respuestas de ${intento.id}: ${errResp.message}`);

  const porPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]));
  let obtenidos = 0;
  const arreglos = [];

  for (const p of preguntas) {
    const guardada = porPregunta.get(p.id);
    const nuevos = Math.round(
      puntosDePregunta(p, guardada?.respuesta_json ?? null, intento.mapeo_relacionar || {}) * 100) / 100;
    obtenidos += nuevos;
    const antes = Number(guardada?.puntos_obtenidos ?? 0);
    if (guardada && Math.abs(antes - nuevos) > 0.005) {
      arreglos.push({ id: guardada.id, orden: p.orden, antes, nuevos });
    }
  }

  const nuevaCalif = Math.round((obtenidos / totalPuntos) * 1000) / 10;
  const califAntes = Number(intento.calificacion ?? 0);
  if (!arreglos.length && Math.abs(califAntes - nuevaCalif) <= 0.05) continue;

  cambiados++;
  console.log(`  ${intento.alumnos?.nombre ?? intento.alumno_id}`);
  for (const a of arreglos) console.log(`      pregunta ${a.orden + 1}: ${a.antes} -> ${a.nuevos}`);
  console.log(`      calificacion: ${califAntes} -> ${nuevaCalif}\n`);
  porCorregir.push({ intentoId: intento.id, nuevaCalif, arreglos });
}

if (!cambiados) {
  console.log('  Nada que cambiar: todos los intentos ya estan calificados con las reglas actuales.\n');
  process.exit(0);
}

if (!aplicar) {
  console.log(`  ${cambiados} intento(s) cambiarian. Vuelve a correrlo con --aplicar para guardarlo.\n`);
  process.exit(0);
}

for (const c of porCorregir) {
  for (const a of c.arreglos) {
    const { error } = await db.from('respuestas').update({ puntos_obtenidos: a.nuevos }).eq('id', a.id);
    if (error) morir(`No se pudo guardar la respuesta ${a.id}: ${error.message}`);
  }
  const { error } = await db.from('intentos').update({ calificacion: c.nuevaCalif }).eq('id', c.intentoId);
  if (error) morir(`No se pudo guardar el intento ${c.intentoId}: ${error.message}`);
}

console.log(`  Listo: ${cambiados} intento(s) recalificados.\n`);
