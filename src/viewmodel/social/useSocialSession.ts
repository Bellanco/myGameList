// LA SESIÓN Y EL CANAL SOCIAL: quién eres en Google, tu gist social (con su ETag), la configuración de la
// sincronización principal y si el espacio social está abierto, resueltos al montar.
//
// Sale de `useSocialViewModel` con sus seis estados y el efecto que los fija. Lo que no puede cambiar, y por eso
// viene escrito: la configuración de la sincronización principal es ESTADO y se fija DESPUÉS de esperar al cifrado
// (`ensureSyncConfigLoaded`). Leer `getSyncConfig()` antes —en un inicializador o un `useMemo([])`— devolvía
// `token: ''` al montar, y el hub mandaba a Ajustes o leía con 401.
import { useEffect, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { ensureSyncConfigLoaded, getSyncConfig } from '../../model/repository/gistRepository';
import { getSocialSyncConfig, readSocialGist, saveSocialSyncConfig } from '../../model/repository/socialGistRepository';
import {
  getCurrentSocialAuthUser,
  getPrivateConfig,
  resolveOwnProfile,
  setPrivateConfig,
  type SocialAuthUser,
} from '../../model/repository/firebaseRepository';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import type { SyncConfig } from '../../model/types/game';
import { isNotFoundGistError } from './gistErrors';

export interface SocialSessionInput {
  /** Si el canal apuntado ya no existe, se sigue con la sesión pero con el editor de perfil delante. */
  lockProfileEditor: () => void;
  navigate: NavigateFunction;
}

export function useSocialSession({ lockProfileEditor, navigate }: SocialSessionInput) {
  const [socialCfgGistId, setSocialCfgGistId] = useState<string>('');
  const [socialCfgEtag, setSocialCfgEtag] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<SocialAuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSocialSpace, setShowSocialSpace] = useState(false);

  // El token del gist de juegos se cifra y se descifra de forma asíncrona (ensureSyncConfigLoaded).
  // Mantener la config en estado y refrescarla tras la hidratación evita la carrera en la que
  // getSyncConfig() devolvía token='' al montar (hasMainSync=false → gateway → /ajustes y lecturas 401).
  const [mainSyncConfig, setMainSyncConfig] = useState<SyncConfig | null>(() => getSyncConfig());

  /**
   * LA SESIÓN, ESCUCHADA Y NO SOLO LEÍDA. La apertura lee el usuario UNA vez (`getCurrentSocialAuthUser`), y si el
   * hub se montaba justo cuando la sesión parpadeaba —otra pestaña arrancando, ver `startAuth` en `firebaseClient`—
   * se quedaba con «nadie» y la pasarela pedía identificarse hasta volver a montar el hub, aunque la sesión hubiera
   * vuelto un segundo después. Ahora sigue los cambios: si vuelve, se abre el espacio; si se cierra de verdad (en
   * esta pestaña o en otra), se cierra.
   *
   * `latestAuth` es lo último que ha dicho la suscripción y `authEvents` cuántas veces ha hablado. La apertura lee el
   * usuario cuando la sesión ya está resuelta (`authStateReady`), así que esa lectura manda sobre lo dicho ANTES; lo
   * que la suscripción diga DESPUÉS es más reciente y manda sobre ella.
   */
  const latestAuth = useRef<SocialAuthUser | null>(null);
  const authEvents = useRef(0);
  useEffect(() => subscribeSocialAuth((user) => {
    latestAuth.current = user;
    authEvents.current += 1;
    setAuthUser((prev) => (prev?.uid === user?.uid ? prev : user));
    if (!user) {
      setShowSocialSpace(false);
      return;
    }
    // Volver con la sesión solo reabre el espacio si este dispositivo ya lo tenía. Crearlo o enlazarlo es cosa de
    // la pasarela, que lo hace al entrar.
    const gistId = getSocialSyncConfig()?.gistId?.trim() || '';
    if (gistId) {
      setSocialCfgGistId((prev) => prev || gistId);
      setShowSocialSpace(true);
    }
  }), []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await ensureSyncConfigLoaded(); // C4: garantiza el token descifrado antes de leer la config de sync
      if (cancelled) {
        return;
      }
      const mainConfig = getSyncConfig();
      setMainSyncConfig(mainConfig);
      const socialConfig = getSocialSyncConfig();
      const currentUser = await getCurrentSocialAuthUser();
      const eventsAtRead = authEvents.current;
      let resolvedGistId = socialConfig?.gistId || '';

      if (!resolvedGistId && currentUser?.uid && mainConfig?.token) {
        try {
          // FUENTE DEL GIST SOCIAL PROPIO, por orden de fiabilidad:
          //   1. `privateConfig.socialGistId` — owner-only, con UN SOLO escritor (su dueño). Es el sitio donde de
          //      verdad pertenece este dato, y hasta ahora se escribía sin que nadie lo leyera.
          //   2. El perfil público, como respaldo LEGACY: es donde se leía antes, pero lo puede ver cualquier
          //      usuario autenticado y va a dejar de publicarse.
          // Se consulta `privateConfig` primero para poder retirar el campo del perfil público sin dejar a nadie
          // sin forma de recuperar su canal en un dispositivo nuevo.
          const privateConfig = await getPrivateConfig(currentUser.uid).catch(() => null);
          const privateGistId = String(privateConfig?.socialGistId || '').trim();

          const profile = privateGistId ? null : await resolveOwnProfile(currentUser);
          const gistId = privateGistId || (profile?.socialEnabled ? profile.socialGistId.trim() : '');

          if (gistId) {
            let gistExists = true;
            try {
              await readSocialGist(mainConfig.token, gistId, null);
            } catch (error) {
              if (!isNotFoundGistError(error)) {
                throw error;
              }
              gistExists = false;
            }
            if (cancelled) {
              return;
            }

            if (!gistExists) {
              // El canal apuntado ya no existe. Se sigue SIN gist pero CON la sesión: salir aquí antes de fijarla
              // dejaba el hub como si no hubiera Google, el auto-crear no arrancaba y la pasarela volvía a pedir un
              // inicio de sesión que ya estaba hecho.
              lockProfileEditor();
            } else {
              saveSocialSyncConfig({
                token: mainConfig.token,
                gistId,
                etag: null,
                lastRemoteUpdatedAt: 0,
              });
              // SIEMBRA: si el id vino del perfil público (perfil anterior a que `privateConfig` se poblara), se
              // copia a su sitio. Sin esto, retirar el campo del perfil público dejaría a esas cuentas sin ninguna
              // forma de recuperar su canal. Best-effort: no puede romper la apertura del hub.
              if (!privateGistId) {
                void setPrivateConfig(currentUser.uid, { socialGistId: gistId }).catch(() => {});
              }
              resolvedGistId = gistId;
            }
          }
        } catch {
          // Keep gateway usable even if Firestore is unavailable.
        }
      }

      if (cancelled) {
        return;
      }

      // Otra vez lo último de la suscripción: entre la lectura del principio y aquí ha habido red de por medio.
      const finalUser = authEvents.current === eventsAtRead ? currentUser : latestAuth.current;
      setSocialCfgGistId(resolvedGistId);
      setSocialCfgEtag(socialConfig?.etag || null);
      setAuthUser(finalUser);
      setShowSocialSpace(Boolean(resolvedGistId && finalUser));
      setLoading(false);
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [lockProfileEditor, navigate]);

  return {
    authUser,
    setAuthUser,
    socialCfgGistId,
    setSocialCfgGistId,
    socialCfgEtag,
    setSocialCfgEtag,
    mainSyncConfig,
    loading,
    showSocialSpace,
    setShowSocialSpace,
  };
}
