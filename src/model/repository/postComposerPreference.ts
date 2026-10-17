// La preferencia «Publicaciones» de Ajustes › Diseño: si la actividad social enseña el cuadro para publicar.
//
// Vive en su propio módulo por lo mismo que `feedMovePreference`: la leen el hub social (su chunk), Diseño (el de
// Ajustes) y el esqueleto de la actividad (el arranque). Declarada en `view/hooks/preferences`, el hub arrastraría
// todas las de apariencia a su chunk. Aquí lo compartido es este fichero y nada más.
//
// Se registra en el arranque porque `view/hooks/preferences` la re-exporta: `hydratePreferencesFromCloud` solo
// hidrata las preferencias ya declaradas.
import { POST_COMPOSER_KEY } from '../../core/constants/storageKeys';
import { createPreferenceStore } from './preferenceStore';

/**
 * ¿Enseña el feed el cuadro para publicar? Por defecto SÍ: esconderlo es lo que se elige. No da ni quita permiso
 * para publicar —eso es del rango—, solo decide si el cuadro está a la vista. Sin efecto en el DOM.
 */
export const postComposerPreference = createPreferenceStore<boolean>({
  key: POST_COMPOSER_KEY,
  parse: (raw) => raw !== 'off',
  serialize: (value) => (value ? 'on' : 'off'),
  cloudField: 'showPostComposer',
  fromCloud: (value) => (typeof value === 'boolean' ? value : null),
});
