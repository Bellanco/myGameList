// «Sol y luna» (seaofstars) — Sea of Stars: el oro de Zale (sol) y el azul de Valere (luna) sobre la noche estrellada.
//
// Su color y su skin: `src/styles/themes/seaofstars/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const seaofstars = {
  id: 'seaofstars',
  label: 'Sol y luna',
  accent: '#f5c13e',
  accent2: '#2bb3c4',
  bg: { dark: '#0e0c24', light: '#a6e9ec' },
  voice: {
    /* Sea of Stars: los Hijos del Solsticio y el eclipse que se lo traga todo. */
    appError: 'El eclipse se lo ha tragado.',
    /* Sea of Stars: el camino sigue estando, pero ahora mismo no se puede pasar. */
    appOffline: 'El camino está cortado.',
  },
} as const satisfies ThemeDefinition;
