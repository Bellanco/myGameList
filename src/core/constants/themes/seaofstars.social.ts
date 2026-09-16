// La voz de «Sol y luna» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `seaofstars.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const seaofstarsSocial = {
  /* Sea of Stars: acampar con el grupo es donde el viaje se vuelve compañía. */
  error: 'Nadie ha llegado al campamento.',
  /* Sea of Stars: el campamento sigue ahí; lo que no hay ahora mismo es camino para llegar. */
  offline: 'El camino al campamento está cortado.',
} as const satisfies ThemeSocialVoice;
