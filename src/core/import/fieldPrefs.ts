// Lógica PURA de la preferencia "qué datos traer" del import (sin IO, sin React). Decide, para TODOS los
// juegos, qué campos traslada la bandeja al clasificar un juego nuevo y qué campos al actualizar uno que ya
// está en tus listas. La aplican los mappers de `staging.ts`; la persistencia vive en
// model/repository/import/importFieldPrefsRepository.ts.

import type { ImportField, ImportFieldGroup, ImportFieldPrefs, ImportFieldSelection } from '../../model/types/import';

/** Orden de presentación de los campos en la UI (y orden canónico para normalizar). */
export const IMPORT_FIELDS: readonly ImportField[] = ['platforms', 'genres', 'hours', 'grade'] as const;

export const IMPORT_FIELD_GROUPS: readonly ImportFieldGroup[] = ['newGames', 'existingGames'] as const;

/**
 * Valores por defecto = comportamiento histórico:
 * - juego NUEVO: se precarga todo lo que aporta el origen (plataformas, géneros, horas y nota).
 * - juego YA en tus listas: se suman plataformas y géneros y se rellenan las horas si faltaban; la nota NO
 *   se toca (es tuya, no la del origen) → hay que activarla a mano.
 */
export const DEFAULT_IMPORT_FIELD_PREFS: ImportFieldPrefs = {
  newGames: { platforms: true, genres: true, hours: true, grade: true },
  existingGames: { platforms: true, genres: true, hours: true, grade: false },
};

function normalizeSelection(raw: unknown, fallback: ImportFieldSelection): ImportFieldSelection {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ImportField, unknown>>;
  const out = {} as ImportFieldSelection;
  for (const field of IMPORT_FIELDS) {
    out[field] = typeof source[field] === 'boolean' ? (source[field] as boolean) : fallback[field];
  }
  return out;
}

/**
 * Saneado de lo leído de disco (o de una versión anterior): todo campo ausente o no booleano cae al valor por
 * defecto, así añadir un campo nuevo en el futuro no rompe las preferencias ya guardadas.
 */
export function normalizeImportFieldPrefs(raw: unknown): ImportFieldPrefs {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ImportFieldGroup, unknown>>;
  return {
    newGames: normalizeSelection(source.newGames, DEFAULT_IMPORT_FIELD_PREFS.newGames),
    existingGames: normalizeSelection(source.existingGames, DEFAULT_IMPORT_FIELD_PREFS.existingGames),
  };
}

/** Cambia un campo de un grupo. Pura; devuelve la MISMA referencia si no cambia nada (evita re-render/escritura). */
export function setImportField(
  prefs: ImportFieldPrefs,
  group: ImportFieldGroup,
  field: ImportField,
  on: boolean,
): ImportFieldPrefs {
  if (prefs[group][field] === on) return prefs;
  return { ...prefs, [group]: { ...prefs[group], [field]: on } };
}
