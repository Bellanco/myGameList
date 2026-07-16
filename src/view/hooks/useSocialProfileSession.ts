import { useEffect, useState } from 'react';
import { findSocialProfileByEmail, subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import { getSocialSyncConfig } from '../../model/repository/gistConfigRepository';

function hasLocalSocialGist(): boolean {
  return Boolean(getSocialSyncConfig()?.gistId?.trim());
}

/**
 * Indica si el usuario tiene un PERFIL SOCIAL configurado, no solo sesión de Google: exige sesión activa
 * MÁS un gist social enlazado (mismo criterio que `hasReadyAccess` en useSocialViewModel). El botón flotante
 * de Cuenta se gatea con esto, para no aparecer por el mero hecho de haber una sesión de Google recordada.
 *
 * Se monta en la raíz (App) y se resuelve al abrir la web: respuesta instantánea desde la config local de
 * este dispositivo y, si aún no existe (p. ej. dispositivo nuevo), respaldo en Firestore por email. Empieza
 * en `false` (oculto por defecto) y solo pasa a `true` cuando se confirma el perfil.
 */
export function useSocialProfileSession(): boolean {
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeSocialAuth((user) => {
      if (!user?.email) {
        if (!cancelled) setHasProfile(false);
        return;
      }

      // Respuesta rápida: si este dispositivo ya tiene el gist social enlazado, el perfil está configurado.
      if (hasLocalSocialGist()) {
        if (!cancelled) setHasProfile(true);
        return;
      }

      // Respaldo (dispositivo nuevo / caché local aún vacía): confirmar el perfil en Firestore por email.
      void findSocialProfileByEmail(user.email)
        .then((profile) => {
          if (cancelled) return;
          setHasProfile(Boolean(profile?.socialEnabled && profile.socialGistId.trim()));
        })
        .catch(() => {
          if (!cancelled) setHasProfile(false);
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return hasProfile;
}
