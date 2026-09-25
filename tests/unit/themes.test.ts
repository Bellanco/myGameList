import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, THEMES, parsePaletteId, type PaletteId } from '../../src/core/constants/palettes';
import { socialVoiceByPalette } from '../../src/core/constants/themes/social';
import { premiosVoiceByPalette } from '../../src/core/constants/themes/premios';

/**
 * EL CONTRATO DE UN TEMA, comprobado.
 *
 * Un tema está repartido por necesidad: su color tiene que ir en el bundle base (pinta el primer fotograma),
 * su skin en un chunk perezoso (pesa y casi nadie lo usa), su ficha en TypeScript (el selector, la sync) y su
 * `--bg` también en el `<script>` del anti-flash (se ejecuta antes de que exista React). Son sitios distintos
 * porque hacen cosas distintas, no por descuido.
 *
 * Lo que este fichero impide es lo ÚNICO malo de ese reparto: que un tema quede A MEDIAS. Cada `it` de abajo es
 * uno de los olvidos posibles al crear, editar o borrar uno, y falla diciendo cuál — esa es la diferencia entre
 * enterarte aquí en dos segundos o enterarte en producción por un parpadeo raro al cargar. La receta en prosa
 * está en `docs/temas.md`; si cambias el contrato (un token nuevo obligatorio, otra pieza), cambia los dos.
 *
 * LEE LOS FICHEROS CON `node:fs` y no con `?raw` como hace `serviceWorker.test.ts`: aquí la mitad de lo que hay
 * que mirar son hojas `.scss`, y en vitest el pipeline de CSS las devuelve VACÍAS (sin `test.css`, un import de
 * CSS es un módulo vacío), así que `?raw` sobre un `.scss` da la cadena vacía y el contrato se cumpliría solo.
 */

// DOS HERRAMIENTAS, cada una para lo que sabe hacer: el glob de Vite ENUMERA (sus claves son fiables aunque el
// contenido de un `.scss` llegue vacío) y `readFileSync` LEE. Las rutas van relativas a la raíz del repositorio,
// que es desde donde arranca vitest.
const leer = (ruta: string) => readFileSync(ruta, 'utf8');
const existe = (ruta: string) => {
  try { leer(ruta); return true; } catch { return false; }
};

const ANTI_FLASH = leer('index.html');
const INDICE_SCSS = leer('src/styles/themes/_index.scss');
const ENTRADA_SCSS = leer('src/styles/index.scss');
const PALETTE_SKIN = leer('src/view/hooks/paletteSkin.ts');
const VENDOR_FONTS = leer('scripts/vendor-fonts.mjs');

const DIR_ESTILOS = 'src/styles/themes/';
const DIR_FICHAS = 'src/core/constants/themes/';
const HOJAS = import.meta.glob('../../src/styles/themes/*/*.scss');
const FICHEROS_TS = import.meta.glob('../../src/core/constants/themes/*.ts');
/** Las carpetas de `styles/themes`: una por tema, y ninguna más. */
const CARPETAS = [...new Set(Object.keys(HOJAS).map((r) => r.split('/').at(-2) as string))];

const IDS = THEMES.map((t) => t.id) as readonly PaletteId[];
const colorDe = (id: PaletteId) => (existe(`${DIR_ESTILOS}${id}/_colors.scss`) ? leer(`${DIR_ESTILOS}${id}/_colors.scss`) : '');

/** Los bloques `:root[data-palette="<id>"]` de una hoja, separados por modo. */
function bloques(css: string, id: string) {
  const oscuro: string[] = [];
  const claro: string[] = [];
  // Solo los bloques de DECLARACIONES (`:root[...]` y nada más antes de la llave): un selector con
  // descendientes —`:root[data-palette="x"] .chip`— es skin, no identidad, y aquí no cuenta.
  const re = new RegExp(`:root\\[data-palette="${id}"\\](\\[data-theme="light"\\])?\\s*\\{([^}]*)\\}`, 'g');
  for (const m of css.matchAll(re)) (m[1] ? claro : oscuro).push(m[2]);
  return { oscuro: oscuro.join('\n'), claro: claro.join('\n') };
}
const declara = (cuerpo: string, token: string) => new RegExp(`${token}\\s*:`).test(cuerpo);

