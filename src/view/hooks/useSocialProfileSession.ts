import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getPrivateConfig, resolveOwnProfile, subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import { getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { peekCachedSocialProfileIdentity } from '../../model/repository/indexedDbRepository';

function localSocialGistId(): string {
  return getSocialSyncConfig()?.gistId?.trim() || '';
}

type ProfileIdentity = { name: string };

/**
 * EL ESTADO DE LO SOCIAL EN TRES VALORES, y el tercero es el que importa: `pending`.
 *
 * El booleano de siempre no distingue «no hay perfil» de «todavía no lo sé», y para gatear una puerta da igual
 * —ante la duda, cerrada—. Para ENCENDER UN AVISO no da igual: la resolución pasa por la sesión de Google y por
 * una lectura de IndexedDB, así que en cada arranque hay un tramo en el que la respuesta honesta es «aún no lo
 * sé». Pintar ahí el aviso rojo sería acusar de apagado lo que está encendido, una vez por visita.
 */
export type SocialProfileStatus = 'pending' | 'active' | 'inactive';

/**
 * Indica si el usuario tiene un PERFIL SOCIAL **completo** (no solo sesión + gist): exige sesión de Google, un gist
 * social enlazado Y que el perfil sea válido con la MISMA regla que `useSocialViewModel` (nombre + al menos un juego
 * completado). Devuelve además `pending` mientras no se sabe (ver `SocialProfileStatus`). El botón flotante de Cuenta se gatea con esto: si el usuario se queda sin completados, el perfil deja
 * de estar completo y el botón desaparece para no poder navegar a `/cuenta` hasta arreglarlo.
 *
 * `completedGameIds` son los ids de la pestaña de completados. La completitud se recalcula cuando cambian (p. ej. al
 * borrar el último juego), así el gate es reactivo sin red.
 *
 * Se monta en la raíz (App). La identidad (el nombre guardado) se lee de la caché persistente ignorando el TTL (el
 * nombre no caduca) y se refresca al navegar, de modo que tras re-guardar el perfil el botón vuelve a aparecer.
 * Caso residual: dispositivo donde NUNCA se ha abierto Social → sin identidad cacheada no se puede probar
 * incompletitud sin red, así que se mantiene el comportamiento previo (mostrar el botón); el editor del hub social
 * corrige en la primera visita.
 */
export function useSocialProfileStatus(completedGameIds: ReadonlySet<number>): SocialProfileStatus {
  const { pathname } = useLocation();
  // `undefined` = la sesión aún no ha contestado; `''` = contestó que no hay canal social; un id = lo hay.
  const [gistId, setGistId] = useState<string | undefined>(undefined);
  // `undefined` = aún sin leer (no mostramos el botón todavía para evitar un parpadeo mostrar→ocultar en perfiles
  // incompletos); `null` = leído pero sin registro (dispositivo donde nunca se abrió Social); objeto = identidad real.
  const [identity, setIdentity] = useState<ProfileIdentity | null | undefined>(undefined);

  // Resolución de sesión + gist (rápida desde config local; respaldo en Firestore por email en dispositivo nuevo).
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSocialAuth((user) => {
      if (!user?.uid) {
        if (!cancelled) setGistId('');
        return;
      }

      const local = localSocialGistId();
      if (local) {
        if (!cancelled) setGistId(local);
        return;
      }

      // Sin config local, el canal se recupera de `privateConfig` (owner-only) y solo después del campo LEGACY del
      // perfil público. Leyendo solo el perfil, este respaldo dejó de funcionar en cuanto la cuenta migró —ese campo
      // se purga—: el gate se quedaba en falso y el botón de Cuenta no aparecía nunca en un dispositivo nuevo.
      void getPrivateConfig(user.uid)
        .catch(() => null)
        .then(async (privateConfig) => {
          const saved = String(privateConfig?.socialGistId || '').trim();
          if (saved) return saved;
          const profile = await resolveOwnProfile(user);
          return profile?.socialEnabled ? profile.socialGistId.trim() : '';
        })
        .then((resolved) => {
          if (!cancelled) setGistId(resolved);
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

  // Identidad cacheada (el nombre). Se relee al cambiar el gist o al navegar DENTRO de lo social: así, tras
  // re-guardar el perfil (que actualiza la caché y navega), el gate refleja el nombre nuevo sin esperar a
  // re-autenticar.
  //
  // El disparo se acota a las rutas sociales a propósito. Este hook se monta en la raíz (App), así que con el
  // `pathname` entero se abría IndexedDB en CADA navegación de la app —incluido cambiar de pestaña de listados,
  // que es lo que más se hace— para releer un dato que solo puede cambiar desde el editor de perfil. Dentro de
  // `/social` se conservan todos los disparos de antes, que es donde el dato se escribe.
  const socialPathname = pathname.startsWith('/social') ? pathname : '';
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
  }, [gistId, socialPathname]);

  return useMemo<SocialProfileStatus>(() => {
    // La sesión todavía no ha contestado: ni sí ni no.
    if (gistId === undefined) return 'pending';
    if (!gistId) return 'inactive';
    // Aún leyendo la identidad: mantener el botón oculto hasta saberlo (evita el parpadeo en perfiles incompletos).
    if (identity === undefined) return 'pending';
    // Leído sin registro (nunca se abrió Social en este dispositivo): no se puede probar incompletitud sin red.
    if (identity === null) return 'active';
    return Boolean(identity.name.trim()) && completedGameIds.size > 0 ? 'active' : 'inactive';
  }, [gistId, identity, completedGameIds]);
}

/**
 * El MISMO gate de siempre, en booleano, para quien solo necesita abrir o cerrar una puerta: mientras no se sabe,
 * cerrada. Quien vaya a DIBUJAR el estado debe usar `useSocialProfileStatus` y tratar `pending` aparte.
 */
export function useSocialProfileSession(completedGameIds: ReadonlySet<number>): boolean {
  return useSocialProfileStatus(completedGameIds) === 'active';
}
