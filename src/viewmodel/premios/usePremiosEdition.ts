/**
 * El estado de la edición: qué hay, si se puede votar y qué ha votado esta cuenta.
 *
 * UN SOLO HOOK PARA LAS TRES COSAS porque las tres se necesitan a la vez para decidir qué pantalla se pinta, y
 * separarlas obligaría a la sección a coordinar tres cargas y tres errores. Por dentro son tres lecturas: el
 * calendario (sin sesión), las categorías (con sesión) y la papeleta propia (solo si hay sesión).
 *
 * EL CALENDARIO SE LEE SIEMPRE, incluso sin sesión: es lo que decide si la sección se ofrece y lo que permite
 * enseñar «la votación abre el día tal» a quien todavía no ha entrado.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSeasonStage, isVotingOpenNow, type SeasonStage } from '../../core/premios/votingSchedule';
import {
  canEditBallot,
  getOpportunities,
  getRemainingOpportunities,
  type PremiosVoterStanding,
} from '../../core/premios/ballotEdits';
import { loadAndSortCategories } from '../../model/repository/premios/premiosCategoriesRepository';
import { fetchUserBallot } from '../../model/repository/premios/premiosBallotRepository';
import { fetchVotingConfig } from '../../model/repository/premios/premiosSeasonRepository';
import type { PremiosBallot, PremiosCategory, PremiosVotingConfig } from '../../model/types/premios';

export interface PremiosEdition {
  /** ¿Sigue cargando la primera lectura? */
  loading: boolean;
  /** La lectura falló del todo (ni calendario ni categorías). */
  failed: boolean;
  config: PremiosVotingConfig | null;
  categories: PremiosCategory[];
  /** La papeleta de esta cuenta, si ya votó. */
  ballot: PremiosBallot | null;
  stage: SeasonStage;
  votingOpen: boolean;
  /** ¿Puede corregir su voto ahora mismo? */
  canEdit: boolean;
  /** Oportunidades que le quedan: veces que todavía puede enviar la papeleta. */
  remainingOpportunities: number;
  /** Oportunidades totales de esta cuenta, el envío incluido. Es lo que da su rango. */
  opportunities: number;
  reload: () => Promise<void>;
}

/**
 * @param standing Lo que se sabe de quien vota (`usePremiosVoter`): decide su cupo de oportunidades. Sin él —sin
 *   sesión, o mientras se lee su perfil— se asume el mínimo, que es lo que degrada sin prometer de más.
 */
export function usePremiosEdition(uid: string, standing: PremiosVoterStanding | null): PremiosEdition {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [config, setConfig] = useState<PremiosVotingConfig | null>(null);
  const [categories, setCategories] = useState<PremiosCategory[]>([]);
  const [ballot, setBallot] = useState<PremiosBallot | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // Las categorías y la papeleta solo se piden CON SESIÓN: sin ella las reglas las deniegan, y pedirlas sería
      // un `permission-denied` garantizado en la consola de cualquier visitante.
      const [nextConfig, nextCategories, nextBallot] = await Promise.all([
        fetchVotingConfig(),
        uid ? loadAndSortCategories() : Promise.resolve<PremiosCategory[]>([]),
        uid ? fetchUserBallot(uid) : Promise.resolve<PremiosBallot | null>(null),
      ]);
      if (!mountedRef.current) return;
      setConfig(nextConfig);
      setCategories(nextCategories);
      setBallot(nextBallot);
      // Sin calendario Y sin categorías no hay nada que pintar; con una de las dos, la pantalla se apaña.
      setFailed(!nextConfig && nextCategories.length === 0 && Boolean(uid));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(() => {
    const stage = getSeasonStage(config);
    const votingOpen = isVotingOpenNow(config);
    return {
      loading,
      failed,
      config,
      categories,
      ballot,
      stage,
      votingOpen,
      canEdit: canEditBallot(ballot, config, standing),
      remainingOpportunities: getRemainingOpportunities(ballot, standing),
      opportunities: getOpportunities(standing),
      reload,
    };
  }, [ballot, categories, config, failed, loading, reload, standing]);
}
