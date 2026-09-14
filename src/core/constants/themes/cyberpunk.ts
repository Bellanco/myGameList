// «Sin futuro» (cyberpunk) — El HUD de Night City: amarillo ácido, cian y magenta sobre negro azulado, con marcos de interfaz.
//
// Su color y su skin: `src/styles/themes/cyberpunk/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const cyberpunk = {
  id: 'cyberpunk',
  label: 'Sin futuro',
  accent: '#fcee0a',
  accent2: '#00f0ff',
  bg: { dark: '#08090d', light: '#e7eaee' },
  voice: {
    /* Cyberpunk 2077: en Night City todo pasa por un implante, y todo implante acaba fallando. */
    appError: 'Fallo en el implante.',
    /* Cyberpunk 2077: todo pasa por el enlace a la red. */
    appOffline: 'Te has quedado sin enlace a la red.',
  },
} as const satisfies ThemeDefinition;
