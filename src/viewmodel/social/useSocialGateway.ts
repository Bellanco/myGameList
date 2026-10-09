// LA PASARELA AL ESPACIO SOCIAL: iniciar sesión con Google, adoptar el canal social que ya exista o crear uno, y
// el botón que lleva al siguiente paso.
//
// Sale de `useSocialViewModel` con sus tres estados de «en marcha» (`signingIn`, `resolvingSocialGist`,
// `connecting`), que solo se tocan aquí. La SESIÓN y el CANAL no: los lee todo el hub (directorio, perfil, feed), así
// que siguen viviendo en el view-model y esta pieza recibe con qué cambiarlos.
//
// Lo que no puede cambiar al moverlo, y por eso viene escrito:
//  · Nunca se crea un canal a ciegas: si no se puede saber si la cuenta ya tiene uno (`unknown`), el auto-crear se
//    cierra en esta sesión. Crear aquí dejaba el historial real huérfano y un canal vacío adoptado como propio.
//  · El canal se busca primero en `privateConfig` (owner-only) y solo después en el campo LEGACY del perfil público.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import type { IconName } from '../../core/constants/icons';
import { isNetworkFailure, isOffline } from '../../core/utils/network';
import { isSupersededSignIn } from '../../core/utils/googleSignIn';
import { createSocialGist, readSocialGist, saveSocialSyncConfig } from '../../model/repository/socialGistRepository';
import { isPermissionDeniedError } from '../../model/repository/firebaseClient';
import {
  clearAnalyticsUser,
  getPrivateConfig,
  resolveOwnProfile,
  setPrivateConfig,
  signInWithGoogle,
  signOutSocialUser,
  type SocialAuthUser,
} from '../../model/repository/firebaseRepository';
import type { SyncConfig } from '../../model/types/game';
import { resolveGateway } from './socialGateway';
import { isNotFoundGistError } from './gistErrors';
import { forgetSocialDataOnDevice } from '../../model/repository/socialSignOutCleanup';

/** Respuesta de `attachExistingSocialGist`: vinculado, no tiene, o no se ha podido saber. */
type ExistingSocialGist = 'linked' | 'none' | 'unknown';

export interface SocialGatewayInput {
  mainSyncConfig: SyncConfig | null;
  hasMainSync: boolean;
  authUser: SocialAuthUser | null;
  hasSocialGist: boolean;
  /** ¿Consta la aceptación vigente de las condiciones? Sin ella no se ofrece crear el canal. */
  legalGateOpen: boolean;
  setAuthUser: Dispatch<SetStateAction<SocialAuthUser | null>>;
  setSocialCfgGistId: Dispatch<SetStateAction<string>>;
  setSocialCfgEtag: Dispatch<SetStateAction<string | null>>;
  setShowSocialSpace: Dispatch<SetStateAction<boolean>>;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
  navigate: NavigateFunction;
}

