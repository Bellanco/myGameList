import { useCallback, useState } from 'react';
import { joinFromPremios } from '../../core/onboarding/joinFromPremios';
import { parseTourState } from '../../core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../model/repository/onboardingStore';
import { readJoinInviteAnswer, saveJoinInviteAnswer } from '../../model/repository/premios/premiosJoinInviteStore';

/**
 * LA INVITACIÓN AL RESTO DE LA APLICACIÓN, al terminar de votar (decisión del 07-10-2026).
 *
 * Solo a quien no tiene NADA más: ni perfil social ni un juego en su biblioteca. Eso lo decide quien llama
 * (`eligible`); aquí se decide si ya se contestó en esta edición —una vez por edición, se acepte o no— y qué
 * pasa al aceptar: se pone en marcha la guía de primeros pasos (`joinFromPremios`), que es la que acaba llevando
 * a lo social, y quien llama le lleva a sus listas.
 */
export function usePremiosJoinInvite(seasonId: string, eligible: boolean): {
  show: boolean;
  accept: () => void;
  dismiss: () => void;
} {
  const [answered, setAnswered] = useState(readJoinInviteAnswer);

  const answer = useCallback(() => {
    saveJoinInviteAnswer(seasonId);
    setAnswered(seasonId);
  }, [seasonId]);

  const accept = useCallback(() => {
    const next = joinFromPremios(parseTourState(onboardingStore.get()));
    if (next) saveTourState(next);
    answer();
  }, [answer]);

  return { show: eligible && Boolean(seasonId) && answered !== seasonId, accept, dismiss: answer };
}
