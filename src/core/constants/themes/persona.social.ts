// La voz de «Ladrones de corazones» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `persona.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const personaSocial = {
  /* Persona 5: los Confidentes son los vínculos que cultivas, y se llevan por teléfono. */
  error: 'Tus Confidentes no cogen el teléfono.',
  /* Persona 5: a los Confidentes se les llama por teléfono, y sin cobertura no hay llamada que hacer. */
  offline: 'No hay cobertura para llamar a tus Confidentes.',
} as const satisfies ThemeSocialVoice;
