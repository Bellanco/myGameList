/**
 * Descarga a `public/fonts/` las fuentes que la app usaba desde Google Fonts, y genera los `@font-face`
 * locales en `src/styles/fonts/`.
 *
 * POR QUÉ existen fuentes vendorizadas: la hoja de Google era una petición BLOQUEANTE a un tercero en la ruta
 * crítica (y con dos saltos: `fonts.googleapis.com` para el CSS y `fonts.gstatic.com` para el .woff2, cada uno con
 * su DNS + TLS). Además, cargar una fuente desde Google transmite la IP del visitante a un tercero, lo que con
 * los documentos legales de la app publicados es una decisión que conviene no tener que explicar. Sirviéndolas
 * desde el propio origen desaparecen los dos saltos, la CSP puede dejar de permitir Google, y las fuentes
 * funcionan sin red (el service worker precachea la crítica).
 *
 * ES UN SCRIPT DE MANTENIMIENTO, no de build: se ejecuta A MANO (`node scripts/vendor-fonts.mjs`) y su resultado
 * se commitea. Volver a ejecutarlo es la forma de actualizar una fuente; si el fichero generado cambia, se
 * commitea el cambio. No se cuelga del build a propósito: un build no debería depender de que Google responda.
 *
 * SUBCONJUNTOS: solo se traen `latin` y `latin-ext`, que es todo lo que necesitan el castellano y el inglés. El
 * `unicode-range` de cada bloque se conserva tal cual lo publica Google, así que el navegador sigue decidiendo
 * si necesita bajar `latin-ext` (para un carácter raro) o no.
 *
 * LICENCIA: todas son OFL (SIL Open Font License), que permite redistribuirlas. Ver `public/fonts/LICENSE.md`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'public', 'fonts');
const SCSS_DIR = join(ROOT, 'src', 'styles', 'fonts');

// Chrome moderno: sin un User-Agent así, Google sirve TTF en vez de WOFF2 (mucho más pesado).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Solo estos subconjuntos. El resto (cyrillic, vietnamese…) no lo usa ningún texto de la app.
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

/**
 * Qué familia necesita cada hoja. `slug` nombra el fichero SCSS generado; los pesos son los que ya pedía el
 * `@import` que se sustituye, para no cambiar la tipografía de ningún tema.
 */
const SHEETS = [
  {
    slug: 'dm-sans',
    comment: 'Tipografía base de TODAS las paletas. Es la única que entra en la ruta crítica.',
    families: ['DM+Sans:wght@400;500;600;700;800'],
  },
  {
    slug: 'cyberpunk',
    comment: 'Skin de la paleta cyberpunk (carga diferida).',
    families: ['Rajdhani:wght@400;500;600;700', 'Share+Tech+Mono'],
  },
  {
    slug: 'grimdark',
    comment: 'Skin de la paleta grimdark (carga diferida).',
    families: ['Chakra+Petch:wght@400;500;600;700', 'UnifrakturCook:wght@700', 'VT323'],
  },
  {
    slug: 'portal',
    comment: 'Skin de la paleta portal (carga diferida). Share Tech Mono la comparte con cyberpunk.',
    families: ['Oswald:wght@400;500;600;700', 'Saira:wght@400;500;600', 'Share+Tech+Mono'],
  },
  {
    slug: 'seaofstars',
    comment: 'Skin de la paleta seaofstars (carga diferida).',
    families: ['Pixelify+Sans:wght@400;500;600;700'],
  },
];

