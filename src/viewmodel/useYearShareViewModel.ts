// Compartir el RESUMEN DEL AÑO (docs/plan-resumen-del-ano.md, Fase 5): el enlace público, que se crea una vez y se
// actualiza a mano sobre la misma dirección. Crearlo avisa también a tus amistades (la tarjeta del feed). No se
// retira a mano: caduca solo al cerrar la temporada.
//
// Como `useShareViewModel`, NO decide nada que importe: la ventana, la caducidad y la espera entre actualizaciones
// las aplica la Function. Lo que aquí se calcula (si el resumen ha cambiado, desde cuándo se puede actualizar) es
// solo para pintar el botón como toca; si se equivoca, el servidor responde con la fecha buena y se corrige.
import { useCallback, useMemo, useRef, useState } from 'react';
import { normalizeTier } from '../core/constants/tiers';
import { PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS, nextYearShareUpdateAt } from '../core/social/yearShareWindow';
import type { YearSummary } from '../core/stats/yearSummary';
import { isSharedYearSummary, lookupSharedReview } from '../model/repository/publicShareRepository';
import { isShareUnavailable, listMyShares, publishYearShare, type ShareError } from '../model/repository/shareRepository';
import type { YearSummarySignal } from './social/useYearSummarySignal';

export interface YearShareLink {
  token: string;
  url: string;
  expiresAt: number;
}

export interface YearShareViewModel {
  /** Mientras se pregunta si ya hay enlace: entonces no se ofrece ningún botón, para no enseñar uno que no toca. */
  loading: boolean;
  link: YearShareLink | null;
  /** El resumen ha cambiado desde que se compartió: hay algo que actualizar. */
  changed: boolean;
  /** Desde cuándo se puede volver a actualizar; `null` si ya se puede o no se sabe. */
  nextUpdateAt: number | null;
  busy: boolean;
  /** El servicio de compartir no atiende ahora (cupo, caída, red). */
  serviceDown: boolean;
  error: string;
  load: () => Promise<void>;
  /** Crea el enlace o lo actualiza, y avisa a tus amistades si aún no lo estaban. */
  publish: () => Promise<boolean>;
}

const linkUrl = (token: string) => `${window.location.origin}/r/${token}`;
const sameSummary = (a: YearSummary | null, b: YearSummary) => a !== null && JSON.stringify(a) === JSON.stringify(b);

export function useYearShareViewModel({
  year,
  summary,
  signal,
}: {
  year: number;
  /** La proyección pública de tu resumen de AHORA (`core/stats/publicYearSummary`). */
  summary: YearSummary;
  signal?: YearSummarySignal;
}): YearShareViewModel {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<YearShareLink | null>(null);
  const [published, setPublished] = useState<YearSummary | null>(null);
  const [nextUpdateAt, setNextUpdateAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [serviceDown, setServiceDown] = useState(false);
  const [error, setError] = useState('');
  const loaded = useRef(false);

  const fail = useCallback((problem: unknown) => {
    if (isShareUnavailable(problem)) setServiceDown(true);
    setError(problem instanceof Error ? problem.message : String(problem));
  }, []);

  /**
   * ¿Ya hay enlace este año? Sale de «mis enlaces» (con caché de cinco minutos: un `list` de KV) y, si lo hay, se lee
   * el artículo publicado para saber si tu resumen ha cambiado desde entonces. Solo con tu resumen abierto y en
   * temporada, que es cuando se monta el botón.
   */
  const load = useCallback(async () => {
    if (loaded.current) return;
    loaded.current = true;
    setLoading(true);
    try {
      const mine = await listMyShares();
      const row = (mine.yearShares || []).find((entry) => entry.year === year);
      if (!row) return;
      setLink({ token: row.token, url: linkUrl(row.token), expiresAt: row.expiresAt });
      const lookup = await lookupSharedReview(row.token);
      if (lookup.status === 'ready' && isSharedYearSummary(lookup.article)) {
        setPublished(lookup.article.summary);
        const waitDays = PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS[normalizeTier(mine.tier)];
        const next = nextYearShareUpdateAt(lookup.article.updatedAt, waitDays);
        setNextUpdateAt(next > Date.now() ? next : null);
      }
    } catch (problem) {
      loaded.current = false;
      fail(problem);
    } finally {
      setLoading(false);
    }
  }, [fail, year]);

  const publish = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const result = await publishYearShare(year, summary);
      setServiceDown(false);
      setLink({ token: result.token, url: result.url || linkUrl(result.token), expiresAt: result.expiresAt });
      setPublished(summary);
      setNextUpdateAt(result.nextUpdateAt > Date.now() ? result.nextUpdateAt : null);
      // Compartir con enlace es también compartir con tus amistades (la tarjeta, una vez por año).
      void signal?.announce(year);
      return true;
    } catch (problem) {
      const details = (problem as Partial<ShareError>).details || {};
      if ((problem as Partial<ShareError>).status === 429 && Number(details.nextUpdateAt) > 0) {
        setNextUpdateAt(Number(details.nextUpdateAt));
      }
      fail(problem);
      return false;
    } finally {
      setBusy(false);
    }
  }, [fail, signal, summary, year]);

  const changed = useMemo(() => Boolean(link) && published !== null && !sameSummary(published, summary), [link, published, summary]);

  return { loading, link, changed, nextUpdateAt, busy, serviceDown, error, load, publish };
}
