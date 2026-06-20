// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Claves de localStorage de versiones ANTIGUAS (v8–v11). Se barren al cargar para migrar a la clave
// actual (STORAGE_KEY). Una vez no queden instalaciones con estas claves, este módulo se puede eliminar.

import { LOCAL_SCHEMA_VERSION } from '../../core/constants/storageKeys';

export const LEGACY_STORAGE_KEYS = [
  'mis-listas-v11-unified',
  'mis-listas-v10-unified',
  'mis-listas-v10-separated',
  'mis-listas-v9-unified',
  'mis-listas-v9-separated',
  'mis-listas-v8-unified',
  'mis-listas-v8-separated',
] as const;

// Claves de campo de versiones ANTIGUAS (en español) que `migrateRepository.migrateData` reescribe al
// formato nuevo. Su presencia en un item delata que el estado guardado está en forma vieja.
const LEGACY_GAME_FIELDS = [
  'nombre', 'plataformas', 'plataforma', 'generos', 'genero', 'puntuacion', 'reseña',
  'pf', 'pd', 'razones', 'razon', 'años', 'steam_deck', 'volver', 'rejugabilidad', 'horas',
] as const;

function itemsHaveLegacyFields(items: unknown): boolean {
  return (
    Array.isArray(items) &&
    items.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return LEGACY_GAME_FIELDS.some((field) => field in record);
    })
  );
}

/**
 * Detector puro del auto-upgrade del estado local (localStorage / IndexedDB `appState`). Decide si el
 * estado RAW (antes de normalizar) está en forma vieja y debe reescribirse en formato nuevo:
 *  - le falta la marca `schemaVersion` (o es menor que la actual) teniendo datos, o
 *  - algún item conserva claves de campo legacy en español (`nombre`, `generos`, `pf`…).
 * Devuelve `false` para estado ya nuevo (vacío incluido) → "si llega la nueva, no pasa por este código".
 */
export function localStateNeedsUpgrade(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  const source = (o.data && typeof o.data === 'object' ? o.data : o) as Record<string, unknown>;

  const tabs = ['c', 'v', 'e', 'p'] as const;
  const hasData = tabs.some((tab) => Array.isArray(source[tab]) && (source[tab] as unknown[]).length > 0);
  if (!hasData) return false;

  if (tabs.some((tab) => itemsHaveLegacyFields(source[tab]))) return true;

  const version = Number(o.schemaVersion);
  return !(Number.isFinite(version) && version >= LOCAL_SCHEMA_VERSION);
}
