// EL REGISTRO DE ACCIONES DEL PANEL (docs/plan-admin-rediseno.md, F6).
//
// Cada acción que el panel hace sobre alguien se apunta en `adminLog`: qué, sobre quién y cuándo, y —si se puede
// deshacer— el valor de antes. Sirve para dos cosas: saber qué se hizo (y cuándo) sin depender de la memoria, y
// DESHACER lo reversible desde el aviso de la acción o desde el registro.
//
// Solo es reversible lo que se deshace con una escritura simétrica y sin pérdida: el rango y el social. Purgar,
// borrar, migrar o propagar no tienen vuelta atrás, y el registro lo dice en vez de ofrecer un botón que mienta.
//
// Apuntar NUNCA bloquea la acción: si la escritura del registro falla (reglas sin desplegar, sin red), la acción ya
// está hecha y se avisa por consola. Un registro incompleto es mejor que una moderación que no se puede hacer.
import { useCallback, useState } from 'react';
import { setUserSocialEnabled, setUserTier } from '../model/repository/firebaseAdminRepository';
import {
  appendAdminLog,
  loadAdminLog,
  markAdminLogUndone,
  type AdminLogEntry,
} from '../model/repository/admin/adminPanelStore';
import { normalizeTier } from '../core/constants/tiers';

export type AdminLogDraft = Omit<AdminLogEntry, 'id' | 'undone' | 'at'>;

export function useAdminLog() {
  const [entries, setEntries] = useState<AdminLogEntry[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setEntries(await loadAdminLog());
      setError('');
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  /** Apunta una acción ya hecha. Devuelve la entrada guardada, o `null` si no se pudo apuntar. */
  const record = useCallback(async (draft: AdminLogDraft): Promise<AdminLogEntry | null> => {
    try {
      const saved = await appendAdminLog({ ...draft, at: Date.now() });
      setEntries((current) => [saved, ...(current || [])]);
      return saved;
    } catch (recordError) {
      console.warn('[admin] no se pudo apuntar en el registro:', recordError);
      return null;
    }
  }, []);

  /**
   * Deshace una entrada reversible: escribe el valor de antes y la marca como deshecha. LANZA si la escritura de
   * vuelta falla, para que quien llama lo diga; la marca, en cambio, es secundaria.
   */
  const undo = useCallback(async (entry: AdminLogEntry): Promise<void> => {
    if (!entry.undo || entry.undone) return;
    if (entry.undo.action === 'tier') {
      await setUserTier(entry.undo.profileDocId, normalizeTier(entry.undo.tier));
    } else {
      await setUserSocialEnabled(entry.undo.profileDocId, entry.undo.enabled);
    }
    setEntries((current) => (current || []).map((item) => (item.id === entry.id ? { ...item, undone: true } : item)));
    try {
      await markAdminLogUndone(entry.id);
    } catch (markError) {
      console.warn('[admin] deshecho, pero no se pudo marcar en el registro:', markError);
    }
  }, []);

  return { entries, error, load, record, undo };
}

export type AdminLogState = ReturnType<typeof useAdminLog>;
