// Fotografía `scripts/share-card.html` y la guarda como `public/share-card.jpg` (1200×630), que es la imagen de
// previsualización que usan las redes sociales al compartir un enlace de la app.
//
// POR QUÉ UN JPEG: los metadatos apuntaban al principio a un SVG, y X, WhatsApp, Facebook y LinkedIn NO
// renderizan SVG en `og:image` (aceptan PNG, JPEG, WebP y GIF). El resultado era una tarjeta vacía en todas
// ellas. La fuente editable es el HTML —es lo que se toca para cambiar el diseño— y el JPEG es su salida, que es
// lo que se publica en los metadatos.
//
// POR QUÉ LA FUENTE ES HTML Y NO SVG (desde octubre de 2026): el diseño se apoya en desenfoques (`filter: blur`,
// `backdrop-filter`) que un SVG no reproduce igual. Ver la cabecera de `share-card.html`.
//
// JPEG Y NO PNG: la tarjeta es un degradado a pantalla completa, justo lo que peor comprime un PNG. Con el diseño
// del SVG anterior, el mismo render pesaba 315 kB en PNG y 56 kB en JPEG de calidad 90, sin diferencia
// apreciable en el texto. Si algún día el diseño pasa a tener zonas planas o transparencia, reconsiderar el formato.
//
// POR QUÉ NO VA EN `npm run build`: exige un Chromium de Playwright, que no tiene por qué estar en cualquier
// entorno que construya la app. El JPEG se genera a mano cuando cambia el HTML y se versiona con él, igual que las
// fuentes autohospedadas de `vendor-fonts.mjs` y los iconos de `build-icons.mjs`. Uso:
//
//   node scripts/build-share-card.mjs
//
// La página pide sus fuentes y el icono por las rutas de la app (`/fonts/…`, `/favicon.svg`), y aquí se le
// sirven desde `public/`: el texto sale con las MISMAS fuentes que autohospeda la app, y no con lo que tenga
// instalado la máquina que la genere. Si falta alguna, el script falla en vez de dejar caer Chromium a Arial.
// Tras regenerarla, sube el `?v=` de `og:image` y `twitter:image` en `index.html`: las redes guardan la vista
// previa por su URL y sin eso seguirían enseñando la vieja.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const htmlPath = path.join(root, 'scripts', 'share-card.html');
const jpgPath = path.join(publicDir, 'share-card.jpg');

const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 90;
/** Origen inventado: nada sale a la red, cada petición se contesta desde el disco (ver `page.route`). */
const ORIGEN = 'http://tarjeta.local';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function main() {
  const browser = await chromium.launch();
  const faltan = [];
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGEN) {
        faltan.push(url.href);
        return route.abort();
      }
      const fichero = url.pathname === '/share-card.html' ? htmlPath : path.join(publicDir, decodeURIComponent(url.pathname));
      if (!fichero.startsWith(root)) return route.abort();
      try {
        const body = await readFile(fichero);
        return route.fulfill({ status: 200, body, contentType: TIPOS[path.extname(fichero)] ?? 'application/octet-stream' });
      } catch {
        faltan.push(url.pathname);
        return route.fulfill({ status: 404, body: '' });
      }
    });

    await page.goto(`${ORIGEN}/share-card.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (faltan.length) {
      throw new Error(`La tarjeta pide recursos que no están en public/ (¿cambió el hash de una fuente?): ${faltan.join(', ')}`);
    }
    const tarjeta = page.locator('.tarjeta');
    const jpg = await tarjeta.screenshot({ type: 'jpeg', quality: QUALITY });
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
