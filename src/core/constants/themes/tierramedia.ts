// «Oro y hoja» (tierramedia) — El TEMA DE CASA: la Tierra Media sin disfraz. Es el que ve quien abre la aplicación
// sin haber elegido nada. Oro que RELLENA y verde de hoja que SEÑALA. Sustituye a «Forja y temple» (id `forja`)
// desde el 06-10-2026: quien tenía guardado ese id llega aquí por `LEGACY_PALETTE_IDS` (`constants/palettes.ts`).
//
// Su color y su skin: `src/styles/themes/tierramedia/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const tierramedia = {
  id: 'tierramedia',
  label: 'Oro y hoja',
  accent: '#e3b04b',
  accent2: '#9bd27c',
  bg: { dark: '#10140f', light: '#ece3cc' },
  voice: {
    /* lo que se rompe no es la aplicación: es la compañía que iba de camino. */
    appError: 'La Compañía se ha roto por el camino.',
    /* la llamada existe y el camino también; lo que falta es la señal que la lleve de un monte a otro. */
    appOffline: 'Las almenaras no se han encendido.',
  },
} as const satisfies ThemeDefinition;