/** CAPA 2: lo que un tema TIENE que decir de sí mismo. Lo que no está aquí se deriva en CAPA 1. */
const TOKENS_CAPA2 = [
  '--bg', '--surface', '--surface-hover', '--surface-elevated', '--border',
  '--text', '--text-muted', '--text-dim',
  '--steam', '--steam-hover', '--steam-rgb', '--tab-active',
  '--success', '--success-rgb', '--warn', '--warn-rgb', '--danger', '--danger-rgb',
  '--star-empty', '--star-full',
  '--chip-plat-fg', '--chip-plat-bg', '--chip-plat-border',
  '--hub-text', '--hub-text-muted',
];
/** CAPA 2b: los siete tonos, en sus dos papeles (relleno y texto). */
const TOKENS_CAPA2B = Array.from({ length: 7 }, (_u, i) => [`--cat-${i + 1}`, `--cat-${i + 1}-fg`]).flat();

describe('temas · el color de cada uno (CAPA 2 y 2b)', () => {
  it.each(IDS)('«%s» tiene su carpeta con `_colors.scss`', (id) => {
    expect(colorDe(id), `falta src/styles/themes/${id}/_colors.scss`).not.toBe('');
  });

  it.each(IDS)('«%s» define los tokens de identidad en oscuro y en claro', (id) => {
    const { oscuro, claro } = bloques(colorDe(id), id);
    const faltan = (cuerpo: string) => [...TOKENS_CAPA2, ...TOKENS_CAPA2B].filter((t) => !declara(cuerpo, t));
    expect(faltan(oscuro), `${id}, modo oscuro`).toEqual([]);
    expect(faltan(claro), `${id}, modo claro`).toEqual([]);
  });

  it.each(IDS)('«%s» aporta el tinte cálido que el modo claro usa para sombras y veladuras', (id) => {
    expect(declara(bloques(colorDe(id), id).claro, '--tint-rgb'), `${id} no declara --tint-rgb en claro`).toBe(true);
  });

  it('el índice de temas carga los colores de todos y de nadie más', () => {
    const usados = [...INDICE_SCSS.matchAll(/@use '\.\/(\w+)\/colors'/g)].map((m) => m[1]);
    expect([...usados].sort()).toEqual([...IDS].sort());
  });

  it('no hay carpetas de tema huérfanas (un tema borrado a medias)', () => {
    expect([...CARPETAS].sort()).toEqual([...IDS].sort());
  });
});

