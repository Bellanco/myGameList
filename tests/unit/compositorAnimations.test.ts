import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * NINGUNA ANIMACIÓN INFINITA PUEDE MOVER LO QUE NO MUEVE EL COMPOSITOR.
 *
 * Es la lección del barrido de rendimiento del 07-10-2026: basta UNA animación en bucle de `text-shadow`,
 * `clip-path`, `background-position` o `drop-shadow` para que el navegador recorra estilo, maquetación y pintado
 * en cada fotograma —aunque el efecto solo se vea un instante cada veinte segundos—. Medido en Chrome con GPU real:
 * 1,4-1,9 s de hilo principal cada 10 s en reposo, contra 0,1-0,2 s del tema por defecto. Y no avisa: la pantalla
 * se ve bien; lo que se resiente es la batería, el scroll y la respuesta al teclear.
 *
 * SE COMPRUEBA SOBRE EL CONTENIDO, NO SOBRE LAS PANTALLAS. Se lee TODO el CSS de `src/styles`, así que da igual
 * en qué pantalla acabe la regla: una pantalla, un componente o un tema nuevos quedan cubiertos sin tocar nada.
 *
 * QUÉ HACER SI FALLA, por orden:
 *   1. Mover lo mismo con lo que sí compone la GPU: `transform` en vez de `background-position` (los barridos de
 *      los lienzos del feed), u `opacity` sobre una copia que ya lleva el efecto pintado (el glitch de los chips
 *      de «Sin futuro», con `data-text`).
 *   2. Si el efecto es un destello de vez en cuando, lanzarlo A PULSOS: una animación de una sola vez colgada de
 *      `:root[data-pulso="N"]`, que marca `view/hooks/useEffectPulses.ts`. Así se hicieron los glitch de títulos
 *      y nombres, el brillo de «Sol y luna» y la gota de «Plata y acero».
 * Una animación FINITA (la entrada de una tarjeta, un destello al guardar) no entra aquí: acaba y deja de costar.
 */

/** Lo que el compositor mueve sin el hilo principal. `filter` también, salvo con `drop-shadow` o `url()`. */
const COMPUESTAS = new Set(['opacity', 'transform', 'translate', 'rotate', 'scale']);
/** No son propiedades animadas sino de la propia regla de fotograma. */
const DE_FOTOGRAMA = new Set(['animation-timing-function', 'animation-composition']);

/**
 * Todas las hojas, a cualquier profundidad: las de pantalla, las comunes y las de cada tema. El glob de Vite solo
 * ENUMERA —con `?raw` Vitest devuelve vacío el contenido de un `.scss`, ver `tests/node-fs.d.ts`— y `readFileSync`
 * lee, con la ruta relativa a la raíz del repositorio, que es desde donde arranca vitest (como `themes.test.ts`).
 */
const HOJAS = Object.keys(import.meta.glob('../../src/styles/**/*.{scss,css}'));

/** Quita los comentarios: hablan de animaciones viejas y confundirían a las expresiones de abajo. */
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Cuerpo de cada `@keyframes`, por nombre, de todas las hojas (una regla puede usar los de otra). */
function fotogramas(fuentes: Map<string, string>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const css of fuentes.values()) {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let i = (m.index ?? 0) + m[0].length;
      let nivel = 1;
      const inicio = i;
      while (nivel > 0 && i < css.length) {
        if (css[i] === '{') nivel += 1;
        else if (css[i] === '}') nivel -= 1;
        i += 1;
      }
      mapa.set(m[1], css.slice(inicio, i - 1));
    }
  }
  return mapa;
}

/** Propiedades de un `@keyframes` que el compositor NO mueve. */
function noCompuestas(cuerpo: string): string[] {
  const sinParentesis = cuerpo.replace(/\([^()]*\)/g, '()');
  const props = new Set([...sinParentesis.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
  return [...props].filter((p) => {
    if (COMPUESTAS.has(p) || DE_FOTOGRAMA.has(p)) return false;
    if (p === 'filter') return /drop-shadow|url\(/.test(cuerpo);
    return true;
  });
}

interface Infinita { hoja: string; selector: string; nombre: string }

/** Cada regla con una animación en bucle: el atajo `animation: … infinite` o la propiedad suelta. */
function infinitas(fuentes: Map<string, string>, nombres: Set<string>): Infinita[] {
  const lista: Infinita[] = [];
  for (const [hoja, css] of fuentes) {
    // Bloques sin llaves dentro: las reglas de verdad, también las anidadas en `@media`.
    for (const bloque of css.matchAll(/([^{};]*)\{([^{}]*)\}/g)) {
      const [, selector, cuerpo] = bloque;
      const nombresDe = (valor: string) => valor.split(/[\s,]+/).filter((t) => nombres.has(t));
      for (const decl of cuerpo.matchAll(/(?:^|;)\s*animation\s*:\s*([^;]+)/g)) {
        if (/\binfinite\b/.test(decl[1])) nombresDe(decl[1]).forEach((nombre) => lista.push({ hoja, selector: selector.trim(), nombre }));
      }
      const veces = cuerpo.match(/animation-iteration-count\s*:\s*([^;]+)/);
      const nombre = cuerpo.match(/animation-name\s*:\s*([^;]+)/);
      if (veces && /\binfinite\b/.test(veces[1]) && nombre) {
        nombresDe(nombre[1]).forEach((n) => lista.push({ hoja, selector: selector.trim(), nombre: n }));
      }
    }
  }
  return lista;
}

const fuentes = new Map(HOJAS.map((ruta) => {
  const enRepo = ruta.replace('../../', '');
  return [enRepo.replace('src/styles/', ''), sinComentarios(readFileSync(enRepo, 'utf8'))];
}));
const keyframes = fotogramas(fuentes);
const enBucle = infinitas(fuentes, new Set(keyframes.keys()));

describe('animaciones en bucle', () => {
  it('el detector encuentra las animaciones infinitas que hay (si no, este test no probaría nada)', () => {
    // Hay varias legítimas: la deriva de texturas, las estrellas, el brillo del acero. Si sale cero, el que
    // falla es el detector —una hoja movida, un cambio de sintaxis—, no el CSS.
    expect(enBucle.length).toBeGreaterThan(10);
  });

  it('ninguna mueve lo que el compositor no mueve', () => {
    const malas = enBucle
      .map(({ hoja, selector, nombre }) => ({ hoja, selector, nombre, props: noCompuestas(keyframes.get(nombre) ?? '') }))
      .filter((a) => a.props.length > 0)
      .map((a) => `${a.hoja} · @keyframes ${a.nombre} anima ${a.props.join(', ')} en bucle ← ${a.selector.slice(-120)}`);
    expect(malas, 'Ver la cabecera de este fichero: pasar a transform/opacity o lanzarla a pulsos (useEffectPulses).').toEqual([]);
  });

  it('el detector reconoce lo caro (comprobación del propio detector)', () => {
    expect(noCompuestas('0% { text-shadow: none; } 50% { text-shadow: 1px 0 red; }')).toEqual(['text-shadow']);
    expect(noCompuestas('to { background-position: 10px 0; }')).toEqual(['background-position']);
    expect(noCompuestas('50% { filter: drop-shadow(0 0 6px red); }')).toEqual(['filter']);
    expect(noCompuestas('50% { clip-path: inset(10% 0 0 0); transform: none; }')).toEqual(['clip-path']);
    expect(noCompuestas('50% { filter: brightness(1.2); opacity: .5; transform: translateX(4px); }')).toEqual([]);
  });
});
