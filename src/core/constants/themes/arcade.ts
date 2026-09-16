// «Inserte moneda» (arcade) — La sala de recreativos de los ochenta y el DeLorean: violeta de neón sobre noche malva, cian de
// tubo y rosa chicle de pegatina. Todo lo que manda, brilla.
//
// Su color y su skin: `src/styles/themes/arcade/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const arcade = {
  id: 'arcade',
  label: 'Inserte moneda',
  accent: '#b23cff',
  accent2: '#22e5ff',
  bg: { dark: '#150a24', light: '#eee2fb' },
  voice: {
    /* la máquina se ha comido la ficha y la pantalla se ha quedado en negro. */
    appError: 'La máquina se ha tragado la ficha.',
    /* la sala sigue ahí, pero se ha ido la corriente y no hay nada encendido. */
    appOffline: 'Se ha ido la luz de la sala.',
  },
} as const satisfies ThemeDefinition;
