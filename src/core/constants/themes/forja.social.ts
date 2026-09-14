// La voz de «Forja y temple» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `forja.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const forjaSocial = {
  /* el taller con el fuego encendido y ningún yunque sonando. */
  error: 'No hay nadie en el taller.',
  /* el taller no ha cerrado; lo que no llega es el recado de quién anda dentro. */
  offline: 'El taller está lejos: no llega el recado.',
} as const satisfies ThemeSocialVoice;
