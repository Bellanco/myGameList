// Persistencia LOCAL de la preferencia "qué datos traer" del import. localStorage (no IndexedDB) a propósito:
// es un objeto minúsculo y la lectura SÍNCRONA evita que el primer clasificar/actualizar use los valores por
// defecto mientras se hidrata. No se sincroniza por gist, igual que la bandeja. Best-effort: sin almacenamiento
// (modo privado, cuota) se trabaja con los valores por defecto.

import { IMPORT_FIELDS_KEY } from '../../../core/constants/storageKeys';
import { DEFAULT_IMPORT_FIELD_PREFS, normalizeImportFieldPrefs } from '../../../core/import/fieldPrefs';
import type { ImportFieldPrefs } from '../../types/import';

export function loadImportFieldPrefs(): ImportFieldPrefs {
  try {
    const raw = localStorage.getItem(IMPORT_FIELDS_KEY);
    if (!raw) return DEFAULT_IMPORT_FIELD_PREFS;
    return normalizeImportFieldPrefs(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_IMPORT_FIELD_PREFS;
  }
}

export function saveImportFieldPrefs(prefs: ImportFieldPrefs): void {
  try {
    localStorage.setItem(IMPORT_FIELDS_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort: la preferencia es local; un fallo de escritura no debe interrumpir la clasificación.
  }
}