export function useSocialGateway({
  mainSyncConfig,
  hasMainSync,
  authUser,
  hasSocialGist,
  legalGateOpen,
  setAuthUser,
  setSocialCfgGistId,
  setSocialCfgEtag,
  setShowSocialSpace,
  setFeedback,
  reportFailure,
  navigate,
}: SocialGatewayInput) {
  const [resolvingSocialGist, setResolvingSocialGist] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const hasSocialSession = Boolean(authUser);
  const canConnectSocialGist =
    hasMainSync && hasSocialSession && !hasSocialGist && !connecting && !resolvingSocialGist && legalGateOpen;
  const canSignInGoogle = hasMainSync && !hasSocialSession && !signingIn;

  // Pasarela (pasos, paso actual y progreso): derivación pura en `social/socialGateway`.
  const { steps: gatewaySteps, currentStep } = useMemo(
    () => resolveGateway({ hasMainSync, hasSocialSession, hasSocialGist }),
    [hasMainSync, hasSocialSession, hasSocialGist],
  );

  /** El auto-crear del canal social se cierra en esta sesión si no se ha podido saber si ya existe uno. */
  const autoCreateSocialGistBlockedRef = useRef(false);

  /**
   * ¿Tiene ya esta cuenta un canal social? TRES respuestas, y la tercera es la que importa: `unknown`.
   *
   * Era un booleano, y cualquier fallo al preguntar (Firestore sin cuota o caído, GitHub limitado) salía como
   * `false`, que quien llama lee como «no tiene»: el mismo canal vacío del comentario de abajo, pero por un fallo
   * del servicio en vez de por la migración del campo (docs/plan-degradacion-servicios.md, fase 1). `none` solo
   * cuando las fuentes RESPONDEN que no hay nada; una regla que no deja leer (`permission-denied`) es una respuesta.
   */
  const attachExistingSocialGist = useCallback(async (user: SocialAuthUser): Promise<ExistingSocialGist> => {
    if (!mainSyncConfig?.token) {
      setFeedback('warn', SOCIAL_UI.status.needMainSync);
      return 'unknown';
    }

    try {
      setResolvingSocialGist(true);
      // FUENTE DEL CANAL, por orden: `privateConfig` (owner-only, un solo escritor) y solo después el campo LEGACY
      // del perfil público. Mirando solo el perfil, esta función devolvía SIEMPRE false en cuanto la cuenta migró
      // —ese campo se purga—, y el camino que la usa (`handleSignInGoogle`, en un navegador sin configuración local:
      // dispositivo nuevo, almacenamiento limpiado u otro origen) caía en el auto-crear: un canal nuevo y VACÍO
      // adoptado como propio, el historial real huérfano y el editor de perfil pidiendo el alta otra vez. Y como el
      // saneado de amistades corre al abrir el hub, habría repuntado a los amigos a ese gist vacío, dejándoles sin
      // la actividad de esta cuenta. Aquí NO vale el efecto de recuperación del montaje: ese ya corrió sin sesión.
      const savedConfig = await getPrivateConfig(user.uid).catch((error: unknown) => {
        if (isPermissionDeniedError(error)) return null;
        throw error;
      });
      const savedGistId = String(savedConfig?.socialGistId || '').trim();
      const existingProfile = savedGistId ? null : await resolveOwnProfile(user);
      const existingGistId = savedGistId || (existingProfile?.socialEnabled ? existingProfile.socialGistId.trim() : '');

      if (!existingGistId) {
        return 'none';
      }

      try {
        await readSocialGist(mainSyncConfig.token, existingGistId, null);
      } catch (error) {
        if (isNotFoundGistError(error)) {
          return 'none';
        }

        throw error;
      }

      saveSocialSyncConfig({
        token: mainSyncConfig.token,
        gistId: existingGistId,
        etag: null,
        lastRemoteUpdatedAt: 0,
      });
      setSocialCfgGistId(existingGistId);
      setSocialCfgEtag(null);
      // Si vino del campo legacy, se copia a su sitio: es lo único que evita que el siguiente dispositivo vuelva a
      // no encontrarlo cuando ese campo quede purgado.
      if (!savedGistId) {
        void setPrivateConfig(user.uid, { socialGistId: existingGistId }).catch(() => {});
      }
      setFeedback('ok', SOCIAL_UI.status.gistLinkedFromFirestore);
      return 'linked';
    } catch (error) {
      // No se sabe, y entonces no se crea nada. Sin red, el aviso de siempre; con el servicio caído o sin cuota, uno
      // que no asusta y dice lo que importa: no se ha tocado nada.
      if (isNetworkFailure(error) || isOffline()) {
        reportFailure(error, SOCIAL_UI.status.firestoreCheckFailed);
      } else {
        setFeedback('warn', SOCIAL_UI.status.channelCheckUnavailable, 'long');
      }
      return 'unknown';
    } finally {
      setResolvingSocialGist(false);
    }
  }, [mainSyncConfig, reportFailure, setFeedback, setSocialCfgEtag, setSocialCfgGistId]);

  const handleCreateSocialGist = useCallback(async () => {
    if (!mainSyncConfig?.token) {
      setFeedback('warn', SOCIAL_UI.status.needMainSync);
      return;
    }

    if (!authUser) {
      setFeedback('warn', SOCIAL_UI.status.needGoogleBeforeCreate);
      return;
    }

    try {
      setConnecting(true);
      const existing = await attachExistingSocialGist(authUser);
      if (existing === 'linked') {
        return;
      }
      if (existing === 'unknown') {
        // Puede que ya tenga canal: crear otro aquí sería el canal vacío de `attachExistingSocialGist`. Y el
        // auto-crear no vuelve a intentarlo en esta sesión: su efecto se dispara cada vez que `connecting` vuelve a
        // `false`, así que sin este cierre preguntaría en bucle a un servicio que no responde.
        autoCreateSocialGistBlockedRef.current = true;
        return;
      }

      const created = await createSocialGist(mainSyncConfig.token);
      saveSocialSyncConfig({
        token: mainSyncConfig.token,
        gistId: created.gistId,
        etag: created.etag,
        lastRemoteUpdatedAt: 0,
      });
      setSocialCfgGistId(created.gistId);
      setSocialCfgEtag(created.etag);
      setFeedback('ok', SOCIAL_UI.status.gistNotFoundCreated);
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.createGistFailed);
    } finally {
      setConnecting(false);
    }
  }, [attachExistingSocialGist, authUser, mainSyncConfig, reportFailure, setFeedback, setSocialCfgEtag, setSocialCfgGistId]);

  const handleSignInGoogle = useCallback(async () => {
    let superseded = false;
    try {
      setSigningIn(true);
      // Si vuelve sin terminar (cerró la ventana, o «atrás» en el móvil), el botón se devuelve enseguida en vez de
      // quedarse en «Entrando...» hasta que Firebase se dé cuenta (ver `core/utils/googleSignIn`).
      const user = await signInWithGoogle({ onAbandoned: () => setSigningIn(false) });
      setAuthUser(user);
      const linkedExisting = (await attachExistingSocialGist(user)) === 'linked';
      if (linkedExisting) {
        setShowSocialSpace(true);
        setFeedback('ok', SOCIAL_UI.status.signInAndLinked);
      } else {
        // No hacer nada aquí; el useEffect automático manejará la creación del gist
      }
    } catch (error) {
      // Volvió a pulsar: este intento lo canceló el nuevo, que es quien lleva el botón ahora.
      if (isSupersededSignIn(error)) {
        superseded = true;
        return;
      }
      reportFailure(error, SOCIAL_UI.status.signInFailed);
    } finally {
      if (!superseded) setSigningIn(false);
    }
  }, [attachExistingSocialGist, reportFailure, setAuthUser, setFeedback, setShowSocialSpace]);

  // Auto-crear gist social si tenemos token + Google pero no gist. Salvo que en esta sesión no se haya podido saber
  // si ya existe uno (`unknown`): entonces se espera a otra sesión o al botón; nunca se crea a ciegas.
  useEffect(() => {
    autoCreateSocialGistBlockedRef.current = false;
  }, [authUser?.uid]);
  useEffect(() => {
    if (
      hasMainSync && authUser && !hasSocialGist && !connecting && !resolvingSocialGist && !signingIn &&
      !autoCreateSocialGistBlockedRef.current
    ) {
      void handleCreateSocialGist();
    }
  }, [hasMainSync, authUser, hasSocialGist, connecting, resolvingSocialGist, signingIn, handleCreateSocialGist]);

  const handleSignOut = useCallback(async () => {
    await signOutSocialUser();
    // Lo de los demás se va del dispositivo: listados de amistades, amistades, directorio (ver la cabecera de
    // `socialSignOutCleanup`). Antes de soltar la sesión en la interfaz, para que nada lo vuelva a pintar.
    await forgetSocialDataOnDevice();
    void clearAnalyticsUser(); // desvincula al usuario de los eventos/errores posteriores (simétrico con setAnalyticsUser en login)
    setAuthUser(null);
    setShowSocialSpace(false);
    setFeedback('ok', SOCIAL_UI.status.signOut, 'long');
  }, [setAuthUser, setFeedback, setShowSocialSpace]);

  const primaryGatewayCta = useMemo(() => {
    type GatewayCta = {
      icon: IconName;
      label: string;
      action: () => void;
      disabled: boolean;
    };

    // Paso 1: Conectar sincronización principal (token)
    if (!hasMainSync) {
      return {
        icon: 'gear',
        label: SOCIAL_UI.gateway.connectSync,
        // El contrato del CTA es `() => void`; `navigate` devuelve promesa, así que la flecha la propagaba y el
        // consumidor creía tener un manejador síncrono. Llaves + `void`: la intención queda escrita y el tipo cuadra.
        action: () => { void navigate('/ajustes'); },
        disabled: false,
      } satisfies GatewayCta;
    }

    // Paso 2: Google (si tenemos token pero no sesión)
    if (resolvingSocialGist) {
      return {
        icon: 'cloud-sync',
        label: SOCIAL_UI.gateway.resolveProfile,
        action: () => undefined,
        disabled: true,
      } satisfies GatewayCta;
    }

    if (canSignInGoogle) {
      return {
        icon: 'bottom-hub',
        label: signingIn ? SOCIAL_UI.gateway.signingIn : SOCIAL_UI.gateway.signIn,
        action: () => void handleSignInGoogle(),
        disabled: signingIn,
      } satisfies GatewayCta;
    }

    // Paso 3: Gist social (si tenemos sesión pero no gist) - normalmente automático pero se puede forzar
    if (canConnectSocialGist) {
      return {
        icon: 'cloud-sync',
        label: connecting ? SOCIAL_UI.gateway.creatingGist : SOCIAL_UI.gateway.createGist,
        action: () => void handleCreateSocialGist(),
        disabled: connecting,
      } satisfies GatewayCta;
    }

    return null;
  }, [canConnectSocialGist, canSignInGoogle, connecting, handleCreateSocialGist, handleSignInGoogle, hasMainSync, navigate, resolvingSocialGist, signingIn]);

  return {
    connecting,
    signingIn,
    resolvingSocialGist,
    gatewaySteps,
    currentStep,
    handleCreateSocialGist,
    handleSignInGoogle,
    handleSignOut,
    primaryGatewayCta,
  };
}
