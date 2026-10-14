/**
 * TODA IMAGEN ENTRA CON FUNDIDO, también las que se añadan mañana.
 *
 * Una imagen que aparece de golpe no rompe nada —no hay error, ni test de componente que lo note—: simplemente se
 * ve mal, y es la clase de detalle que se cuela pantalla a pantalla. Esto lee el código y exige a cada imagen su
 * forma de entrar (`core/utils/entradaDeImagen.ts`):
 *  1. Cada `<img>` lleva `ref={refEntradaDeImagen(…)}`, o gestiona su propia carga con `onLoad` (las piezas con
 *     estado propio: `GameCover`, la ruleta, la imagen de una publicación, el collage del resumen del año).
 *  2. Cada carátula de fondo que se escribe en línea (`url("${…}")`) tiene su `refEntradaDeFondo(…)` en el mismo
 *     fichero: uno por fondo.
 *  3. Las hojas de esas capas de fondo incluyen el mixin que hace el fundido.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENTES = Object.keys(import.meta.glob('../../src/**/*.tsx')).map((ruta) => ruta.replace('../../', ''));

const fuente = (ruta: string) => readFileSync(ruta, 'utf8');

/** Las etiquetas `<img …/>` de un fichero, enteras (pueden ocupar varias líneas). Sin los comentarios de bloque, que
 *  hablan de `<img>` sin serlo. */
const etiquetasImg = (codigo: string): string[] =>
  [...codigo.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/<img\s[\s\S]*?\/>/g)].map((m) => m[0]);

const veces = (codigo: string, patron: RegExp) => (codigo.match(patron) ?? []).length;

describe('entrada de las imágenes', () => {
  it('hay componentes que leer', () => {
    expect(COMPONENTES.length).toBeGreaterThan(50);
  });

  it('cada <img> entra con fundido (refEntradaDeImagen) o gestiona su propia carga (onLoad)', () => {
    const sueltas = COMPONENTES.flatMap((ruta) =>
      etiquetasImg(fuente(ruta))
        .filter((etiqueta) => !/refEntradaDeImagen\(/.test(etiqueta) && !/\bonLoad=/.test(etiqueta))
        .map((etiqueta) => `${ruta}: ${etiqueta.replace(/\s+/g, ' ').slice(0, 100)}`),
    );
    expect(sueltas).toEqual([]);
  });

  it('cada carátula de fondo en línea tiene su refEntradaDeFondo', () => {
    const sinRef = COMPONENTES.flatMap((ruta) => {
      const codigo = fuente(ruta);
      const fondos = veces(codigo, /url\("\$\{/g);
      const refs = veces(codigo, /refEntradaDeFondo\(/g);
      return fondos > refs ? [`${ruta}: ${fondos} fondos y ${refs} refEntradaDeFondo`] : [];
    });
    expect(sinRef).toEqual([]);
  });

  it('las capas de fondo de esas piezas funden con el mixin', () => {
    const hojas: Record<string, number> = {
      'src/styles/_table.scss': 1,
      'src/styles/social.scss': 1,
      'src/styles/reviews.scss': 2,
      'src/styles/yearSummary.scss': 2,
    };
    for (const [hoja, esperadas] of Object.entries(hojas)) {
      expect(veces(fuente(hoja), /@include entrada\.de-fondo/g), hoja).toBeGreaterThanOrEqual(esperadas);
    }
  });
});
