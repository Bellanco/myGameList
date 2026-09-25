// F1 — REGISTRO DE TEMAS (paletas de color). Este fichero es el ÍNDICE: la lista de los ocho y todo lo que
// se deriva de ella —el tipo `PaletteId`, la lista del selector de Ajustes, cuál es el de por defecto y las
// voces por tema—. Aquí NO se escribe ningún color ni ninguna frase: la ficha de cada tema vive en
// `themes/<id>.ts` y su color en `src/styles/themes/<id>/`.
//
// ▟ CREAR, EDITAR O BORRAR UN TEMA: la receta está en `docs/temas.md`, y `tests/unit/themes.test.ts` avisa
//   si algo queda a medias. En corto, crear uno es:
//     1) `constants/themes/<id>.ts` — la ficha (identidad, `--bg`, voz) y la voz social;
//     2) `styles/themes/<id>/_colors.scss` — CAPA 2 y 2b (+ `<id>.scss` si quiere skin, y `_fonts.scss`
//        si trae letra propia, que se genera con `scripts/vendor-fonts.mjs`);
//     3) sumarlo a `THEMES` (aquí), a `themes/social.ts`, al índice `styles/themes/_index.scss` y al mapa
//        `BG` del anti-flash de `index.html`;
//     4) si tiene skin y NO es el de por defecto, a `SKIN_LOADERS` en `view/hooks/paletteSkin.ts`.
//   Nada más: el selector de Ajustes, la persistencia local y la sincronización en Firestore leen de
//   `PALETTES` y se enteran solos.

import type { ThemePreference } from '../../view/hooks/useTheme';
import type { ThemeDefinition, ThemeVoice } from './themes/theme';
import { forja } from './themes/forja';
import { arcade } from './themes/arcade';
import { witcher } from './themes/witcher';
import { persona } from './themes/persona';
import { portal } from './themes/portal';
import { cyberpunk } from './themes/cyberpunk';
import { seaofstars } from './themes/seaofstars';
import { grimdark } from './themes/grimdark';

/**
 * LOS OCHO, en el orden en que se ofrecen. El de por defecto va primero por costumbre, no por regla.
 * El mismo orden se repite en `styles/themes/_index.scss`, que es lo que hace que una lista y otra se
 * lean igual; no es un acoplamiento (entre temas no hay dependencias), es cortesía para quien lee.
 */
export const THEMES = [forja, arcade, witcher, persona, portal, cyberpunk, seaofstars, grimdark] as const;

/** El `data-palette` de cualquier tema del registro. Se DERIVA de `THEMES`: añadir un tema al array de
 *  arriba es lo único que hace falta para que su id sea válido en todo el TypeScript del proyecto. */
export type PaletteId = (typeof THEMES)[number]['id'];

/** La ficha de un tema tal y como la consume la interfaz (el selector de Ajustes). El `id` se estrecha al
 *  de una paleta REAL: sin eso, `PALETTES.map(p => setPalette(p.id))` no compila, porque `ThemeDefinition`
 *  admite cualquier cadena como id (es el contrato de un tema, no el registro). */
export type PaletteMeta = ThemeDefinition & { readonly id: PaletteId };

/** El tema que ve quien no ha elegido ninguno. Debe coincidir con el respaldo del anti-flash de
 *  `index.html` y con el skin que carga `styles/index.scss`; lo comprueba el test de temas. */
export const DEFAULT_PALETTE: PaletteId = forja.id;

export const PALETTES: readonly PaletteMeta[] = THEMES;

const PALETTE_IDS = new Set<string>(THEMES.map((t) => t.id));

/**
 * Ids que un tema tuvo ANTES de renombrarse. Siguen guardados en el localStorage y en la preferencia de la
 * nube de quien ya los eligió, y sin esta tabla esa gente caería al tema por defecto sin haberlo pedido. Un
 * `Map` y no un objeto: con un literal, `'constructor'` o `'toString'` devolverían algo. El anti-flash de
 * `index.html` repite la tabla, porque corre antes que el bundle.
 */
const LEGACY_PALETTE_IDS: ReadonlyMap<string, PaletteId> = new Map([
  // «Plata y acero» nació como `steam` —el gabinete de cuero y latón— y se quedó con el id al volverse The
  // Witcher, que es lo que es desde entonces.
  ['steam', witcher.id],
]);

/** Valida un valor arbitrario (p. ej. de localStorage) y cae a la paleta por defecto si no es válido. */
export function parsePaletteId(raw: string | null | undefined): PaletteId {
  if (typeof raw !== 'string') return DEFAULT_PALETTE;
  if (PALETTE_IDS.has(raw)) return raw as PaletteId;
  return LEGACY_PALETTE_IDS.get(raw) ?? DEFAULT_PALETTE;
}

/** `--bg` de la paleta para el tema dado (para el `theme-color` del navegador). */
export function paletteBg(id: PaletteId, theme: ThemePreference): string {
  const meta = THEMES.find((p) => p.id === id) ?? THEMES[0];
  return meta.bg[theme];
}

/**
 * Una de las frases de la voz de cada tema, indexada por paleta — lo que antes era un `Record<PaletteId,
 * string>` escrito a mano en `labels.ts`, con ocho entradas que había que acordarse de añadir. Ahora la
 * obligación la pone el tipo `ThemeVoice` en la ficha del tema, así que un tema nuevo no compila hasta que
 * tiene voz, y este índice se rellena solo.
 */
export function voiceByPalette(key: keyof ThemeVoice): Record<PaletteId, string> {
  return Object.fromEntries(THEMES.map((t) => [t.id, t.voice[key]])) as Record<PaletteId, string>;
}
