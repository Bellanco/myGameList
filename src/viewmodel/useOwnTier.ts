import { useEffect, useState } from 'react';
import { DEFAULT_PROFILE_TIER, type ProfileTier } from '../core/constants/tiers';
import { resolveOwnProfile, subscribeSocialAuth } from '../model/repository/firebaseGateway';

/**
 * EL RANGO PROPIO FUERA DEL HUB SOCIAL, para las pantallas que solo necesitan saber qué se le ofrece a quien mira
 * (hoy, la casilla de las escenas en Diseño). Dentro del hub lo resuelve `useOwnProfileRank` junto al resto del
 * perfil; aquí basta con el rango.
 *
 * `null` mientras no se sabe —sin sesión, o con la lectura en vuelo—, que no es lo mismo que bronce: quien
 * pregunta para ENSEÑAR algo espera a saberlo en vez de enseñarlo y quitarlo. Un fallo de lectura sí cae a bronce,
 * como en todas partes: degradar es lo seguro. Cuesta una lectura del perfil propio como mucho, y casi nunca: la
 * caché de 60 s de `getOwnProfileRef` suele tenerlo ya del arranque con sesión.
 */
export function useOwnTier(): ProfileTier | null {
  const [tier, setTier] = useState<ProfileTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSocialAuth((user) => {
      if (!user?.uid) {
        if (!cancelled) setTier(null);
        return;
      }
      void resolveOwnProfile(user)
        .then((profile) => profile?.tier || DEFAULT_PROFILE_TIER)
        .catch(() => DEFAULT_PROFILE_TIER)
        .then((resolved) => {
          if (!cancelled) setTier(resolved);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return tier;
}
