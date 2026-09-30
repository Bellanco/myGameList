/**
 * Genera `src/styles/themes/forja/isotermas.svg`, las curvas de calor del fondo de Forja (§3 de `forja.scss`).
 *
 * ES UN SCRIPT DE MANTENIMIENTO, como `vendor-fonts.mjs`: se ejecuta a mano (`node scripts/forja-isotermas.mjs`) y
 * su resultado se commitea. La cuenta es fija —sin azar—, así que volver a ejecutarlo da el mismo fichero.
 *
 * EL SVG ES UNA MÁSCARA, NO UN DIBUJO: trazos blancos cuya opacidad dice cuánto pesa cada curva. El color lo pone
 * la capa de `forja.scss` con un degradado de las fichas del tema, y por eso un solo fichero vale para oscuro y
 * para claro. Si cambian el centro o el paso de aquí, el degradado de allí deja de caer sobre sus curvas: el
 * script imprime al final las medidas que tiene que llevar.
 *
 * Solo se escriben los tramos que caen dentro del lienzo: la pieza al rojo está fuera de cuadro, abajo a la
 * derecha, y de cada curva se ve menos de un cuarto.
 */
import { writeFileSync } from 'node:fs';

const W = 1512;
const H = 945;
const CX = W * 0.86;
const CY = H * 1.08;
const CURVAS = 34;
const PASO = Math.hypot(W, H) * 0.032;
/* Las curvas son elipses: más abiertas en horizontal, que es hacia donde se extiende la pantalla. */
const ELIPSE_X = 1.25;
const MARGEN = 20;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = rng(21);
/* Cuatro ondulaciones superpuestas. Todas las curvas comparten las mismas y solo derivan un poco de una a la
   siguiente: así se deforman juntas y nunca se cruzan. */
const ONDAS = [
  [2, 0.06],
  [3, 0.045],
  [5, 0.025],
  [7, 0.015],
].map(([k, a]) => ({ k, a, fase: R() * 6.28, deriva: (R() - 0.5) * 0.04 }));

const dentro = ([x, y]) => x >= -MARGEN && x <= W + MARGEN && y >= -MARGEN && y <= H + MARGEN;

const trazos = [];
for (let i = 0; i < CURVAS; i++) {
  const radio = PASO * (1.6 + i);
  const t = i / (CURVAS - 1);
  const maestra = i % 5 === 0;
  const puntos = [];
  for (let grado = 0; grado <= 360; grado++) {
    const th = (grado / 360) * Math.PI * 2;
    let q = 1;
    for (const o of ONDAS) q += o.a * Math.sin(o.k * th + o.fase + i * o.deriva * 6);
    puntos.push([Math.round(CX + Math.cos(th) * radio * q * ELIPSE_X), Math.round(CY + Math.sin(th) * radio * q)]);
  }
  /* Tramos seguidos dentro del lienzo, en coordenadas relativas: enteros pequeños, un tercio del peso. */
  let d = '';
  let previo = null;
  for (const p of puntos) {
    if (!dentro(p)) {
      previo = null;
      continue;
    }
    d += previo ? `l${p[0] - previo[0]} ${p[1] - previo[1]}` : `M${p[0]} ${p[1]}`;
    previo = p;
  }
  if (!d) continue;
  /* Se apagan al enfriarse, y una de cada cinco va más marcada, como las maestras de un mapa. */
  const peso = ((1 - t * 0.75) * (maestra ? 1.5 : 1)) / 1.5;
  trazos.push(
    `<path d="${d}" stroke-opacity="${peso.toFixed(3)}" stroke-width="${maestra ? 1.2 : 0.8}"/>`,
  );
}

const svg =
  /* `vector-effect` no se hereda, así que va por hoja de estilo: el trazo se queda en su grosor aunque la capa se
     estire hasta los 3840 px de una pantalla grande. */
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
  `<style>path{vector-effect:non-scaling-stroke}</style><g fill="none" stroke="#fff">${trazos.join('')}</g></svg>\n`;
const destino = new URL('../src/styles/themes/forja/isotermas.svg', import.meta.url);
writeFileSync(destino, svg);

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const ultimo = PASO * (1.6 + CURVAS - 1);
console.log(`isotermas.svg: ${trazos.length} curvas, ${svg.length} bytes`);
console.log(
  `degradado de forja.scss: ellipse ${pct((ultimo * ELIPSE_X) / W)} ${pct(ultimo / H)} at ${pct(CX / W)} ${pct(CY / H)}` +
    ` · forja ${pct(1.6 / (1.6 + CURVAS - 1))} · latón ${pct((1.6 + 0.35 * (CURVAS - 1)) / (1.6 + CURVAS - 1))} · temple 100%`,
);
