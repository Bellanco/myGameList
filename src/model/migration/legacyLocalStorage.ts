// LEGACY COMPAT — borrar tras migrar (ver .github/prompts/migration/MIGRATION-FORWARD-PLAN.md).
// Claves de localStorage de versiones ANTIGUAS (v8–v11). Se barren al cargar para migrar a la clave
// actual (STORAGE_KEY). Una vez no queden instalaciones con estas claves, este módulo se puede eliminar.

export const LEGACY_STORAGE_KEYS = [
  'mis-listas-v11-unified',
  'mis-listas-v10-unified',
  'mis-listas-v10-separated',
  'mis-listas-v9-unified',
  'mis-listas-v9-separated',
  'mis-listas-v8-unified',
  'mis-listas-v8-separated',
] as const;
