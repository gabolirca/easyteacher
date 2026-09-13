#!/usr/bin/env node
// Arma la instancia de AulaFacil para una escuela nueva.
//
// Lo visual (paleta, logo, iconos) sale de herramientas/generador-marca.html,
// que se abre en el navegador: ahi se ve lo que se esta haciendo y se ajusta a
// ojo. Este script toma esos archivos descargados y arma el resto, que es lo
// que un navegador no puede hacer: copiar el proyecto, poner cada archivo en su
// lugar y dejar apuntadas las llaves de Supabase.
//
//   node scripts/nueva-escuela.mjs
//
// Pregunta lo que falte. Tambien acepta banderas, util para repetir sin teclear:
//   node scripts/nueva-escuela.mjs --destino ../AulaFacil-Cumbres \
//        --descargas ~/Downloads --ref abcdefghijklmnopqrst \
//        --llave sb_publishable_xxx --dominio cumbres.edu.mx
//
// No guarda ningun token. Los pasos que necesitan credenciales quedan escritos
// en PASOS.md dentro de la carpeta nueva, con el project-ref ya sustituido.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as entrada, stdout as salida } from 'node:process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Lo que NO se copia a la escuela nueva.
const EXCLUIR = new Set(['.git', 'node_modules', 'Claude outputs', '.vercel']);
const EXCLUIR_REL = new Set([path.join('supabase', '.temp')]);

// Archivos que produce el generador y a donde va cada uno.
const DEL_GENERADOR = [
  ['marca.json', '.'],
  ['manifest.json', '.'],
  ['logo-escuela.png', 'assets/img'],
  ['icon-192.png', 'assets/img'],
  ['icon-512.png', 'assets/img'],
  ['icon-180.png', 'assets/img'],
  ['favicon-32.png', 'assets/img'],
  ['favicon-16.png', 'assets/img'],
];

function copiarArbol(desde, hacia, rel = '') {
  fs.mkdirSync(hacia, { recursive: true });
  for (const entrada of fs.readdirSync(desde, { withFileTypes: true })) {
    if (EXCLUIR.has(entrada.name)) continue;
    const relHijo = path.join(rel, entrada.name);
    if (EXCLUIR_REL.has(relHijo)) continue;
    const origen = path.join(desde, entrada.name);
    const destino = path.join(hacia, entrada.name);
    if (entrada.isDirectory()) copiarArbol(origen, destino, relHijo);
    else fs.copyFileSync(origen, destino);
  }
}

function exigir(valor, queEs) {
  if (!valor || !valor.trim()) { console.error(`\n  Falta ${queEs}. Cancelado.`); process.exit(1); }
  return valor.trim();
}

// Banderas: --clave valor
const banderas = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const c = process.argv[i];
  if (c?.startsWith('--')) banderas[c.slice(2)] = process.argv[i + 1] ?? '';
}

const faltaAlgo = ['destino', 'descargas', 'ref', 'llave', 'dominio'].some((k) => !banderas[k]);
const rl = faltaAlgo ? readline.createInterface({ input: entrada, output: salida }) : null;

const pregunta = async (clave, texto, porDefecto = '') => {
  if (banderas[clave]) return banderas[clave].trim();
  const r = await rl.question(porDefecto ? `${texto} [${porDefecto}]: ` : `${texto}: `);
  return (r.trim() || porDefecto).trim();
};

console.log(`
  AulaFácil · nueva escuela
  ─────────────────────────
  Antes de empezar necesitas:
    1. Haber abierto herramientas/generador-marca.html y descargado sus 8 archivos.
    2. Un proyecto de Supabase vacío, creado en la cuenta del colegio.
`);

