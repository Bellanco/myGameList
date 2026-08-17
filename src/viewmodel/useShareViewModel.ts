// Estado de los enlaces públicos de reseñas: cuota, lista, publicar y retirar.
//
// NO decide nada: la cuota, la caducidad y el veto los resuelve la Pages Function y aquí solo se guardan para
// pintarlos. Si este hook empezara a calcular cuántos enlaces caben, habría dos verdades y la del navegador es
// manipulable.
import { useCallback, useMemo, useState } from 'react';
import { getCurrentSocialAuthUser } from '../model/repository/firebaseGateway';
import { getSocialSyncConfig } from '../model/repository/gistConfigRepository';
import { listMyShares, publishShare, removeShare, type PublishedShare, type ShareError } from '../model/repository/shareRepository';
import type { ShareBan, SharedReviewIndexEntry } from '../model/types/share';
import type { ShareQuota } from '../core/constants/tiers';

export interface ShareViewModel {
  shares: SharedReviewIndexEntry[];
  quota: ShareQuota | null;
  ban: ShareBan | null;
  /**
   * ¿Hay sesión de Google en este navegador? `null` mientras no se sabe.
   *
   * Sin sesión no hay nada que pedir ni que ofrecer: compartir exige identidad. Se comprueba ANTES de llamar a la
   * API para no gastar una petición que solo puede acabar en 401, y para no enseñar un botón que fallaría.
   */
  available: boolean | null;
  /**
   * ¿Este navegador ha tocado alguna vez el espacio social? Se mira por la config LOCAL del gist social, que vive
   * en el dispositivo y por tanto sobrevive a que la sesión de Google se caiga: es lo que distingue "se te ha
   * caído la sesión" (a quien conviene avisar de que falta entrar) de "nunca has abierto el espacio social" (a
   * quien el aviso solo le hablaría de algo que no ha pedido).
   *
   * En un dispositivo NUEVO de alguien que sí usa lo social no hay config local hasta que entra con Google, así
   * que allí tampoco se avisa. Es el lado correcto por el que fallar: sin sesión no hay forma de saberlo sin red,
   * y en cuanto entra aparece el botón de verdad, no el aviso.
   */
  hasSocialSpace: boolean;
  /** Nick con el que el SERVIDOR firmará la reseña. Se enseña antes de publicar. */
  nick: string;
  /**
   * Ese nick es, literalmente, el nombre de la cuenta de Google.
   *
   * Pasa cuando su dueño nunca eligió nick: `profiles.displayName` cae al nombre de la cuenta (ver
   * `resolvePublicName` en firebaseRepository). Dentro de la app eso ya lo ven sus amistades, pero publicarlo en
   * una página abierta a cualquiera es otra cosa, así que se avisa ANTES y no después.
   */
  nickIsAccountName: boolean;
  loading: boolean;
  busyToken: string | null;
  error: string;
  /** Detalle del último error (cuota, caducidad del más antiguo…), para poder decir algo útil en pantalla. */
  errorDetails: Record<string, unknown>;
  refresh: () => Promise<void>;
  share: (draft: Parameters<typeof publishShare>[0]) => Promise<PublishedShare | null>;
  revoke: (token: string) => Promise<boolean>;
  /** Enlace ya publicado de una reseña concreta, si lo hay (para el distintivo del detalle). */
  shareOf: (gameId: number) => SharedReviewIndexEntry | null;
  clearError: () => void;
}

export function useShareViewModel(): ShareViewModel {
  const [shares, setShares] = useState<SharedReviewIndexEntry[]>([]);
  const [quota, setQuota] = useState<ShareQuota | null>(null);
  const [ban, setBan] = useState<ShareBan | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [hasSocialSpace, setHasSocialSpace] = useState(false);
  const [nick, setNick] = useState('');
  const [nickIsAccountName, setNickIsAccountName] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState<Record<string, unknown>>({});

  const fail = useCallback((problem: unknown) => {
    const shareProblem = problem as ShareError;
    setError(shareProblem?.message || 'No se ha podido completar la operación');
    setErrorDetails(shareProblem?.details || {});
  }, []);

  const clearError = useCallback(() => {
    setError('');
    setErrorDetails({});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Lectura local y sincrónica: el id del gist social no está cifrado, así que no hay que esperar a la
      // hidratación del token (`ensureSyncConfigLoaded`), que es lo único asíncrono de esa config.
      setHasSocialSpace(Boolean(getSocialSyncConfig()?.gistId?.trim()));

      const authUser = await getCurrentSocialAuthUser().catch(() => null);
      if (!authUser) {
        setAvailable(false);
        clearError();
        return;
      }
      setAvailable(true);

      const data = await listMyShares();
      setShares(data.shares || []);
      setQuota(data.quota || null);
      setBan(data.ban || null);
      setNick(data.nick || '');
      // La comparación se hace AQUÍ y no en el servidor: el nombre de la cuenta de Google es un dato de la
      // sesión del navegador, y la Function no tiene por qué conocerlo ni guardarlo.
      const accountName = String(authUser.displayName || '').trim();
      setNickIsAccountName(Boolean(accountName) && accountName === String(data.nick || '').trim());
      clearError();
    } catch (problem) {
      fail(problem);
    } finally {
      setLoading(false);
    }
  }, [clearError, fail]);

  const share = useCallback<ShareViewModel['share']>(
    async (draft) => {
      clearError();
      setLoading(true);
      try {
        const published = await publishShare(draft);
        // Se recarga en vez de insertar a mano: la respuesta trae el recuento, pero la lista completa (y la
        // caducidad exacta de cada fila) la tiene el servidor, que es quien manda.
        await refresh();
        return published;
      } catch (problem) {
        fail(problem);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [clearError, fail, refresh],
  );

  const revoke = useCallback(
    async (token: string) => {
      clearError();
      setBusyToken(token);
      try {
        await removeShare(token);
        setShares((current) => current.filter((entry) => entry.token !== token));
        return true;
      } catch (problem) {
        fail(problem);
        return false;
      } finally {
        setBusyToken(null);
      }
    },
    [clearError, fail],
  );

  const byGame = useMemo(() => {
    const index = new Map<number, SharedReviewIndexEntry>();
    for (const entry of shares) {
      index.set(entry.gameId, entry);
    }
    return index;
  }, [shares]);

  const shareOf = useCallback((gameId: number) => byGame.get(gameId) || null, [byGame]);

  return {
    shares, quota, ban, available, hasSocialSpace, nick, nickIsAccountName,
    loading, busyToken, error, errorDetails,
    refresh, share, revoke, shareOf, clearError,
  };
}
