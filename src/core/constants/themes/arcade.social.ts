// La voz de «Inserte moneda» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `arcade.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const arcadeSocial = {
  /* la sala de recreativos, con las máquinas encendidas y nadie delante de ellas. */
  error: 'No queda nadie en la sala de recreativos.',
  /* la sala sigue abierta, pero sin señal no se ve quién hay dentro. */
  offline: 'La sala está a oscuras: no llega la señal.',
} as const satisfies ThemeSocialVoice;
