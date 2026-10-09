#!/usr/bin/env node
// ¿En qué escuela estoy parado?
//
// Con más de un colegio, cada uno en su carpeta, su repo y su cuenta de
// Supabase, es fácil correr un `db push` o un `functions deploy` en el
// proyecto equivocado. Peor: la terminal no avisa, porque los comandos
// funcionan igual de bien apuntando al colegio que no era.
//
// Esto imprime, de la carpeta donde estás parado, las cuatro identidades que
// importan, y grita si no coinciden:
//
//   node scripts/donde-estoy.mjs
//
// Lo que compara:
//   · marca.json ................. el nombre que ve el maestro
//   · supabase-client.js ......... a qué base le habla la APP
//   · supabase/.temp/ ............ a qué proyecto le pega el CLI (db push,
//                                  functions deploy). Lo pone `supabase link`.
//   · git remote origin .......... a qué repo va el push
//
// Si los dos del medio no son el mismo proyecto, estás a un comando de
// escribir en la escuela equivocada.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const leer = (rel) => { try { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); } catch { return null; } };

function escuela() {
  try { return JSON.parse(leer('marca.json')).nombre || '(sin nombre)'; }
  catch { return '(no pude leer marca.json)'; }
}

function refDeLaApp() {
  const js = leer('assets/js/supabase-client.js');
  const m = js?.match(/SUPABASE_URL\s*=\s*'https:\/\/([a-z0-9]+)\.supabase\.co'/);
  return m ? m[1] : null;
}

function proyectoDelCli() {
  const crudo = leer('supabase/.temp/linked-project.json');
  if (crudo) {
    try {
      const j = JSON.parse(crudo);
      return { ref: j.ref || null, nombre: j.name || null, org: j.organization_id || j.organization_slug || null };
    } catch { /* sigue al plan B */ }
  }
  const ref = leer('supabase/.temp/project-ref')?.trim();
  return { ref: ref || null, nombre: null, org: null };
}

function repo() {
  try { return execSync('git remote get-url origin', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return '(sin remoto de git)'; }
}

function rama() {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return '?'; }
}

const app = refDeLaApp();
const cli = proyectoDelCli();

console.log(`
  Carpeta ...... ${RAIZ}
  Escuela ...... ${escuela()}
  Repo ......... ${repo()}  (rama ${rama()})

  La APP le habla a ....... ${app || '(no pude leerlo de supabase-client.js)'}
  El CLI le pega a ........ ${cli.ref || '(sin vincular — corre: npx supabase link)'}${cli.nombre ? `  "${cli.nombre}"` : ''}
`);

if (app && cli.ref && app !== cli.ref) {
  console.log(`  ⚠  NO COINCIDEN.

     La app guarda y lee en  ${app}
     pero db push y functions deploy van a  ${cli.ref}

     Un "supabase db push" aquí le escribe a OTRA escuela.
     Arréglalo antes de seguir:  npx supabase link --project-ref ${app}
`);
  process.exit(1);
}

if (app && cli.ref) console.log('  Coinciden. Puedes correr db push y deploy con confianza.\n');
else console.log('  Falta un dato para poder compararlos.\n');
