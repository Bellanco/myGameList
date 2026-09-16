// La voz de «Cámara de pruebas» en el HUB SOCIAL.
//
// EN UN FICHERO APARTE, y no dentro de `portal.ts`, porque el registro de temas es código de ARRANQUE: si estas
// frases colgaran de la ficha, el bundler las arrastraría al chunk que descarga todo el mundo (medido: pasó, y
// costaba ~0,7 kB comprimidos de textos que solo lee quien abre el hub). Con el corte hecho aquí, el arranque se
// lleva la ficha y el chunk perezoso del hub se lleva esto. Lo comprueba `tests/unit/themes.test.ts`.
import type { ThemeSocialVoice } from './theme';

export const portalSocial = {
  /* Portal: el Cubo de Compañía, la única compañía que dan las pruebas. */
  error: 'El Cubo de Compañía no ha venido.',
  /* Portal: un portal necesita sus DOS extremos; con uno solo no lleva a ninguna parte. */
  offline: 'Falta el otro extremo del portal.',
} as const satisfies ThemeSocialVoice;