const destino   = exigir(await pregunta('destino', 'Carpeta para la escuela nueva (ej. ../AulaFacil-Cumbres)'), 'la carpeta destino');
const descargas = exigir(await pregunta('descargas', 'Carpeta donde quedaron los archivos del generador',
                          path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads')), 'la carpeta de descargas');
const ref       = exigir(await pregunta('ref', 'project-ref de Supabase (20 letras)'), 'el project-ref');
const llave     = exigir(await pregunta('llave', 'Publishable key del proyecto (empieza con sb_publishable_)'), 'la llave');
const dominio   = exigir(await pregunta('dominio', 'Dominio de correo de los maestros (ej. cpdg.edu.mx)'), 'el dominio');
rl?.close();

const rutaDestino = path.resolve(destino);
if (fs.existsSync(rutaDestino)) {
  console.error(`\n  Ya existe ${rutaDestino}. Elige otra carpeta o bórrala primero.`);
  process.exit(1);
}
if (!/^[a-z]{20}$/.test(ref)) console.warn(`\n  Aviso: "${ref}" no parece un project-ref. Sigo, pero revísalo.`);

// Verificar que esten los 8 archivos ANTES de copiar nada, para no dejar a
// medias una carpeta nueva.
const faltantes = DEL_GENERADOR.filter(([n]) => !fs.existsSync(path.join(descargas, n))).map(([n]) => n);
if (faltantes.length) {
  console.error(`\n  En ${descargas} faltan estos archivos del generador:`);
  faltantes.forEach((f) => console.error(`    · ${f}`));
  console.error('\n  Abre herramientas/generador-marca.html, descárgalos y vuelve a correr esto.');
  process.exit(1);
}

console.log(`\n  Copiando la plantilla a ${rutaDestino} ...`);
copiarArbol(RAIZ, rutaDestino);

console.log('  Colocando la identidad visual ...');
for (const [nombre, subcarpeta] of DEL_GENERADOR) {
  const a = path.join(rutaDestino, subcarpeta, nombre);
  fs.mkdirSync(path.dirname(a), { recursive: true });
  fs.copyFileSync(path.join(descargas, nombre), a);
}

console.log('  Apuntando a la base de la escuela ...');
const rutaCliente = path.join(rutaDestino, 'assets', 'js', 'supabase-client.js');
let cliente = fs.readFileSync(rutaCliente, 'utf8');
const antesUrl = cliente;
cliente = cliente
  .replace(/export const SUPABASE_URL = '[^']*';/, `export const SUPABASE_URL = 'https://${ref}.supabase.co';`)
  .replace(/const SUPABASE_PUBLISHABLE_KEY = '[^']*';/, `const SUPABASE_PUBLISHABLE_KEY = '${llave}';`);
if (cliente === antesUrl) {
  console.error('  No pude reescribir supabase-client.js: cambió su formato. Edítalo a mano.');
} 
fs.writeFileSync(rutaCliente, cliente);

// El service worker cachea el logo: si no sube la version, los telefonos que ya
// abrieron la app siguen mostrando el del colegio anterior.
const rutaSw = path.join(rutaDestino, 'sw.js');
const sw = fs.readFileSync(rutaSw, 'utf8');
fs.writeFileSync(rutaSw, sw.replace(/const VERSION = 'v(\d+)';/, (_, n) => `const VERSION = 'v${Number(n) + 1}';`));

const nombreEscuela = JSON.parse(fs.readFileSync(path.join(rutaDestino, 'marca.json'), 'utf8')).nombre;

fs.writeFileSync(path.join(rutaDestino, 'PASOS.md'), `# Pasos que faltan — ${nombreEscuela}

Lo de los archivos ya está hecho. Falta lo que necesita credenciales.

## 1. Esquema y funciones

\`\`\`powershell
cd ${rutaDestino}
npm.cmd install
npx.cmd supabase link --project-ref ${ref}
npx.cmd supabase db push
foreach ($f in (Get-ChildItem supabase\\functions -Directory)) { npx.cmd supabase functions deploy $f.Name }
\`\`\`

## 2. Restringir quién puede crear cuenta de maestro

En Supabase → SQL Editor:

\`\`\`sql
insert into registro_permitido (valor, nota)
values ('${dominio}', 'Correo institucional del colegio');
\`\`\`

Sin este renglón cualquiera que llegue a login.html puede crearse cuenta de maestro.

## 3. Compilar los estilos

\`\`\`powershell
npm.cmd run css
\`\`\`

## 4. Publicar

Crea el repositorio en GitHub, sube esta carpeta y activa GitHub Pages.
Luego, en Supabase → Authentication → URL Configuration, pon esa dirección
como **Site URL** y agrégala a **Redirect URLs**. Si no, los correos de
recuperación de contraseña mandan a localhost.

## 5. Comprobar

- [ ] Entra a login.html y crea la cuenta del primer maestro con su correo del colegio
- [ ] Intenta crear una con un Gmail: debe rechazarla
- [ ] Crea un grupo y sube dos alumnos
- [ ] Haz un examen de una pregunta y contéstalo desde el teléfono
- [ ] Revisa que el logo y los colores sean los del colegio
`);

console.log(`
  Listo.

    ${rutaDestino}

  Lee PASOS.md que quedó ahí dentro: trae los comandos con el
  project-ref ya puesto, y la lista de comprobación.
`);
