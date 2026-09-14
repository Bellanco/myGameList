// La voz de «Solo hay guerra» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `grimdark.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const grimdarkSocial = {
  /* Warhammer 40.000: los astrópatas son quienes llevan los mensajes entre mundos. */
  error: 'El astrópata ha perdido la señal.',
  /* Warhammer 40.000: los mensajes entre mundos viajan por la Disformidad, y la Disformidad se los traga. */
  offline: 'La Disformidad se ha tragado la señal.',
} as const satisfies ThemeSocialVoice;
