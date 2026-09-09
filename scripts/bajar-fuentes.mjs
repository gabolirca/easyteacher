/* Baja Inter y Material Symbols de Google Fonts al propio repo, para que las
 * páginas del alumno no dependan de fonts.googleapis.com.
 *
 * Se corre UNA vez, desde una computadora con internet:   npm run fuentes
 *
 * Deja los archivos en assets/vendor/fuentes/ y escribe fuentes.css. Después
 * hay que cambiar en examen.html y login.html los dos <link> de
 * fonts.googleapis.com por:
 *   <link href="assets/vendor/fuentes/fuentes.css" rel="stylesheet"/>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DESTINO = 'assets/vendor/fuentes';
// User-Agent de un navegador moderno: así Google entrega woff2, que pesa menos.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HOJAS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
];

async function bajarTexto(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} al bajar ${url}`);
  return r.text();
}

await mkdir(DESTINO, { recursive: true });

let cssFinal = '';
let n = 0;

for (const hoja of HOJAS) {
  let css = await bajarTexto(hoja);
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])];

  for (const url of urls) {
    const ext = url.split('.').pop().split('?')[0];
    const nombre = `fuente-${++n}.${ext}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${r.status} al bajar ${url}`);
    await writeFile(join(DESTINO, nombre), Buffer.from(await r.arrayBuffer()));
    css = css.split(url).join(`./${nombre}`);
    console.log('  ->', nombre);
  }
  cssFinal += css + '\n';
}

await writeFile(join(DESTINO, 'fuentes.css'), cssFinal);
console.log(`\nListo: ${n} archivos de fuente en ${DESTINO}/`);
console.log('Ahora cambia los <link> de fonts.googleapis.com en examen.html y login.html por:');
console.log('  <link href="assets/vendor/fuentes/fuentes.css" rel="stylesheet"/>');
