// TU PERFIL EN EL ESPACIO SOCIAL: hidratarlo al abrir, mandarte al editor si está incompleto y guardarlo.
//
// Sale de `useSocialViewModel` con la REGLA DE COMPLETADOS, que es la que deciden los dos —hidratar y guardar— y
// que tiene que ser la misma en ambos o el usuario rebota entre el feed y el editor (ver `hasCompletedGames`). Los
// estados de «tienes que crear tu perfil» (`mustCreateProfile`, `hasCreatedProfile`, `justSavedProfile`) no se
// mueven: también los leen la puerta del directorio y el arranque, así que llegan aquí con sus setters.
//
// El token social se descifra de forma asíncrona: hidratar y guardar lo ESPERAN (`ensureSyncConfigLoaded`) antes
// de leerlo, igual que antes de moverse.
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { APP_LOCALE } from '../../core/constants/locale';
import { isOffline, isServiceUnavailable } from '../../core/utils/network';
import { ensureSyncConfigLoaded } from '../../model/repository/gistRepository';
import { useSingleFlight } from '../useSingleFlight';
import {
  getSocialSyncConfig,
  readSocialGist,
  remapSocialActorIds,
  saveSocialSyncConfig,
  writeSocialGist,
} from '../../model/repository/socialGistRepository';
import { reconcileReviewActivity } from '../../model/repository/socialActivityReconcile';
import { getCachedSocialProfile, putCachedSocialProfile, type CachedSocialProfileData } from '../../model/repository/indexedDbRepository';
import {
  ensureProfileByEmail,
  healOwnFriendshipIdentity,
  resolveOwnProfile,
  resolveStableProfileId,
  type SocialAuthUser,
} from '../../model/repository/firebaseRepository';
import { TAB_IDS, type SyncConfig, type TabData } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/types/social';
import { normalizeVisibility, type SocialProfileForm } from './useSocialProfileForm';
import type { SocialPanel } from './socialRoutes';
import { isNotFoundGistError } from './gistErrors';

const shouldRequireProfileCreation = (profileExists: boolean, justSavedProfile: boolean): boolean => {
  return !profileExists && !justSavedProfile;
};

const shouldRedirectToProfileEditor = (isProfileEditorLocked: boolean, activePanel: string): boolean => {
  return isProfileEditorLocked && activePanel !== 'profile';
};

export interface OwnProfileEditorInput {
  /** Los listados VIVOS de la app, o la foto de `localStorage` si no llegan: la misma fuente que la reconciliación. */
  games: TabData;
  socialSpaceOpen: boolean;
  authUser: SocialAuthUser | null;
  socialCfgGistId: string;
  socialCfgEtag: string | null;
  setSocialCfgGistId: Dispatch<SetStateAction<string>>;
  setSocialCfgEtag: Dispatch<SetStateAction<string | null>>;
  mainSyncConfig: SyncConfig | null;
  activePanel: SocialPanel;
  navigate: NavigateFunction;
  profileForm: SocialProfileForm;
  profileName: string;
  hideReplayable: boolean;
  hideRetry: boolean;
  hideGameTime: boolean;
  hydrateProfileForm: SocialProfileForm['hydrate'];
  defaultSocialVisibility: SocialProfileVisibility;
  ownPhotoIsGeneric: boolean | undefined;
  ownPublishablePhoto: string;
  mustCreateProfile: boolean;
  setMustCreateProfile: Dispatch<SetStateAction<boolean>>;
  setHasCreatedProfile: Dispatch<SetStateAction<boolean>>;
  justSavedProfile: boolean;
  setJustSavedProfile: Dispatch<SetStateAction<boolean>>;
  lockProfileEditor: () => void;
  hydrateSocialDirectory: (forceRefresh?: boolean, options?: { keepDirectoryQuery?: boolean }) => Promise<void>;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
}

