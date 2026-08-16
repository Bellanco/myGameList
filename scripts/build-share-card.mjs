// Rasteriza `public/share-card.svg` a `public/share-card.jpg` (1200×630), que es la imagen de previsualización
// que usan las redes sociales al compartir un enlace de la app.
//
// POR QUÉ EXISTE ESTE SCRIPT: los metadatos apuntaban a la versión SVG, y X, WhatsApp, Facebook y LinkedIn NO
// renderizan SVG en `og:image` (aceptan PNG, JPEG, WebP y GIF). El resultado era una tarjeta vacía en todas
// ellas. El SVG se conserva como FUENTE editable —es lo que se toca para cambiar el diseño— y el JPEG es su
// salida, que es lo que se publica en los metadatos.
//
// JPEG Y NO PNG: la tarjeta es un degradado a pantalla completa, justo lo que peor comprime un PNG. El mismo
// render pesa 315 kB en PNG y 56 kB en JPEG de calidad 90, sin diferencia apreciable en el texto. Si algún día
// el diseño pasa a tener zonas planas o transparencia, reconsiderar el formato.
//
// POR QUÉ NO VA EN `npm run build`: exige un Chromium de Playwright, que no tiene por qué estar en cualquier
// entorno que construya la app. El PNG se genera a mano cuando cambia el SVG y se versiona con él, igual que las
// fuentes autohospedadas de `vendor-fonts.mjs`. Uso:
//
//   node scripts/build-share-card.mjs
//
// La fuente DM Sans se carga desde `public/fonts` (la misma que autohospeda la app) para que el texto salga
// exactamente igual que en la interfaz; sin ella, Chromium caería al Arial del sistema y la tarjeta cambiaría de
// aspecto según la máquina que la genere.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const svgPath = path.join(publicDir, 'share-card.svg');
const jpgPath = path.join(publicDir, 'share-card.jpg');

const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 90;

/** Localiza el woff2 de DM Sans (lleva hash de contenido en el nombre, así que no se puede fijar el literal). */
async function findDmSans() {
  const files = await readdir(path.join(publicDir, 'fonts'));
  const latin = files.find((name) => name.startsWith('dm-sans-latin-') && name.endsWith('.woff2'));
  if (!latin) {
    throw new Error('No se encontró el woff2 de DM Sans en public/fonts (¿se ejecutó vendor-fonts.mjs?).');
  }
  return path.join(publicDir, 'fonts', latin);
}

async function main() {
  const svg = await readFile(svgPath, 'utf8');
  const fontPath = await findDmSans();
  const fontData = await readFile(fontPath);

  // La fuente va incrustada como data: URI en vez de por ruta de fichero: así la página no depende de que
  // Chromium pueda leer del disco (`file://` con restricciones) y el render es idéntico en cualquier entorno.
  const html = `<!doctype html><meta charset="utf-8"><style>
    @font-face {
      font-family: 'DM Sans';
      src: url(data:font/woff2;base64,${fontData.toString('base64')}) format('woff2');
      font-weight: 100 900;
      font-display: block;
    }
    html, body { margin: 0; padding: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    svg { display: block; }
  </style>${svg}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const jpg = await page.screenshot({ type: 'jpeg', quality: QUALITY });
    await writeFile(jpgPath, jpg);
    console.log(`share-card.jpg generado: ${WIDTH}×${HEIGHT}, ${(jpg.length / 1024).toFixed(1)} kB`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
