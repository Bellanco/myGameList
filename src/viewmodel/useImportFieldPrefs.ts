import { useCallback, useRef, useState } from 'react';
import { setImportField } from '../core/import/fieldPrefs';
import { loadImportFieldPrefs, saveImportFieldPrefs } from '../model/repository/import/importFieldPrefsRepository';
import type { ImportField, ImportFieldGroup, ImportFieldPrefs } from '../model/types/import';

export interface UseImportFieldPrefs {
  prefs: ImportFieldPrefs;
  /** Activa/desactiva un campo de un grupo (juegos nuevos / ya en tus listas) y lo persiste. */
  setField: (group: ImportFieldGroup, field: ImportField, on: boolean) => void;
}

/**
 * Preferencia global de qué datos traslada el import (por grupo: juegos nuevos y juegos que ya tienes).
 * Se lee de localStorage de forma SÍNCRONA en el primer render (no hay ventana en la que se clasifique con
 * los valores por defecto) y se persiste en cada cambio. Independiente de la bandeja: la preferencia sobrevive
 * a vaciarla.
 */
export function useImportFieldPrefs(): UseImportFieldPrefs {
  const [prefs, setPrefs] = useState<ImportFieldPrefs>(loadImportFieldPrefs);

  // Igual que en la bandeja: las mutaciones parten del ÚLTIMO valor aunque se encadenen varios clics antes del
  // re-render (marcar dos campos seguidos no debe perder el primero).
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const setField = useCallback((group: ImportFieldGroup, field: ImportField, on: boolean) => {
    const next = setImportField(prefsRef.current, group, field, on);
    if (next === prefsRef.current) return;
    prefsRef.current = next;
    setPrefs(next);
    saveImportFieldPrefs(next);
  }, []);

  return { prefs, setField };
}
