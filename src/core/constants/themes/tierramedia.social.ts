// La voz de «No puedes pasar» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `tierramedia.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const tierramediaSocial = {
  /* la posada abierta, el fuego encendido y ni un viajero en las mesas. */
  error: 'No hay nadie en la posada.',
  /* la posada sigue ahí; lo que no llega es el recado de quién anda dentro. */
  offline: 'El recado no llega a la posada.',
} as const satisfies ThemeSocialVoice;
