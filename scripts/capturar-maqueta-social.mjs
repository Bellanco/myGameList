#!/usr/bin/env node
/**
 * CAPTURAS DEL HUB SOCIAL SIN SESIÓN, en las paletas y modos que se pidan.
 *
 * Las pantallas del social exigen sesión de Google (y GitHub para el gist), así que no se pueden recorrer con un
 * navegador automático. La maqueta `docs/maquetas/social.html` monta las pantallas REALES del hub con datos
 * inventados y sin red; este script la fotografía entera para revisar un cambio de diseño de un vistazo.
 *
 * Necesita el servidor de desarrollo levantado (la maqueta no entra en el build): `npx vite --port 8001`.
 *
 *   node scripts/capturar-maqueta-social.mjs [--url http://localhost:8001] [--out <carpeta>]
 *        [--pantallas feed,perfil,…] [--temas tierramedia,grimdark,…] [--modos dark,light] [--ancho 1280]
 *
 * Por defecto: todas las pantallas y variantes, las ocho paletas y los dos modos, a 1280 px, en
 * `./capturas-social/`. Cada imagen se llama `<pantalla>__<paleta>-<modo>.png` y el script avisa de cualquier
 * error de consola, que es la señal de que una pantalla se ha quedado vieja frente a sus componentes.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pares, valor, i, todos) => (valor.startsWith('--') ? [...pares, [valor.slice(2), todos[i + 1]]] : pares), []),
);
const URL_BASE = args.url || 'http://localhost:8001';
const SALIDA = args.out || 'capturas-social';
const ANCHO = Number(args.ancho) || 1280;
const TEMAS = (args.temas || 'tierramedia,arcade,witcher,persona,portal,cyberpunk,seaofstars,grimdark').split(',');
const MODOS = (args.modos || 'dark,light').split(',');
// Las mismas claves que `PANTALLAS` y `VARIANTES` de `docs/maquetas/social.tsx`.
const TODAS = [
  'feed', 'feed-vacio', 'feed-fallo', 'feed-fallo-parcial', 'feed-github', 'amigos', 'solicitudes', 'solicitudes-vacia',
  'perfil', 'perfil&vista=resenas', 'perfil&abrir=estadisticas', 'perfil&abrir=resumen',
  'perfil-propio', 'perfil-propio&vista=publicaciones', 'ajustes', 'logros', 'globales', 'resena', 'resena-perfil',
];
const PANTALLAS = args.pantallas ? args.pantallas.split(',') : TODAS;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: 900 } });
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

let fallos = 0;
for (const pantalla of PANTALLAS) {
  for (const tema of TEMAS) {
    for (const modo of MODOS) {
      errores.length = 0;
      await pagina.goto(`${URL_BASE}/docs/maquetas/social.html?pantalla=${pantalla}&gl-palette=${tema}&gl-theme=${modo}&gl-effects=off&barra=0`);
      await pagina.waitForLoadState('networkidle');
      await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
      await pagina.waitForTimeout(400);
      const nombre = `${pantalla.replace(/[&=]/g, '_')}__${tema}-${modo}.png`;
      await pagina.screenshot({ path: join(SALIDA, nombre), fullPage: true });
      if (errores.length) {
        fallos += 1;
        console.warn(`✗ ${nombre}\n   ${[...new Set(errores)].join('\n   ')}`);
      }
    }
  }
}
await navegador.close();
console.log(`${PANTALLAS.length * TEMAS.length * MODOS.length} capturas en ${SALIDA}/${fallos ? ` · ${fallos} con errores` : ''}`);
process.exitCode = fallos ? 1 : 0;
