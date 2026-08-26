// F4 — la preferencia «de qué listas veo los movimientos en mi actividad», declarada en su propio módulo.
//
// Vive aparte de `view/hooks/preferences` (donde están las de apariencia) por el presupuesto de arranque. El hub
// social necesita leerla y escribirla, así que importarla desde donde están las demás convertía a ese módulo —y a
// sus dependencias— en código compartido entre el chunk inicial y el del hub: el bundler los extrae, el arranque
// crece y `ci-validate` lo corta. Aquí lo compartido es este fichero y nada más.
//
// Sigue registrándose en el arranque (`view/hooks/preferences` la re-exporta), porque `hydratePreferencesFromCloud`
// solo hidrata las preferencias YA declaradas y la sesión de Google puede iniciarse sin abrir el hub.
import { FEED_MOVE_TABS_KEY } from '../../core/constants/storageKeys';
import { parseMoveTabsValue } from '../../core/social/moveTabsFilter';
import { createPreferenceStore } from './preferenceStore';

/**
 * De qué listas ve su dueño los mensajes de actividad («comenzó», «finalizó», «abandonó», «añadió»). Letras de lista en
 * orden canónico; por defecto, todas. Sin efecto en el DOM: solo expone el valor que consume el feed.
 */
export const feedMoveTabsPreference = createPreferenceStore<string>({
  key: FEED_MOVE_TABS_KEY,
  parse: (raw) => parseMoveTabsValue(raw),
  serialize: (value) => value,
  cloudField: 'feedMoveTabs',
  // Una cadena vacía SÍ es un valor (no ver ninguno), así que solo se ignora lo que no sea texto.
  fromCloud: (value) => (typeof value === 'string' ? parseMoveTabsValue(value) : null),
});
