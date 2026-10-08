import { useCallback, useState, useSyncExternalStore } from 'react';
import { isGuideShowing, joinFromPremios, type PremiosInviteKind } from '../../core/onboarding/joinFromPremios';
import { parseTourState } from '../../core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../model/repository/onboardingStore';
import { readJoinInviteAnswer, saveJoinInviteAnswer } from '../../model/repository/premios/premiosJoinInviteStore';

/**
 * LA INVITACIÓN AL RESTO DE LA APLICACIÓN, al terminar de votar y al mirar el histórico (decisiones del 07 y el
 * 08-10-2026).
 *
 * A quien no tiene lo social. A qué se le invita (`kind`) lo decide quien llama, que sabe de su biblioteca y de su
 * perfil: `null` = a nada. Aquí se decide lo demás:
 *
 *  - si ya se contestó en esta edición —una vez por edición, se acepte o no, y la respuesta vale para los dos
 *    sitios: quien dice «Ahora no» al votar no se la vuelve a encontrar en el histórico—;
 *  - si la guía ya está pintando algo, que entonces manda ella;
 *  - y qué pasa al aceptar: se pone en marcha la guía (`joinFromPremios`), y quien llama le lleva a donde empieza.
 */
export function usePremiosJoinInvite(seasonId: string, kind: PremiosInviteKind | null): {
  show: boolean;
  accept: () => void;
  dismiss: () => void;
} {
  const [answered, setAnswered] = useState(readJoinInviteAnswer);
  const tourRaw = useSyncExternalStore(onboardingStore.subscribe, onboardingStore.get, onboardingStore.get);

  const answer = useCallback(() => {
    saveJoinInviteAnswer(seasonId);
    setAnswered(seasonId);
  }, [seasonId]);

  const accept = useCallback(() => {
    const next = joinFromPremios(parseTourState(onboardingStore.get()), kind ?? 'list');
    if (next) saveTourState(next);
    answer();
  }, [answer, kind]);

  const show = kind !== null
    && Boolean(seasonId)
    && answered !== seasonId
    && !isGuideShowing(parseTourState(tourRaw || null));
  return { show, accept, dismiss: answer };
}
