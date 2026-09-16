// La voz de «Sin futuro» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `cyberpunk.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const cyberpunkSocial = {
  /* Cyberpunk 2077: sin red no hay Night City, y todo pasa por la red. */
  error: 'Night City se ha quedado sin red.',
  /* Cyberpunk 2077: en Night City todo pasa por el enlace a la red, y sin enlace no hay ciudad. */
  offline: 'Te has quedado sin enlace a la red.',
} as const satisfies ThemeSocialVoice;
