// «Cámara de pruebas» (portal) — Aperture Science, con el contraste del juego: la instalación MODERNA en oscuro y la ANTIGUA
// —pergamino y madera— en claro.
//
// Su color y su skin: `src/styles/themes/portal/`. Su sitio en el selector: el orden de `THEMES` en
// `constants/palettes.ts`. Para tocar cualquier otra cosa de este tema, `docs/temas.md`.
import type { ThemeDefinition } from './theme';

export const portal = {
  id: 'portal',
  label: 'Cámara de pruebas',
  accent: '#29b6f6',
  accent2: '#ff9e1b',
  bg: { dark: '#12171b', light: '#e7dabd' },
  voice: {
    // Portal: «sigues vivo» es con lo que GLaDOS cierra las pruebas, así que aquí le toca a la página no
    // estarlo.
    appError: 'Sigues vivo. La página no.',
    /* Portal: un portal necesita sus dos extremos. */
    appOffline: 'Falta el otro extremo del portal.',
  },
} as const satisfies ThemeDefinition;
