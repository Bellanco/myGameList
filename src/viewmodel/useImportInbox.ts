import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_INBOX, addGamesToInbox, purgeStaleImports, removeFromInbox } from '../core/import/staging';
import { loadImportInbox, saveImportInbox } from '../model/repository/import/inboxRepository';
import type { ImportInbox, ImportedGame, RawExternalGame, StagingSummary } from '../model/types/import';

export interface UseImportInbox {
  imported: ImportedGame[];
  count: number;
  loading: boolean;
  /** Inserta en lote juegos crudos (dedupe/fusión) y devuelve el resumen para el aviso. */
  addGames: (games: RawExternalGame[], existingListNames: Set<string>) => StagingSummary;
  /** Saca una entrada de la bandeja (tras graduarla o al descartarla). */
  removeItem: (id: number) => void;
  /** Vacía la bandeja. */
  clear: () => void;
}

/**
 * Estado de la Bandeja de importados: gestiona SOLO su ciclo de vida (cargar/persistir/purgar) y sus
 * mutaciones. Es local (IndexedDB, no sincroniza) y deliberadamente independiente del view-model de
 * listas: la graduación (abrir el formulario y crear el GameItem) la orquesta la UI usando `removeItem`
 * + `importedToPartialGame`, para no acoplar este hook a la creación de juegos ni al gist.
 */
export function useImportInbox(): UseImportInbox {
  const [inbox, setInbox] = useState<ImportInbox>(EMPTY_INBOX);
  const [loading, setLoading] = useState(true);

  // La bandeja se lee/escribe fuera del render; un ref garantiza que cada operación parte del ÚLTIMO
  // valor aunque se encadenen varias llamadas síncronas antes del re-render (patrón de metaRef del VM).
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;

  const commit = useCallback((next: ImportInbox) => {
    inboxRef.current = next;
    setInbox(next);
    void saveImportInbox(next); // best-effort: la persistencia local no debe bloquear la UI.
  }, []);

  // Carga inicial + purga de caducados (TTL 30 días). Best-effort: si falla el IO, la bandeja queda vacía.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadImportInbox();
      if (cancelled) return;
      const { inbox: purged, removed } = purgeStaleImports(loaded, Date.now());
      inboxRef.current = purged;
      setInbox(purged);
      setLoading(false);
      if (removed > 0) void saveImportInbox(purged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addGames = useCallback(
    (games: RawExternalGame[], existingListNames: Set<string>): StagingSummary => {
      const { inbox: next, summary } = addGamesToInbox(inboxRef.current, games, existingListNames, Date.now());
      commit(next);
      return summary;
    },
    [commit],
  );

  const removeItem = useCallback(
    (id: number) => {
      const next = removeFromInbox(inboxRef.current, id, Date.now());
      if (next !== inboxRef.current) commit(next);
    },
    [commit],
  );

  const clear = useCallback(() => {
    if (inboxRef.current.imported.length === 0) return;
    commit({ imported: [], updatedAt: Date.now() });
  }, [commit]);

  return {
    imported: inbox.imported,
    count: inbox.imported.length,
    loading,
    addGames,
    removeItem,
    clear,
  };
}
