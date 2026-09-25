// La voz de «Plata y acero» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `witcher.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const witcherSocial = {
  /* The Witcher 3: lo más social del Continente es una partida de gwent en la taberna. */
  error: 'No queda nadie en la mesa de gwent.',
  /* Las noticias viajan por mensajero; sin él, la taberna no se entera de nada. */
  offline: 'Ningún mensajero llega a la taberna.',
} as const satisfies ThemeSocialVoice;
