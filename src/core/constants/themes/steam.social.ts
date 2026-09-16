// La voz de «Plata y acero» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `steam.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const steamSocial = {
  /* Las salas de espera del multijugador, que es lo más social que tiene un cliente de juegos. */
  error: 'La sala se ha quedado vacía.',
  /* Un cliente de juegos sin conexión no entra a la sala: se queda intentando conectar con el servidor. */
  offline: 'No hay conexión con el servidor.',
} as const satisfies ThemeSocialVoice;
