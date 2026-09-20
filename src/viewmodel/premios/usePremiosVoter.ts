/**
 * QUIÉN VOTA, a efectos de la porra: su pseudónimo público y el cupo de oportunidades que le toca.
 *
 * Las dos cosas salen del MISMO documento —el perfil propio— y de una sola lectura, además cacheada 60 s por
 * `getOwnProfileRef`: llegar aquí desde el resto de la aplicación no cuesta ninguna consulta nueva.
 *
 *   · el `profileId` es lo único que permite que su fila de la clasificación enlace a su perfil;
 *   · `hasSocialAccount` y `tier` deciden cuántas veces podrá enviar la papeleta (`core/premios/ballotEdits`).
 *
 * SIN PERFIL NO SE BLOQUEA NADA: quien llega por primera vez no lo tiene todavía —se le crea al enviar, como
 * cuenta ligera— y vota igual, con una oportunidad. Por eso un fallo de lectura se trata como «no hay perfil» y
 * no como error de pantalla.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_PROFILE_TIER } from '../../core/constants/tiers';
import type { PremiosVoterStanding } from '../../core/premios/ballotEdits';
import { getOwnProfileRef } from '../../model/repository/firebaseSocialRepository';

export interface PremiosVoter extends PremiosVoterStanding {
  /** Pseudónimo público de esta cuenta. Vacío mientras no tenga perfil. */
  profileId: string;
  /** ¿Sigue pendiente la lectura del perfil? Con sesión, hasta saberlo no se puede decir cuántas le quedan. */
  loading: boolean;
}

const SIN_PERFIL: PremiosVoter = {
  profileId: '',
  hasSocialAccount: false,
  tier: DEFAULT_PROFILE_TIER,
  loading: false,
};

export function usePremiosVoter(uid: string): PremiosVoter {
  const [voter, setVoter] = useState<PremiosVoter>(SIN_PERFIL);

  useEffect(() => {
    if (!uid) {
      setVoter(SIN_PERFIL);
      return;
    }

    let vivo = true;
    setVoter({ ...SIN_PERFIL, loading: true });
    void getOwnProfileRef(uid)
      .then((ref) => {
        if (!vivo) return;
        setVoter({
          profileId: ref?.profileId || '',
          // El canal, y no la mera existencia del documento: la cuenta ligera del voto tiene perfil y no tiene
          // canal, y es justo la que se queda con una sola oportunidad.
          hasSocialAccount: Boolean(ref?.socialEnabled),
          tier: ref?.tier || DEFAULT_PROFILE_TIER,
          loading: false,
        });
      })
      .catch(() => {
        // Sin perfil legible se vota igual, con el cupo mínimo: el pseudónimo es opcional en la papeleta.
        if (vivo) setVoter(SIN_PERFIL);
      });

    return () => {
      vivo = false;
    };
  }, [uid]);

  return voter;
}