export function useOwnProfileEditor({
  games,
  socialSpaceOpen,
  authUser,
  socialCfgGistId,
  socialCfgEtag,
  setSocialCfgGistId,
  setSocialCfgEtag,
  mainSyncConfig,
  activePanel,
  navigate,
  profileForm,
  profileName,
  hideReplayable,
  hideRetry,
  hideGameTime,
  hydrateProfileForm,
  defaultSocialVisibility,
  ownPhotoIsGeneric,
  ownPublishablePhoto,
  mustCreateProfile,
  setMustCreateProfile,
  setHasCreatedProfile,
  justSavedProfile,
  setJustSavedProfile,
  lockProfileEditor,
  hydrateSocialDirectory,
  setFeedback,
  reportFailure,
}: OwnProfileEditorInput) {
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // MISMA fuente que la reconciliación (`reconcileGames`, más abajo): los listados VIVOS de la app, y la foto de
  // `localStorage` solo como respaldo cuando no llegan.
  //
  // Aquí estaba la causa del rebote al editor de perfil. Esto se derivaba de `localState`, que es una foto tomada
  // al montar (lo dice el docblock del propio parámetro `games`), mientras que la app ya tenía la biblioteca en
  // memoria. Con la foto vacía o atrasada —arranque con la sincronización en curso, hidratación desde el gist,
  // navegación a social antes de que localStorage estuviera escrito— un perfil perfectamente dado de alta se veía
  // sin juegos completados, se tomaba por incompleto y se redirigía al editor nada más entrar. Y `App` calculaba lo
  // mismo con la lista VIVA (`vm.data.c`) para el botón de Cuenta, así que las dos mitades de la misma regla
  // discrepaban: exactamente el rebote contra el que advierte el comentario de `hasCompletedGames`.
  const liveLists = games;

  const completedGames = useMemo(() => {
    const map = new Map<number, string>();
    liveLists.c.forEach((game) => {
      if (game.id > 0 && game.name) {
        map.set(game.id, game.name);
      }
    });

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, APP_LOCALE));
  }, [liveLists]);

  // Requisito de alta: un perfil solo puede existir si el usuario tiene al menos un juego COMPLETADO. Es la única
  // regla de completitud (junto al nombre) y se aplica idéntica en la hidratación, el guardado y el gate del botón
  // de Cuenta (`useSocialProfileSession`); si divergieran, el usuario rebotaría entre el feed y el editor.
  const hasCompletedGames = completedGames.length > 0;

  // ¿Está la biblioteca en ESTE dispositivo? Que no haya NADA en ninguna lista significa "aquí no se ha
  // sincronizado todavía" (dispositivo nuevo, otro origen, sincronización en curso), y eso NO es lo mismo que "no
  // tienes juegos completados". Confundirlos mandaba al editor a un usuario ya dado de alta, que además leía
  // "Sincronizado" nada más llegar: el diagnóstico y el mensaje se contradecían.
  const libraryPresentLocally =
    TAB_IDS.some((tab) => (liveLists[tab] || []).length > 0);
  // El requisito de tener un juego completado solo se puede DAR POR INCUMPLIDO si la biblioteca está aquí para
  // comprobarlo. El guardado del perfil lo sigue exigiendo siempre (ahí el usuario está mirando sus propias listas).
  const completedGamesRequirementMet = hasCompletedGames || !libraryPresentLocally;

  const hydrateSocialProfile = useCallback(async () => {
    if (!socialSpaceOpen || !authUser || !socialCfgGistId) {
      return;
    }

    // C4: el token del canal social también se descifra de forma asíncrona. Sin esperarlo, una hidratación que
    // llegue antes que la del arranque leería `token: ''` y abortaría con "falta el token" teniéndolo.
    await ensureSyncConfigLoaded();
    const socialConfig = getSocialSyncConfig();
    if (!socialConfig?.token) {
      setFeedback('err', SOCIAL_UI.status.missingSocialToken);
      return;
    }

    /**
     * Aplica un perfil ya guardado en este dispositivo. Extraído porque se usa en DOS caminos: el normal (caché
     * dentro de su ventana) y el de rescate (la lectura del gist falla por red → mejor el perfil de hace un rato
     * que mandar al usuario al editor como si no tuviera perfil).
     */
    const applyCachedProfile = (cached: CachedSocialProfileData) => {
      // No confiamos en el `profileExists` cacheado (pudo escribirse con una regla antigua): lo recalculamos con el
      // criterio actual (nombre Y ≥1 juego completado) para que los perfiles incompletos ya guardados sean
      // redirigidos al editor sin esperar a que caduque la caché (~5 min).
      const cachedProfileExists = Boolean(cached.name.trim()) && hasCompletedGames;
      hydrateProfileForm({ name: cached.name, visibility: cached });
      setHasCreatedProfile(cachedProfileExists);

      const cachedProfileUsable = Boolean(cached.name.trim()) && completedGamesRequirementMet;
      const mustCreateCached = shouldRequireProfileCreation(cachedProfileUsable, justSavedProfile);
      if (mustCreateCached) {
        lockProfileEditor();
      } else {
        setMustCreateProfile(false);
      }
    };

    // Caché persistente del perfil propio: al volver a la pantalla social dentro de la ventana (<5 min) se sirve de
    // IndexedDB sin releer el gist propio ni consultar Firestore. El guardado del perfil invalida esta caché.
    const cachedProfile = await getCachedSocialProfile(socialCfgGistId);
    if (cachedProfile) {
      applyCachedProfile(cachedProfile);
      return;
    }

    try {
      setHydratingProfile(true);
      // Solo da un respaldo del nombre (abajo): si Firestore no atiende, se sigue con lo del gist en vez de perder la
      // hidratación entera por un dato de reserva.
      const existingProfile = await resolveOwnProfile(authUser).catch(() => null);

      const socialRead = await readSocialGist(socialConfig.token, socialCfgGistId, socialCfgEtag);
      if (!socialRead.notModified) {
        setSocialCfgEtag(socialRead.etag || null);
      }

      const hasLegacySharedLists = Object.keys(socialRead.data.profile.sharedLists || {}).length > 0;

      // Upgrade proactivo: reescribir si el remoto conserva texto de reseña legacy (review/reviewText), identidad por
      // uid, sharedLists, o arrays de recomendaciones legacy (ST3) → todo eso lo detecta socialGistNeedsRewrite
      // (socialRead.wasLegacy). Deja el gist en formato index-only actual (snippet-only, sin recommendations/sharedLists).
      if (hasLegacySharedLists || socialRead.wasLegacy) {
        // 6.2b: al reescribir el gist propio, remapea la identidad legacy (miUid → miProfileId) para sacar
        // el uid del canal público; el resto de la limpieza (snippet-only, sin sharedLists) sigue igual.
        const myProfileId = await resolveStableProfileId(authUser.uid);
        const remapped = remapSocialActorIds(socialRead.data, { [authUser.uid]: myProfileId });
        const cleanedPayload = {
          ...remapped,
          profile: {
            ...remapped.profile,
            sharedLists: {},
          },
          updatedAt: Date.now(),
        };

        const cleanedWrite = await writeSocialGist(socialConfig.token, socialCfgGistId, cleanedPayload);
        const nextEtag = cleanedWrite.etag || socialRead.etag || null;
        setSocialCfgEtag(nextEtag);
        saveSocialSyncConfig({
          token: socialConfig.token,
          gistId: socialCfgGistId,
          etag: nextEtag,
          lastRemoteUpdatedAt: Date.now(),
        });
      }

      const nextName = socialRead.data.profile.name || existingProfile?.displayName || authUser.displayName || authUser.email;
      const profileVisibility = socialRead.data.profile.visibility || defaultSocialVisibility;
      // Un perfil se considera COMPLETO (nombre Y al menos un juego completado en local) para el chip de estado y
      // para el guardado. Pero lo que decide MANDAR AL EDITOR es solo si el perfil EXISTE, o sea si tiene nombre.
      //
      // Lo que cambia respecto a antes es SOLO el caso ambiguo: sin biblioteca en este dispositivo no se puede
      // afirmar que no haya completados (ver `completedGamesRequirementMet`). Con la biblioteca presente y ningún
      // completado, se sigue mandando al editor con el motivo a la vista, que es la regla de alta de siempre.
      const profileHasIdentity = Boolean(socialRead.data.profile.name.trim());
      const profileExists = profileHasIdentity && hasCompletedGames;

      const normalizedVisibility = normalizeVisibility(profileVisibility);
      hydrateProfileForm({ name: nextName, visibility: normalizedVisibility });
      setHasCreatedProfile(profileExists);

      // Sembrar la caché para que la próxima navegación a social no relea el gist propio dentro de la ventana de TTL.
      void putCachedSocialProfile(socialCfgGistId, {
        name: nextName,
        ...normalizedVisibility,
        profileExists,
        activity: socialRead.data.activity,
      });

      const mustCreate = shouldRequireProfileCreation(profileHasIdentity && completedGamesRequirementMet, justSavedProfile);

      // Keep profile creation routing centralized to avoid navigation regressions.
      if (mustCreate) {
        lockProfileEditor();
      } else {
        setMustCreateProfile(false);
      }
    } catch (error) {
      if (isNotFoundGistError(error) && authUser && mainSyncConfig?.token) {
        saveSocialSyncConfig({
          token: mainSyncConfig.token,
          gistId: '',
          etag: null,
          lastRemoteUpdatedAt: 0,
        });
        setSocialCfgGistId('');
        setSocialCfgEtag(null);
        setHasCreatedProfile(false);
        lockProfileEditor();
        setFeedback('warn', SOCIAL_UI.gateway.gistMissing);
        return;
      }

      // Fallo de RED o del SERVICIO (GitHub limitando, por ejemplo): se rescata el perfil guardado aunque su ventana
      // haya expirado. Sin esto, la caché caducada equivalía a no tener perfil —y el editor se cerraba encima.
      if (isServiceUnavailable(error) || isOffline()) {
        const stale = await getCachedSocialProfile(socialCfgGistId, { allowExpired: true }).catch(() => null);
        if (stale) {
          applyCachedProfile(stale);
        }
      }
      reportFailure(error, SOCIAL_UI.status.loadProfileFailed);
    } finally {
      setHydratingProfile(false);
    }
  }, [
    authUser,
    // Las DOS reglas que aplica este callback, y no basta con la primera: `profileExists` mira
    // `hasCompletedGames` (estricta) y `mustCreate` mira `completedGamesRequirementMet` (indulgente cuando la
    // biblioteca no está en este dispositivo). Faltaba la segunda, que se deriva además de
    // `libraryPresentLocally`: abrir el espacio social antes de que llegara la biblioteca fijaba la vía
    // indulgente y ahí se quedaba, porque al llegar la biblioteca con juegos y ningún completado
    // `hasCompletedGames` seguía en `false` y el callback no se recreaba. El usuario sin completados dejaba de
    // ir al editor de perfil.
    hasCompletedGames,
    completedGamesRequirementMet,
    defaultSocialVisibility,
    hydrateProfileForm,
    lockProfileEditor,
    reportFailure,
    setFeedback,
    socialSpaceOpen,
    socialCfgEtag,
    socialCfgGistId,
    justSavedProfile,
    mainSyncConfig?.token,
    // Los setters del view-model: estables, pero llegan por parámetro y la regla los quiere escritos.
    setHasCreatedProfile,
    setMustCreateProfile,
    setSocialCfgEtag,
    setSocialCfgGistId,
  ]);

  useEffect(() => {
    // Al editor SOLO por perfil incompleto (`mustCreateProfile`), no por `profileEditorLocked`: ese incluye
    // `hasBlockingSocialIssue`, que lo enciende CUALQUIER error de nivel `err` de lo social. Un fallo de red al leer
    // un gist acababa mandando al usuario a "crea tu perfil", que es un diagnóstico falso: su perfil está bien y lo
    // que ha fallado es otra cosa. El bloqueo del feed no cambia —`profileEditorLocked` sigue frenando la
    // hidratación—, lo que se retira es el secuestro de la navegación.
    if (shouldRedirectToProfileEditor(mustCreateProfile, activePanel)) {
      void navigate('/social/profile');
    }
  }, [mustCreateProfile, activePanel, navigate]);

  useEffect(() => {
    void hydrateSocialProfile();
  }, [hydrateSocialProfile]);

  const saveProfile = useCallback(async () => {
    await ensureSyncConfigLoaded(); // C4: igual que en `hydrateSocialProfile`, el token social se descifra async
    const socialConfig = getSocialSyncConfig();
    if (!authUser || !socialConfig?.token || !socialCfgGistId) {
      setFeedback('err', SOCIAL_UI.status.invalidSaveContext);
      return;
    }

    // Un perfil solo es válido con nombre Y al menos un juego completado: así nadie se da de alta en el canal
    // social sin nada que compartir. Misma regla que aplican la hidratación y el gate del botón de Cuenta.
    if (!profileName.trim() || !hasCompletedGames) {
      setFeedback('warn', SOCIAL_UI.status.profileIncomplete);
      return;
    }

    try {
      setSavingProfile(true);
      // SIN FOTO EN LA CUENTA, `showPhoto` SE GUARDA EN FALSE. No se confía en que el efecto que apaga el estado haya
      // corrido ya: la hidratación del perfil llega por red y devuelve el `showPhoto: true` del gist, así que entre
      // esa respuesta y el apagado hay una ventana en la que un guardado rápido habría vuelto a escribir el "sí".
      // Aquí la decisión es de una sola línea y no depende de ningún orden. "Sin foto" incluye el avatar genérico de
      // Google: tener URL no es tener cara.
      const visibility = {
        ...profileForm.visibility,
        showPhoto: profileForm.visibility.showPhoto && Boolean(authUser.photoURL) && !ownPhotoIsGeneric,
      };
      const normalizedHiddenTabs = visibility.hiddenTabs;

      const profile = {
        // PRIVACIDAD: el nick es LO QUE ESCRIBE EL USUARIO, y nada más. Aquí había un respaldo a
        // `authUser.displayName || authUser.email` que publicaba su nombre real de Google —o su correo— como nombre
        // público en el gist y en el directorio. Era inalcanzable (la guarda de arriba corta con el nick vacío) pero
        // bastaba con relajar esa guarda para que se filtrara. Sin nick no hay perfil: es la regla, no un defecto.
        name: profileName.trim(),
        private: false,
        visibility,
        sharedLists: {},
        // Solo se publica la foto si el usuario la muestra Y es una foto de verdad (normalize la valida/descarta si no).
        ...(ownPublishablePhoto ? { photoURL: ownPublishablePhoto } : {}),
      };

      const currentGistResult = await readSocialGist(socialConfig.token, socialCfgGistId, null);
      const currentGistData = currentGistResult.data;

      // TODO EL CANAL SE CONSERVA y solo se cambia el perfil. Se copiaban a mano `activity` y `posts`, y el resto
      // —los avisos de lista (`moves`, `hiddenMoves`), el consentimiento— se caía: el saneado del gist rellena con
      // `[]` lo que falta, así que tus amigos dejaban de ver tus avisos hasta la siguiente reconciliación, que con
      // su sello fresco podía tardar 12 h (09-10-2026). Es la forma de las demás escrituras del canal.
      const writeResult = await writeSocialGist(socialConfig.token, socialCfgGistId, {
        ...currentGistData,
        profile,
        updatedAt: Date.now(),
      });

      // Ya NO se fuerza el gist a público. GitHub no permite cambiar la visibilidad, así que aquello CLONABA el
      // gist a un id nuevo y dejaba el original huérfano: es el origen de la deriva. Y era innecesario, porque un
      // gist secreto lo puede leer igualmente quien tenga su identificador («secret gists aren't private»).
      // El canal se queda con el id que ya tenía.
      const finalGistId = socialCfgGistId;
      const finalEtag = writeResult.etag || socialCfgEtag;

      await ensureProfileByEmail({
        user: authUser,
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
        githubToken: mainSyncConfig?.token || socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
        socialGistEtag: finalEtag,
        preferredName: profile.name,
        // Publica la foto en el doc público (la lee el directorio); '' la borra si el usuario desactiva la foto o si
        // lo que tiene es el avatar genérico de Google.
        photoURL: ownPublishablePhoto,
      });

      saveSocialSyncConfig({
        token: socialConfig.token,
        gistId: finalGistId,
        etag: finalEtag,
        lastRemoteUpdatedAt: Date.now(),
      });
      setSocialCfgGistId(finalGistId);
      setSocialCfgEtag(finalEtag);

      // PRIVACIDAD: propaga el nick recién guardado a mis docs de amistad ya existentes (que pudieron quedar con un
      // nombre antiguo/real). Best-effort: no bloquea el guardado del perfil.
      void healOwnFriendshipIdentity(authUser.uid, {
        name: profile.name,
        photo: ownPublishablePhoto,
        socialGistId: finalGistId,
        gamesGistId: mainSyncConfig?.gistId || '',
      });

      // Y A LA PAPELETA DE LOS PREMIOS, si la hay: con perfil social, el nombre de la papeleta ES el del perfil (no
      // se elige al votar), así que la clasificación no debe publicar uno que ya no usa. No gasta ninguna
      // oportunidad (ver `renameOwnBallot`). El módulo es de la sección de premios, que es perezosa: se trae solo
      // al guardar. Best-effort, como lo anterior.
      void import('../../model/repository/premios/premiosBallotRepository')
        .then(({ renameOwnBallot }) => renameOwnBallot(authUser.uid, profile.name))
        .catch(() => {
          /* sin papeleta, sin red o sin sesión: el perfil ya está guardado */
        });

      // Refrescar la caché del perfil con lo recién guardado: evita releer el gist al volver a social y mantiene
      // la caché coherente con la edición.
      void putCachedSocialProfile(finalGistId, {
        name: profile.name,
        hiddenTabs: normalizedHiddenTabs,
        hideReplayable,
        hideRetry,
        hideGameTime,
        // El MISMO valor que se acaba de escribir en el gist, no el del formulario: si la caché guardara el "sí"
        // que el gist ya no tiene, la siguiente apertura del hub hidrataría el ajuste con el dato viejo.
        showPhoto: visibility.showPhoto,
        profileExists: true,
        activity: currentGistData.activity,
      });

      setHasCreatedProfile(true);
      setMustCreateProfile(false);
      setJustSavedProfile(true);

      // Momento clave del usuario nuevo: acaba de completar su perfil, así que sus reseñas ANTERIORES al alta
      // (que nunca pasaron por `publishReviewActivity`) entran ahora al feed. Forzado: ignora sello y recuento.
      // Antes de `hydrateSocialDirectory` para que el feed ya se pinte con la actividad reconciliada.
      try {
        await reconcileReviewActivity({ games: games, force: true });
      } catch {
        /* best-effort: no puede tumbar el guardado del perfil; se reintenta en la próxima apertura. */
      }

      void navigate('/social');
      void hydrateSocialDirectory();
      setFeedback('ok', SOCIAL_UI.status.profileSaved);

      setTimeout(() => setJustSavedProfile(false), 1000);
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.saveProfileFailed);
    } finally {
      setSavingProfile(false);
    }
  }, [
    authUser,
    hasCompletedGames,
    // Memoizada sobre los cinco interruptores (`useSocialProfileForm`), así que su identidad solo cambia cuando
    // cambia uno de ellos. Es LO QUE SE ESCRIBE en el gist, y cubre el que faltaba: `hiddenTabs`,
    // `hideReplayable`, `hideRetry` y `hideGameTime` estaban enumerados sueltos, `showPhoto` no. Los tres de
    // abajo siguen porque además se leen sueltos al sembrar la caché del perfil.
    profileForm.visibility,
    hideReplayable,
    hideRetry,
    hideGameTime,
    hydrateSocialDirectory,
    navigate,
    profileName,
    games,
    reportFailure,
    setFeedback,
    socialCfgEtag,
    socialCfgGistId,
    // El guardado decide con ellos si publica la foto y si deja `showPhoto` activado: leerlos de un render anterior
    // escribiría en el gist una decisión que ya no es la vigente.
    ownPhotoIsGeneric,
    ownPublishablePhoto,
    // La configuración principal se hidrata de forma ASÍNCRONA (el token viaja cifrado), así que un render
    // temprano la ve a `null`. Sin estas dos dependencias el guardado se quedaba con esa foto: publicaba el
    // perfil con `gamesGistId: ''` —que `healOwnFriendshipIdentity` propagaba a TODOS mis docs de amistad, o sea
    // que dejaba a mis amigos sin mi lista de juegos— y cifraba en `privateConfig` un token que ya no era el
    // vigente. El repositorio ya no escribe ids vacíos, pero la foto correcta se consigue aquí.
    mainSyncConfig?.gistId,
    mainSyncConfig?.token,
    setHasCreatedProfile,
    setJustSavedProfile,
    setMustCreateProfile,
    setSocialCfgEtag,
    setSocialCfgGistId,
  ]);

  // Un doble clic no guarda dos veces: `ensureSyncConfigLoaded` se espera ANTES de marcar el guardado en curso, y en
  // ese hueco el botón aún no está deshabilitado (ver `useSingleFlight`).
  const handleSaveProfile = useSingleFlight(saveProfile);

  return { completedGames, hasCompletedGames, hydratingProfile, savingProfile, hydrateSocialProfile, handleSaveProfile };
}
