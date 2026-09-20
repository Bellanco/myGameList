/**
 * El flujo de votación: lo elegido en cada categoría, el borrador que sobrevive a una recarga y el envío.
 *
 * QUÉ CAMBIA RESPECTO A LA APLICACIÓN DE ORIGEN: allí el paso actual era estado de React y se empujaba al
 * historial sin tocar la URL. Aquí el paso vive en la dirección (`premiosRoutes`), así que este hook ya no lo
 * lleva: solo guarda QUÉ se ha votado. Es lo que permite enlazar una categoría concreta, recargar sin volver al
 * principio y abrir dos pestañas sin que se peleen.
 *
 * EL BORRADOR ES LOCAL Y A PROPÓSITO. Votar entero son veintiséis pasos; perderlos por recargar o por salir a
 * mirar algo en las listas sería el final de muchas papeletas. Se guarda en este navegador —nunca en Firestore,
 * que solo recibe la papeleta cuando se envía— y se borra al enviarla.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PREMIOS_DRAFT_KEY } from '../../core/constants/storageKeys';
import { selectionsToVotes } from '../../core/premios/localize';
import { submitBallot, type BallotAuthor } from '../../model/repository/premios/premiosBallotRepository';
import type { PremiosBallot, PremiosCategory, PremiosOption } from '../../model/types/premios';

export type PremiosVotes = Record<string, PremiosOption>;

/** Lee el borrador de este navegador. Nunca lanza: un almacenamiento bloqueado no puede tumbar la pantalla. */
function readDraft(): PremiosVotes {
  try {
    const raw = localStorage.getItem(PREMIOS_DRAFT_KEY);
    const parsed = raw ? (JSON.parse(raw) as PremiosVotes) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(votes: PremiosVotes): void {
  try {
    localStorage.setItem(PREMIOS_DRAFT_KEY, JSON.stringify(votes));
  } catch {
    // Sin almacenamiento se vota igual; solo se pierde el borrador al recargar.
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(PREMIOS_DRAFT_KEY);
  } catch {
    // Nada que hacer.
  }
}

export interface PremiosVoting {
  votes: PremiosVotes;
  /** Cuántas categorías llevan voto. */
  votedCount: number;
  /** Categorías sin votar, en el orden en que se ven. */
  pending: PremiosCategory[];
  choose: (categoryId: string, option: PremiosOption) => void;
  /** Vuelca la papeleta ya enviada al borrador, para poder corregirla. */
  restoreFrom: (ballot: PremiosBallot, categories: PremiosCategory[]) => void;
  submit: (params: { author: BallotAuthor; displayName: string; season: number; existing: PremiosBallot | null }) => Promise<PremiosBallot>;
  submitting: boolean;
}

export function usePremiosVoting(categories: PremiosCategory[]): PremiosVoting {
  const [votes, setVotes] = useState<PremiosVotes>(() => readDraft());
  const [submitting, setSubmitting] = useState(false);

  // El borrador se escribe en cada cambio, no al salir: un cierre de pestaña no avisa, y perder veintiséis
  // elecciones por no haber guardado la última no tiene arreglo.
  useEffect(() => {
    writeDraft(votes);
  }, [votes]);

  const choose = useCallback((categoryId: string, option: PremiosOption) => {
    setVotes((prev) => ({ ...prev, [categoryId]: option }));
  }, []);

  const restoreFrom = useCallback((ballot: PremiosBallot, cats: PremiosCategory[]) => {
    setVotes(selectionsToVotes(ballot.selections, cats));
  }, []);

  const submit = useCallback<PremiosVoting['submit']>(
    async ({ author, displayName, season, existing }) => {
      setSubmitting(true);
      try {
        const { ballot } = await submitBallot({
          author,
          userVotes: votes,
          displayName,
          season,
          existingBallot: existing,
        });
        // Solo al confirmar el servidor: si la escritura falla, el borrador sigue ahí para reintentar.
        clearDraft();
        return ballot;
      } finally {
        setSubmitting(false);
      }
    },
    [votes],
  );

  const pending = useMemo(() => categories.filter((category) => !votes[category.id]), [categories, votes]);

  return useMemo(
    () => ({
      votes,
      votedCount: categories.filter((category) => Boolean(votes[category.id])).length,
      pending,
      choose,
      restoreFrom,
      submit,
      submitting,
    }),
    [categories, choose, pending, restoreFrom, submit, submitting, votes],
  );
}
