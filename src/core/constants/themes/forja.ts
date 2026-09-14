// «Forja y temple» (forja) — El TEMA DE CASA: el taller. No imita a ningún juego, que es justo su papel — es el que ve quien
// abre la aplicación sin haber elegido nada. Metal al rojo que RELLENA y turquesa de temple que SEÑALA.
//
// Su color y su skin: `src/styles/themes/forja/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const forja = {
  id: 'forja',
  label: 'Forja y temple',
  accent: '#ff7a3c',
  accent2: '#2fd6c0',
  bg: { dark: '#0f1315', light: '#dee7e9' },
  voice: {
    /* en el taller, la pieza que se rompe es la que se sacó del fuego a destiempo. */
    appError: 'La pieza se ha roto en el yunque.',
    /* sin aire no hay fuego, y sin fuego el taller sigue ahí pero no se puede trabajar. */
    appOffline: 'La fragua se ha quedado sin aire.',
  },
} as const satisfies ThemeDefinition;
