// «Plata y acero» (witcher) — The Witcher: el ACERO del brujo. Metal templado, las cinco señales repartidas por la rampa y el
// fuego de Igni como tinta. La PLATA rellena; Igni escribe.
//
// Su color y su skin: `src/styles/themes/witcher/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const witcher = {
  id: 'witcher',
  label: 'Plata y acero',
  accent: '#c6ced8',
  accent2: '#ff8f4a',
  bg: { dark: '#141922', light: '#d8e0e7' },
  voice: {
    /* The Witcher: el medallón del brujo vibra cuando hay algo malo cerca. */
    appError: 'El medallón vibra: algo va mal.',
    /* The Witcher: Sardinilla, la yegua de Geralt, que aparece donde no debe y se pierde donde menos conviene. */
    appOffline: 'Sardinilla no encuentra el camino.',
  },
} as const satisfies ThemeDefinition;