/** Descarga (una vez) un .woff2 y lo guarda con un nombre que lleva el hash de su contenido. */
const downloaded = new Map(); // url remota → ruta pública local
async function fetchFont(url, familySlug, subset) {
  if (downloaded.has(url)) return downloaded.get(url);

  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`No se pudo descargar ${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  // Hash del CONTENIDO en el nombre: permite marcarlos `immutable` en las cabeceras sin riesgo de servir una
  // versión vieja, igual que hace Vite con los assets de `/assets/`.
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const fileName = `${familySlug}-${subset}-${hash}.woff2`;
  await writeFile(join(FONT_DIR, fileName), bytes);
  const publicPath = `/fonts/${fileName}`;
  downloaded.set(url, publicPath);
  console.log(`  ${fileName} (${(bytes.length / 1024).toFixed(1)} kB)`);
  return publicPath;
}

/** Parsea la respuesta de la API css2 en bloques {subset, family, style, weight, url, range}. */
function parseGoogleCss(css) {
  const blocks = [];
  // Cada bloque va precedido por un comentario con el nombre del subconjunto.
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  for (const [, subset, body] of css.matchAll(re)) {
    const pick = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
    const url = body.match(/url\(([^)]+)\)/)?.[1];
    const family = pick('font-family')?.replace(/['"]/g, '');
    if (!url || !family) continue;
    blocks.push({
      subset,
      family,
      style: pick('font-style') || 'normal',
      weight: pick('font-weight') || '400',
      url,
      range: pick('unicode-range') || '',
    });
  }
  return blocks;
}

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function buildSheet(sheet) {
  console.log(`\n${sheet.slug}:`);
  const emitted = [];

  for (const family of sheet.families) {
    const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    const response = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!response.ok) throw new Error(`No se pudo pedir el CSS de ${family}: ${response.status}`);
    const blocks = parseGoogleCss(await response.text()).filter((b) => KEEP_SUBSETS.has(b.subset));

    // Las fuentes VARIABLES devuelven el MISMO fichero para todos los pesos pedidos (DM Sans, por ejemplo,
    // repite el mismo .woff2 diez veces). Se agrupan por fichero y se declara un rango de pesos, que es lo
    // que entiende una fuente variable, en vez de diez bloques idénticos.
    const groups = new Map();
    for (const block of blocks) {
      const key = `${block.family}|${block.style}|${block.subset}|${block.url}`;
      const group = groups.get(key) || { ...block, weights: [] };
      group.weights.push(Number(block.weight) || 400);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const familySlug = slugify(group.family);
      const localPath = await fetchFont(group.url, familySlug, group.subset);
      const min = Math.min(...group.weights);
      const max = Math.max(...group.weights);
      emitted.push({
        family: group.family,
        subset: group.subset,
        style: group.style,
        weight: min === max ? `${min}` : `${min} ${max}`,
        localPath,
        range: group.range,
      });
    }
  }

  const header = `// GENERADO por scripts/vendor-fonts.mjs — NO editar a mano.
// ${sheet.comment}
// Se sirven desde el propio origen (public/fonts/): sin peticiones a terceros, sin los dos saltos de red de
// Google Fonts y disponibles sin conexión. Para actualizar: \`node scripts/vendor-fonts.mjs\` y commitear.
`;
  const body = emitted
    .map((face) => `
/* ${face.subset} */
@font-face {
  font-family: '${face.family}';
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url('${face.localPath}') format('woff2');
  unicode-range: ${face.range};
}`)
    .join('\n');

  await writeFile(join(SCSS_DIR, `_${sheet.slug}.scss`), `${header}${body}\n`);
  console.log(`  → src/styles/fonts/_${sheet.slug}.scss (${emitted.length} @font-face)`);
}

await mkdir(FONT_DIR, { recursive: true });
await mkdir(SCSS_DIR, { recursive: true });
for (const sheet of SHEETS) await buildSheet(sheet);

const total = [...downloaded.values()].length;
console.log(`\n${total} ficheros de fuente en public/fonts/.`);

// Recordatorio de licencia junto a los ficheros, que es donde alguien lo buscará.
await writeFile(
  join(FONT_DIR, 'LICENSE.md'),
  `# Licencia de las fuentes

Todas las fuentes de este directorio se distribuyen bajo la **SIL Open Font License 1.1** (OFL), que permite
redistribuirlas junto a la aplicación. Se descargaron de Google Fonts con \`scripts/vendor-fonts.mjs\`.

Familias: DM Sans, Rajdhani, Share Tech Mono, Chakra Petch, UnifrakturCook, VT323, Oswald, Saira, Pixelify Sans.

El texto completo de la OFL y la autoría de cada familia están en su ficha de
[Google Fonts](https://fonts.google.com/) y en el repositorio de cada proyecto.
`,
);
console.log('public/fonts/LICENSE.md escrito.');
