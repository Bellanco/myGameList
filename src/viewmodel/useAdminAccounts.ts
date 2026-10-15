// LAS CUENTAS DE FIREBASE AUTH en el panel (docs/plan-cuentas-inactivas.md): se leen al entrar —la portada avisa
// de las caducadas— y se releen a mano o después de borrar. La caducidad la decide `judgeRetention`, la misma
// función con la que el servidor vuelve a comprobarla antes de borrar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { judgeRetention, retentionFactsOf, type RetentionVerdict } from '../core/admin/accountRetention';
import { ADMIN_SHELL_UI } from '../core/constants/adminLabels';
import {
  loadAdminAccounts,
  purgeAdminAccounts,
  PURGE_CHUNK,
  type AdminAccount,
  type AdminAccountsLoad,
  type AdminPurgeResult,
} from '../model/repository/adminAccountsRepository';
import type { AdminLogDraft } from './useAdminLog';

export interface AdminAccountView extends AdminAccount {
  verdict: RetentionVerdict;
}

export interface AdminPurgeSummary {
  deleted: number;
  skipped: number;
  failed: number;
}

/** El orden de la lista: lo que hay que hacer primero arriba, y dentro de cada grupo lo más urgente. */
const STATE_ORDER: Record<RetentionVerdict['state'], number> = { expired: 0, expiring: 1, active: 2, protected: 3 };

export function sortAccounts(accounts: AdminAccountView[]): AdminAccountView[] {
  return [...accounts].sort(
    (a, b) =>
      STATE_ORDER[a.verdict.state] - STATE_ORDER[b.verdict.state]
      || (a.verdict.expiresAt || Infinity) - (b.verdict.expiresAt || Infinity)
      || b.verdict.lastUsedAt - a.verdict.lastUsedAt,
  );
}

export function summarizePurge(results: readonly AdminPurgeResult[]): AdminPurgeSummary {
  return {
    deleted: results.filter((result) => result.outcome === 'deleted').length,
    skipped: results.filter((result) => result.outcome === 'skipped').length,
    failed: results.filter((result) => result.outcome === 'failed' || result.outcome === 'pending').length,
  };
}

export function useAdminAccounts(enabled: boolean, record: (draft: AdminLogDraft) => Promise<unknown>) {
  const [load, setLoad] = useState<AdminAccountsLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await loadAdminAccounts();
    setLoading(false);
    // Una relectura fallida no borra la lista que ya había: se sigue viendo lo último que se supo.
    setLoad((previous) => (next.status === 'unreachable' && previous?.status === 'ok' ? previous : next));
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const census = load?.status === 'ok' ? load.census : null;

  const accounts = useMemo<AdminAccountView[]>(
    () =>
      census
        // El «ahora» es el de la lectura: así la lista no cambia de estado sola mientras se mira.
        ? sortAccounts(census.accounts.map((account) => ({ ...account, verdict: judgeRetention(retentionFactsOf(account), census.fetchedAt) })))
        : [],
    [census],
  );
  const byUid = useMemo(() => new Map(accounts.map((account) => [account.uid, account])), [accounts]);
  const expired = useMemo(() => accounts.filter((account) => account.verdict.state === 'expired'), [accounts]);
  const expiring = useMemo(() => accounts.filter((account) => account.verdict.state === 'expiring'), [accounts]);

  /** Borra las cuentas caducadas que se le pasen. El servidor salta las que hayan dejado de estarlo. */
  const purge = useCallback(
    async (targets: readonly AdminAccountView[]): Promise<AdminPurgeSummary | null> => {
      if (targets.length === 0) return { deleted: 0, skipped: 0, failed: 0 };
      setPurging(true);
      try {
        // Por tandas: el servidor no borra más de `PURGE_CHUNK` por petición. Una tanda que falla para el resto
        // (salta al `catch`); una con «servicio no disponible» también, porque las siguientes fallarían igual.
        const results: AdminPurgeResult[] = [];
        for (let index = 0; index < targets.length; index += PURGE_CHUNK) {
          const batch = await purgeAdminAccounts(targets.slice(index, index + PURGE_CHUNK).map((account) => account.uid));
          results.push(...batch);
          if (batch.some((result) => result.outcome === 'pending')) {
            results.push(...targets.slice(index + PURGE_CHUNK).map((account): AdminPurgeResult => ({ uid: account.uid, outcome: 'pending' })));
            break;
          }
        }
        // UNA entrada por tanda, sin nombre ni uid: el registro no puede guardar a quien se acaba de borrar (el
        // borrado ya se ha llevado lo que el registro apuntaba de esas personas).
        const deleted = results.filter((result) => result.outcome === 'deleted').length;
        if (deleted > 0) {
          void record({ kind: 'delete', text: ADMIN_SHELL_UI.log.texts.accountsDeleted(deleted), targetUid: '', targetName: '', undo: null });
        }
        return summarizePurge(results);
      } catch (error) {
        console.warn('[admin] no se pudieron borrar las cuentas:', error instanceof Error ? error.message : error);
        return null;
      } finally {
        setPurging(false);
        void refresh();
      }
    },
    [record, refresh],
  );

  return {
    status: load?.status ?? null,
    /** El motivo cuando Google rechazó la lectura (`status: 'failed'`). */
    failure: load?.status === 'failed' ? load.message : '',
    census,
    accounts,
    byUid,
    expired,
    expiring,
    loading,
    purging,
    refresh,
    purge,
  };
}

export type AdminAccountsState = ReturnType<typeof useAdminAccounts>;
