// Los medidores de Capacidad (docs/plan-admin-rediseno.md, F5): se piden al entrar al panel —la portada enseña los
// más importantes— y se releen a mano desde su pantalla.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ADMIN_SHELL_UI } from '../core/constants/adminLabels';
import { loadAdminHealth, type AdminHealth, type HealthMeter } from '../model/repository/adminHealthRepository';

const H = ADMIN_SHELL_UI.capacity;

/** Los que salen también en la portada (además de las carátulas, que tienen su contador propio). */
const HOME_METERS = new Set(['firestore-reads', 'kv-writes']);

export interface HealthMeterView extends HealthMeter {
  label: string;
  /** De dónde sale la cifra, en palabras. */
  sourceLabel: string;
  home: boolean;
}

export function useAdminHealth(enabled: boolean) {
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(false);
  /** El endpoint no respondió (en desarrollo no existe, o no se ha desplegado). */
  const [unreachable, setUnreachable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await loadAdminHealth();
    setLoading(false);
    setUnreachable(next === null);
    if (next) setHealth(next);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const meters = useMemo<HealthMeterView[]>(
    () =>
      (health?.meters || [])
        .map((meter) => ({
          ...meter,
          label: H.meters[meter.id as keyof typeof H.meters] || meter.id,
          sourceLabel: H.sources[meter.source],
          home: HOME_METERS.has(meter.id),
        })),
    [health],
  );

  return { meters, fetchedAt: health?.fetchedAt || 0, loading, unreachable, refresh };
}

export type AdminHealthState = ReturnType<typeof useAdminHealth>;
