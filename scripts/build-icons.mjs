// Rasteriza `public/favicon.svg` a los iconos en mapa de bits que piden navegadores y sistemas: `favicon-16.png`,
// `favicon-32.png`, `icon-192.png`, `icon-512.png` y `favicon.ico` (16, 32 y 48 px dentro).
//
// El SVG es la FUENTE: es lo que se toca para cambiar el icono, y todo lo demás sale de él. Antes los PNG y el
// .ico se hacían a mano y nada garantizaba que siguieran siendo el mismo dibujo.
//
// POR QUÉ NO VA EN `npm run build`: como `build-share-card.mjs`, exige un Chromium de Playwright. Se ejecuta a
// mano cuando cambia el SVG y su salida se versiona con él. Uso:
//
//   node scripts/build-icons.mjs
//
// Tras regenerarlos, sube el `?v=` de los iconos en `index.html` y `public/manifest.json`: los navegadores
// guardan el favicon por su URL durante mucho tiempo y sin eso seguirían enseñando el viejo.
//
// El .ico lleva los PNG tal cual dentro (formato admitido desde Windows Vista y por todos los navegadores
// actuales), así que no hace falta ninguna dependencia para escribir mapas de bits BMP.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const PNG_SALIDAS = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];
const ICO_TAMANOS = [16, 32, 48];

/** Un PNG del SVG al tamaño pedido, con las esquinas redondeadas transparentes. */
async function rasterizar(page, svg, tamano) {
  await page.setViewportSize({ width: tamano, height: tamano });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${tamano}px;height:${tamano}px}</style>${svg}`);
  return page.screenshot({ type: 'png', omitBackground: true });
}

/** Empaqueta varios PNG cuadrados en un .ico (cabecera + directorio + los PNG seguidos). */
function empaquetarIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(imagenes.length, 4);
  let desplazamiento = 6 + 16 * imagenes.length;
  const entradas = imagenes.map(({ tamano, png }) => {
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(tamano >= 256 ? 0 : tamano, 0);
    entrada.writeUInt8(tamano >= 256 ? 0 : tamano, 1);
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(png.length, 8);
    entrada.writeUInt32LE(desplazamiento, 12);
    desplazamiento += png.length;
    return entrada;
  });
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map(({ png }) => png)]);
}

async function main() {
  const svg = await readFile(path.join(publicDir, 'favicon.svg'), 'utf8');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [nombre, tamano] of PNG_SALIDAS) {
      const png = await rasterizar(page, svg, tamano);
      await writeFile(path.join(publicDir, nombre), png);
      console.log(`${nombre}: ${tamano}×${tamano}, ${(png.length / 1024).toFixed(1)} kB`);
    }
    // Uno detrás de otro: comparten página, y cada uno cambia el tamaño de la ventana.
    const imagenes = [];
    for (const tamano of ICO_TAMANOS) imagenes.push({ tamano, png: await rasterizar(page, svg, tamano) });
    const ico = empaquetarIco(imagenes);
    await writeFile(path.join(publicDir, 'favicon.ico'), ico);
    console.log(`favicon.ico: ${ICO_TAMANOS.join(', ')} px, ${(ico.length / 1024).toFixed(1)} kB`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
