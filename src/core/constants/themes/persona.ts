// «Ladrones de corazones» (persona) — Persona 5: rojo rebelde, negro, blanco y oro de calendario, con la diagonal del pop-art.
//
// Su color y su skin: `src/styles/themes/persona/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const persona = {
  id: 'persona',
  label: 'Ladrones de corazones',
  accent: '#ff1f3d',
  bg: { dark: '#0d0d0d', light: '#f4f1ee' },
  voice: {
    /* Persona 5: los Palacios se desmoronan en cuanto les robas el Tesoro. */
    appError: 'El Palacio se ha derrumbado.',
    /* Persona 5: sin señal no hay entrada al Metaverso. */
    appOffline: 'Sin señal para entrar al Metaverso.',
  },
} as const satisfies ThemeDefinition;
