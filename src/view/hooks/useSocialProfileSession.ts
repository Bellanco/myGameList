import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { findSocialProfileByEmail, subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import { getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { peekCachedSocialProfileIdentity } from '../../model/repository/indexedDbRepository';

function localSocialGistId(): string {
  return getSocialSyncConfig()?.gistId?.trim() || '';
}

type ProfileIdentity = { name: string; favorites: number[] };

/**
 * Indica si el usuario tiene un PERFIL SOCIAL **completo** (no solo sesión + gist): exige sesión de Google, un gist
 * social enlazado Y que el perfil sea válido con la MISMA regla que `useSocialViewModel` (nombre + ≥1 favorito, sin
 * favoritos huérfanos). El botón flotante de Cuenta se gatea con esto: si un favorito apunta a un juego borrado, el
 * perfil deja de estar completo y el botón desaparece para no poder navegar a `/cuenta` hasta arreglarlo.
 *
 * `completedGameIds` son los ids de la pestaña de completados (misma fuente que los favoritos válidos). La
 * completitud se recalcula cuando cambian (p. ej. al borrar un juego), así el gate es reactivo sin red.
 *
 * Se monta en la raíz (App). La identidad (nombre + favoritos guardados) se lee de la caché persistente ignorando
 * el TTL (los favoritos no caducan) y se refresca al navegar, de modo que tras re-guardar el perfil el botón vuelve
 * a aparecer. Caso residual: dispositivo donde NUNCA se ha abierto Social → sin identidad cacheada no se puede
 * probar incompletitud sin red, así que se mantiene el comportamiento previo (mostrar el botón); el editor del hub
 * social corrige en la primera visita.
 */
export function useSocialProfileSession(completedGameIds: ReadonlySet<number>): boolean {
  const { pathname } = useLocation();
  const [gistId, setGistId] = useState('');
  // `undefined` = aún sin leer (no mostramos el botón todavía para evitar un parpadeo mostrar→ocultar en perfiles
  // incompletos); `null` = leído pero sin registro (dispositivo donde nunca se abrió Social); objeto = identidad real.
  const [identity, setIdentity] = useState<ProfileIdentity | null | undefined>(undefined);

  // Resolución de sesión + gist (rápida desde config local; respaldo en Firestore por email en dispositivo nuevo).
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSocialAuth((user) => {
      if (!user?.email) {
        if (!cancelled) setGistId('');
        return;
      }

      const local = localSocialGistId();
      if (local) {
        if (!cancelled) setGistId(local);
        return;
      }

      void findSocialProfileByEmail(user.email)
        .then((profile) => {
          if (cancelled) return;
          setGistId(profile?.socialEnabled ? profile.socialGistId.trim() : '');
        })
        .catch(() => {
          if (!cancelled) setGistId('');
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Identidad cacheada (nombre + favoritos). Se relee al cambiar el gist o al navegar: así, tras re-guardar el
  // perfil (que actualiza la caché y navega), el gate refleja los favoritos nuevos sin esperar a re-autenticar.
  useEffect(() => {
    let cancelled = false;
    if (!gistId) {
      return;
    }
    // No reseteamos `identity` a `undefined` aquí: conservar el valor previo mientras se relee evita parpadeos al
    // navegar. El estado de "cargando" (undefined) solo aplica en el primer arranque.
    void peekCachedSocialProfileIdentity(gistId).then((id) => {
      if (!cancelled) setIdentity(id);
    });
    return () => {
      cancelled = true;
    };
  }, [gistId, pathname]);

  return useMemo(() => {
    if (!gistId) return false;
    // Aún leyendo la identidad: mantener el botón oculto hasta saberlo (evita el parpadeo en perfiles incompletos).
    if (identity === undefined) return false;
    // Leído sin registro (nunca se abrió Social en este dispositivo): no se puede probar incompletitud sin red.
    if (identity === null) return true;
    const validFavorites = identity.favorites.filter((id) => completedGameIds.has(id));
    return (
      Boolean(identity.name.trim()) &&
      validFavorites.length > 0 &&
      validFavorites.length === identity.favorites.length
    );
  }, [gistId, identity, completedGameIds]);
}
