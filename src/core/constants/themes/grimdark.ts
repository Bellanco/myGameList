// «Solo hay guerra» (grimdark) — Warhammer 40.000: pantalla de cogitador verde fósforo, oro latón, hueso de pergamino y rojo.
//
// Su color y su skin: `src/styles/themes/grimdark/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const grimdark = {
  id: 'grimdark',
  label: 'Solo hay guerra',
  accent: '#43f558',
  accent2: '#e0a92b',
  bg: { dark: '#060b08', light: '#e7ddc3' },
  voice: {
    // Warhammer 40.000: el Omnissiah es la deidad máquina del Adeptus Mechanicus, a la que se le reza para que
    // los aparatos funcionen.
    appError: 'El Omnissiah no responde.',
    /* Warhammer 40.000: los mensajes viajan por la Disformidad, y la Disformidad se los traga. */
    appOffline: 'La Disformidad se ha tragado la señal.',
  },
} as const satisfies ThemeDefinition;