describe('temas · la ficha en TypeScript', () => {
  it.each(IDS)('«%s» tiene ficha y voz social propias', (id) => {
    expect(existe(`${DIR_FICHAS}${id}.ts`), `falta ${DIR_FICHAS}${id}.ts`).toBe(true);
    expect(existe(`${DIR_FICHAS}${id}.social.ts`), `falta ${DIR_FICHAS}${id}.social.ts`).toBe(true);
  });

  it('no hay fichas huérfanas: cada fichero de `constants/themes` es de un tema del registro', () => {
    const sueltos = Object.keys(FICHEROS_TS)
      .map((r) => (r.split('/').at(-1) as string).replace(/\.ts$/, ''))
      .filter((n) => !['theme', 'social', 'premios'].includes(n))
      .map((n) => n.replace(/\.social$/, ''));
    expect([...new Set(sueltos)].sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('«%s» habla con su propia voz, y no en blanco', (id) => {
    const tema = THEMES.find((t) => t.id === id)!;
    for (const frase of [tema.voice.appError, tema.voice.appOffline]) expect(frase.trim().length).toBeGreaterThan(8);
    for (const clave of ['error', 'offline'] as const) {
      expect(socialVoiceByPalette(clave)[id].trim().length, `voz social ${clave} de ${id}`).toBeGreaterThan(8);
      // La misma exigencia para la sección de premios: un tema nuevo que se quede sin frase saldría mudo justo
      // cuando algo se ha caído, que es cuando más se nota.
      expect(premiosVoiceByPalette(clave)[id].trim().length, `voz de premios ${clave} de ${id}`).toBeGreaterThan(8);
    }
  });

  // El mismo criterio que con las frases de la app: copiar y pegar la de otro tema sin cambiar el guiño deja dos
  // mundos hablando igual, que es justo lo que estas voces existen para evitar.
  it('ningún tema repite la frase de premios de otro', () => {
    for (const clave of ['error', 'offline'] as const) {
      const frases = IDS.map((id) => premiosVoiceByPalette(clave)[id]);
      expect(new Set(frases).size, `voces de premios repetidas en «${clave}»`).toBe(frases.length);
    }
  });

  it('ningún tema repite la frase de otro (copiar y pegar sin cambiar el guiño)', () => {
    const frases = THEMES.map((t) => t.voice.appError);
    expect(new Set(frases).size).toBe(frases.length);
  });
});

describe('temas · el fondo, que se declara en tres sitios', () => {
  // El CSS es el que se PINTA; la ficha alimenta el `theme-color` en caliente y el mapa del anti-flash lo pinta
  // antes de que exista React. Si derivan, la barra del navegador enseña un color que la página no tiene.
  it.each(IDS)('«%s» declara el mismo --bg en el CSS, en su ficha y en el anti-flash', (id) => {
    const { oscuro, claro } = bloques(colorDe(id), id);
    const delCss = (cuerpo: string) => cuerpo.match(/--bg:\s*([^;]+);/)?.[1].trim();
    const tema = THEMES.find((t) => t.id === id)!;
    const enHtml = ANTI_FLASH.match(new RegExp(`${id}: \\{ dark: '(#\\w+)', light: '(#\\w+)' \\}`));
    expect(enHtml, `${id} no está en el mapa BG de index.html`).not.toBeNull();
    expect({ dark: delCss(oscuro), light: delCss(claro) }).toEqual(tema.bg);
    expect({ dark: enHtml![1], light: enHtml![2] }).toEqual(tema.bg);
  });
});

describe('temas · el skin y quién lo carga', () => {
  const skinDe = (id: PaletteId) => `${DIR_ESTILOS}${id}/${id}.scss`;

  it.each(IDS)('el skin de «%s» lo carga quien le toca, y solo él', (id) => {
    const tiene = existe(skinDe(id));
    // `() =>` a secas y no `() => import(`: grimdark carga DOS hojas con un `Promise.all` (reutiliza los
    // keyframes de cyberpunk, ver la nota de `paletteSkin.ts`) y también cuenta como declarado.
    const enLoaders = new RegExp(`\\b${id}: \\(\\) =>`).test(PALETTE_SKIN);
    const enArranque = ENTRADA_SCSS.includes(`@use './themes/${id}/${id}'`);
    if (!tiene) {
      expect(enLoaders || enArranque, `${id} no tiene skin, pero alguien lo carga`).toBe(false);
      return;
    }
    if (id === DEFAULT_PALETTE) {
      // El tema por defecto pinta el primer fotograma: su skin va en el bundle base, no bajo demanda.
      expect(enArranque, `el skin de ${id} (por defecto) debe ir en styles/index.scss`).toBe(true);
      expect(enLoaders, `el skin de ${id} (por defecto) NO debe estar en SKIN_LOADERS`).toBe(false);
    } else {
      expect(enLoaders, `falta ${id} en SKIN_LOADERS (view/hooks/paletteSkin.ts)`).toBe(true);
      expect(enArranque, `el skin de ${id} no debe viajar en el bundle base`).toBe(false);
    }
  });

  it.each(IDS)('«%s», si trae letra propia, la declara en su carpeta y la usa su skin', (id) => {
    if (!existe(`${DIR_ESTILOS}${id}/_fonts.scss`)) return;
    expect(leer(skinDe(id)), `el skin de ${id} no usa su _fonts.scss`).toContain("@use './fonts'");
    expect(VENDOR_FONTS, `falta la entrada slug: '${id}' en scripts/vendor-fonts.mjs`).toContain(`slug: '${id}'`);
  });
});

describe('temas · el de por defecto', () => {
  it('es uno de los del registro y va primero en la lista del selector', () => {
    expect(IDS).toContain(DEFAULT_PALETTE);
    expect(THEMES[0].id).toBe(DEFAULT_PALETTE);
  });

  it('el anti-flash cae en él cuando no hay nada guardado', () => {
    expect(ANTI_FLASH).toContain(`palette = '${DEFAULT_PALETTE}';`);
  });

  it('el `theme-color` del <head> es su fondo oscuro (lo que se ve antes de ejecutar nada)', () => {
    const meta = ANTI_FLASH.match(/<meta name="theme-color" content="(#\w+)">/);
    expect(meta?.[1]).toBe(THEMES.find((t) => t.id === DEFAULT_PALETTE)!.bg.dark);
  });
});

describe('temas · un id renombrado sigue llevando a su tema', () => {
  // «Plata y acero» se llamaba `steam`. Ese valor sigue en el localStorage y en la preferencia de la nube de quien
  // lo eligió: si deja de reconocerse, esa persona cambia de tema sin haberlo pedido.
  it('`steam` se lee como `witcher`, en el TypeScript y en el anti-flash', () => {
    expect(parsePaletteId('steam')).toBe('witcher');
    expect(ANTI_FLASH).toMatch(/if \(palette === 'steam'\) \{\s*palette = 'witcher';/);
  });

  it('lo que no es un tema cae al de por defecto, aunque sea una clave de Object', () => {
    for (const raro of ['constructor', 'toString', '__proto__', '', 'STEAM']) {
      expect(parsePaletteId(raro), raro).toBe(DEFAULT_PALETTE);
    }
  });
});
