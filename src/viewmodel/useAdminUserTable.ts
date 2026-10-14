// La tabla de usuarios del panel: filtros y orden EN LA URL, y la selección para las acciones en lote.
//
// Mismo patrón que `useToolbarFilters` de los listados: se lee de `useSearchParams` y se escribe con `replace`,
// para que cada pulsación de un filtro no deje una entrada en el historial (el «atrás» tiene que sacar de la tabla,
// no deshacer filtros uno a uno).
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  filterUsers,
  parseUserFilters,
  serializeUserFilters,
  sortUsers,
  type AdminUserFilters,
  type AdminUserSort,
} from '../core/admin/userFilters';
import type { AdminUserRow } from '../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../model/types/firestore';
import type { AdminSharesState } from './useAdminPanelData';

export function useAdminUserTable(
  rows: readonly AdminUserRow[],
  shares: AdminSharesState,
  knownSignals: readonly AdminAnomaly[],
) {
  const [params, setParams] = useSearchParams();
  const { filters, sort } = useMemo(() => parseUserFilters(params, knownSignals), [params, knownSignals]);

  const setFilters = useCallback(
    (next: AdminUserFilters) => setParams(serializeUserFilters(next, sort), { replace: true }),
    [setParams, sort],
  );
  const setSort = useCallback(
    (next: AdminUserSort) => setParams(serializeUserFilters(filters, next), { replace: true }),
    [setParams, filters],
  );

  const context = useMemo(() => {
    const shareCounts: Record<string, number> = {};
    for (const [uid, list] of Object.entries(shares.byUser)) shareCounts[uid] = list.length;
    return {
      now: Date.now(),
      banned: shares.banned,
      quotaOverrides: new Set(
        Object.entries(shares.overrides)
          .filter(([, value]) => Boolean(value && (value.maxActive || value.ttlDays)))
          .map(([uid]) => uid),
      ),
      shareCounts,
    };
  }, [shares]);

  const visible = useMemo(() => sortUsers(filterUsers(rows, filters, context), sort, context), [rows, filters, sort, context]);

  // LA SELECCIÓN, por id de documento. Se poda sola contra lo visible: una fila que el filtro esconde no puede
  // recibir una acción en lote que no se ve.
  const [selectedRaw, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selected = useMemo(() => {
    const ids = new Set(visible.map((row) => row.id));
    return new Set([...selectedRaw].filter((id) => ids.has(id)));
  }, [selectedRaw, visible]);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const allIn = visible.length > 0 && visible.every((row) => current.has(row.id));
      return allIn ? new Set() : new Set(visible.map((row) => row.id));
    });
  }, [visible]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  return { filters, sort, setFilters, setSort, visible, context, selected, toggle, toggleAll, clearSelection, search: params.toString() };
}
