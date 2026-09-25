// Índice de las voces del HUB SOCIAL, una por tema. Es el gemelo de `constants/palettes.ts` y existe por una
// razón de peso —literal—: `palettes.ts` es código de ARRANQUE (lo importa media aplicación) y los textos del
// hub viajan en su chunk perezoso. Si el registro trajera también estas frases, volverían al arranque de todo
// el mundo, que es justo lo que se arregló al sacar `socialLabels.ts` de `labels.ts`.
//
// Lo que sí se comprueba es que las dos listas digan lo mismo: `tests/unit/themes.test.ts` falla si un tema
// está en `THEMES` y no aquí (o al revés).
import type { PaletteId } from '../palettes';
import { forjaSocial } from './forja.social';
import { arcadeSocial } from './arcade.social';
import { witcherSocial } from './witcher.social';
import { personaSocial } from './persona.social';
import { portalSocial } from './portal.social';
import { cyberpunkSocial } from './cyberpunk.social';
import { seaofstarsSocial } from './seaofstars.social';
import { grimdarkSocial } from './grimdark.social';
import type { ThemeSocialVoice } from './theme';

const SOCIAL_VOICES: Record<PaletteId, ThemeSocialVoice> = {
  forja: forjaSocial,
  arcade: arcadeSocial,
  witcher: witcherSocial,
  persona: personaSocial,
  portal: portalSocial,
  cyberpunk: cyberpunkSocial,
  seaofstars: seaofstarsSocial,
  grimdark: grimdarkSocial,
};

/** Una de las dos frases sociales de cada tema, indexada por paleta. */
export function socialVoiceByPalette(key: keyof ThemeSocialVoice): Record<PaletteId, string> {
  return Object.fromEntries(
    Object.entries(SOCIAL_VOICES).map(([id, voice]) => [id, voice[key]]),
  ) as Record<PaletteId, string>;
}
