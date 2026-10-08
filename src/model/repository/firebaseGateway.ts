// Frontera perezosa hacia Firebase. Este módulo NO importa 'firebase/*' de forma estática:
// solo carga la fachada `firebaseRepository` (y con ella todo el SDK) mediante import() dinámico.
//
// Motivo (auditoría de optimización, #1): el chunk de Firebase (~172 KB gzip) entraba en el grafo
// estático del entry y se descargaba en `modulepreload` en cada arranque, compitiendo con el render
// inicial. La app funciona con listas locales (IndexedDB) sin Firebase; este se necesita solo para
// restaurar la sesión de Google, sincronizar y publicar en social. Enrutando a los consumidores
// EAGER (main, error boundary, sesión, preferencias, sync VM) por aquí, el SDK sale del preload y
// se carga en segundo plano tras el montaje, sin bloquear la interactividad.
//
// Los tipos se importan con `import type` (se borran en build → no crean arista de runtime), así que
// no se pierde type-safety. Todas las funciones expuestas son las que consume el código eager y ya
// eran async (telemetría fire-and-forget, consultas de auth, hidratación post-login) salvo la
// suscripción de auth, que replica el contrato síncrono-teardown de `onSocialAuthChanged`.
import type { FirebaseServices, SocialAuthUser, SocialProfileReference } from './firebaseClient';
import type { FirestorePrivateConfig, FirestorePublicConfig } from '../types/firestore';
import { AUTH_SIGNED_OUT_AT_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';

type FacadeModule = typeof import('./firebaseRepository');

let facadePromise: Promise<FacadeModule> | null = null;

/**
 * Suscriptores de sesión que esperan SIN haber cargado el SDK (ver `subscribeSocialAuth`). En cuanto alguien
 * carga la fachada por cualquier otro motivo —pulsar «iniciar sesión», abrir el hub—, se enganchan a ella.
 */
const pendingAuthSubscribers = new Set<(facade: FacadeModule) => void>();

/** Carga (una vez) la fachada de Firebase. El propio SDK queda en un chunk perezoso. */
function loadFacade(): Promise<FacadeModule> {
  if (!facadePromise) {
    // El RECHAZO no se cachea: si el chunk no se pudo bajar (sin red, o un despliegue que rotó los hashes con la
    // pestaña abierta), la siguiente llamada vuelve a intentarlo en vez de heredar el fallo el resto de la sesión.
    facadePromise = import('./firebaseRepository')
      .then((module) => {
        // Los que esperaban sin sesión ya tienen a qué engancharse.
        const waiting = [...pendingAuthSubscribers];
        pendingAuthSubscribers.clear();
        // Uno a uno y a salvo: si engancharse falla, ese suscriptor se queda sin sesión, pero la carga sigue. Sin
        // esto, el fallo rechazaba la fachada ENTERA y con ella lo que la había pedido (la puerta legal del hub,
        // un inicio de sesión).
        waiting.forEach((attach) => {
          try {
            attach(module);
          } catch {
            // Nada que hacer: el resto de la carga no depende de este suscriptor.
          }
        });
        return module;
      })
      .catch((error: unknown) => {
        facadePromise = null;
        throw error;
      });
  }
  return facadePromise;
}

/**
 * PREFIJO CON EL QUE FIREBASE AUTH GUARDA LA SESIÓN en `localStorage` (persistencia `browserLocalPersistence`,
 * la que fija `firebaseClient`). Su presencia es la señal, SÍNCRONA y sin descargar nada, de que este navegador
 * ha iniciado sesión alguna vez y no la ha cerrado.
 */
const FIREBASE_AUTH_STORAGE_PREFIX = 'firebase:authUser:';

/**
 * ¿Hay sesión de Google guardada en este navegador?
 *
 * POR QUÉ MIRAMOS UNA CLAVE QUE NO ES NUESTRA. El SDK de Firebase son ~65 kB comprimidos que se descargaban en el
 * arranque de TODO el mundo, también de quien solo usa sus listas y nunca ha iniciado sesión, porque la app se
 * suscribe a los cambios de sesión nada más montarse. Para saltarnos esa descarga hace falta responder «¿hay
 * sesión?» ANTES de cargar nada, y el único que lo sabe sin red es el propio almacenamiento del SDK.
 *
 * Leer su clave nos ata a un detalle interno suyo, sí, y a cambio no hace falta ninguna migración: los usuarios
 * que YA tienen la sesión abierta siguen funcionando el día del despliegue, que es lo que no conseguiría una
 * marca propia escrita a partir de ahora. Si Firebase cambiara el prefijo, lo peor que pasa es que volvemos a
 * cargarlo siempre —el comportamiento de antes—, nunca que alguien pierda la sesión.
 *
 * Ante cualquier duda (sin `localStorage`, acceso denegado) se responde que SÍ: cargar de más es un coste;
 * cargar de menos sería una regresión.
 */
export function hasStoredAuthSession(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(FIREBASE_AUTH_STORAGE_PREFIX)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * LA MARCA DE «SALIR»: cuándo se pulsó por última vez, en cualquier pestaña. Distingue un cierre de sesión a
 * propósito de una sesión que se pierde sola. La escribe la fachada al cerrar sesión y la leen las dos: vive aquí, y
 * no en un módulo propio, porque uno compartido entre el arranque y la fachada sería un fichero más en cada visita.
 */
const SIGNED_OUT_WINDOW_MS = 30_000;

export function markSignedOut(): void {
  try {
    localStorage.setItem(AUTH_SIGNED_OUT_AT_KEY, String(Date.now()));
  } catch {
    // Sin almacenamiento, la salida se tomaría por una pérdida: se espera la gracia y se registra de más.
  }
}

export function signedOutRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(AUTH_SIGNED_OUT_AT_KEY) || 0) < SIGNED_OUT_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * ¿Tiene este dispositivo un espacio social? Se lee la clave tal cual, sin el repositorio de la configuración, para
 * no traer su descifrado al arranque: aquí solo importa si hay un gist apuntado.
 */
function hasLocalSocialSpace(): boolean {
  try {
    const raw = localStorage.getItem(SOCIAL_GIST_CFG_KEY);
    if (!raw) return false;
    const gistId = (JSON.parse(raw) as { gistId?: unknown } | null)?.gistId;
    return typeof gistId === 'string' && gistId.trim() !== '';
  } catch {
    return false;
  }
}

/**
 * ¿HAY QUE CARGAR FIREBASE PARA RESTAURAR LA SESIÓN? Con la clave de la sesión en `localStorage`, sí. Y también con
 * un espacio social en el dispositivo aunque la clave falte: hasta el 08-10-2026 Auth arrancaba prefiriendo
 * IndexedDB y en cada arranque pasaba por ahí la sesión (ver `startAuth` en `firebaseClient`), así que una pestaña
 * que moría a mitad dejaba la sesión SOLO en IndexedDB. Sin mirar esto, esa persona no volvía a cargar el SDK y la
 * aplicación le pedía identificarse con la sesión intacta. Al cargarlo, el SDK la encuentra y la devuelve a
 * `localStorage`. Quien tiene espacio y de verdad cerró sesión paga la descarga, y es justo quien va a volver a entrar.
 */
export function mayRestoreAuthSession(): boolean {
  return hasStoredAuthSession() || hasLocalSocialSpace();
}

/** ¿Ya se ha cargado (o se está cargando) la fachada? Entonces no hay nada que ahorrar. */
export function isFirebaseFacadeLoaded(): boolean {
  return facadePromise !== null;
}

/**
 * Envoltorio de los caminos BEST-EFFORT (telemetría): ni la carga del chunk ni el envío pueden propagar el fallo,
 * porque sus llamantes invocan con `void` y no hay nadie detrás para capturarlo.
 *
 * Sin esto, un chunk que no baja se convierte en un `unhandledrejection`, y el gancho global de `main.tsx` lo
 * atiende con `reportHandledError` —que vuelve por aquí y vuelve a rechazar—, realimentando el fallo. En los tests
 * pasaba la otra cara: la carga que `void trackAnalyticsEvent(...)` deja en vuelo al acabar el test rechaza cuando
 * el entorno ya está desmontado, y esos rechazos tumbaban la suite en CI con todos los tests en verde.
 */
async function bestEffort(send: (facade: FacadeModule) => Promise<void>): Promise<void> {
  try {
    await send(await loadFacade());
  } catch {
    // Telemetría: si no se puede informar, no se informa.
  }
}

// --- Arranque / servicios ---
export async function initializeFirebaseServices(): Promise<FirebaseServices | null> {
  const m = await loadFacade();
  return m.initializeFirebaseServices();
}

/**
 * L2 — activa GA4 tras aceptar el aviso, sin recargar (los servicios ya están cacheados sin analítica). Best-effort
 * como el resto de la analítica: sus dos llamantes (banner y hook de consentimiento) invocan con `void`.
 */
export async function enableAnalyticsAfterConsent(): Promise<void> {
  await bestEffort((m) => m.enableAnalyticsAfterConsent());
}

// --- Telemetría (best-effort, no bloqueante: nunca rechaza, ver `bestEffort`) ---
export async function reportHandledError(error: unknown, fatal = false, context = ''): Promise<void> {
  await bestEffort((m) => m.reportHandledError(error, fatal, context));
}

export async function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): Promise<void> {
  await bestEffort((m) => m.trackAnalyticsEvent(eventName, params));
}

export async function setAnalyticsUser(uid: string): Promise<void> {
  await bestEffort((m) => m.setAnalyticsUser(uid));
}

export async function clearAnalyticsUser(): Promise<void> {
  await bestEffort((m) => m.clearAnalyticsUser());
}

// --- Auth ---
export async function getCurrentSocialAuthUser(): Promise<SocialAuthUser | null> {
  const m = await loadFacade();
  return m.getCurrentSocialAuthUser();
}

/**
 * ¿La sesión actual manda? (custom claim `admin`). Ver `firebaseAuthRepository.readAdminClaim`.
 *
 * Pasa por la fachada perezosa como el resto, así que CARGA EL SDK: llámese solo cuando ya se sabe que hay
 * sesión —en cuyo caso la fachada ya está cargada— o desde una pantalla que de todas formas lo necesita (el
 * panel). Preguntarlo a un visitante sin sesión traería 172 kB para que la respuesta sea `false`.
 */
export async function readAdminClaim(forceRefresh = false): Promise<boolean> {
  const m = await loadFacade();
  return m.readAdminClaim(forceRefresh);
}

export async function signInWithGoogle(options?: { onAbandoned?: () => void }): Promise<SocialAuthUser> {
  const m = await loadFacade();
  return m.signInWithGoogle(options);
}

/**
 * Cuánto se espera antes de dar por perdida una sesión que se va sin que nadie haya pulsado «salir». Es lo que
 * tarda en volver si se ha ido por un parpadeo —otra pestaña arrancando, que comprueba la cuenta por red, más la
 * carga del marco de Google en Safari—, con margen.
 */
const SESSION_LOSS_GRACE_MS = 8000;

/**
 * UNA SESIÓN QUE SE VA SOLA NO SE DA POR PERDIDA AL INSTANTE.
 *
 * Cada «nadie» que llega aquí tiene consecuencias que se ven y se guardan: el tema vuelve al de por defecto (y se
 * apunta el bloqueo), la escala de notas vuelve a estrellas, sale «vuelve a entrar» y Ajustes › Diseño te echa.
 * Por un parpadeo de la sesión, todo eso pasaba y se quedaba. Así que, si había usuario y nadie ha pulsado «salir»
 * (en esta pestaña o en otra, ver `markSignedOut`), el «nadie» espera `SESSION_LOSS_GRACE_MS`; si vuelve el mismo
 * usuario, no ha pasado nada y no se avisa a nadie. Un «salir» de verdad sigue llegando al momento.
 */
function withSessionGrace(callback: (user: SocialAuthUser | null) => void): {
  emit: (user: SocialAuthUser | null) => void;
  stop: () => void;
} {
  let shownUid: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const emit = (user: SocialAuthUser | null) => {
    if (user) {
      const back = timer !== null && user.uid === shownUid;
      clear();
      if (back) return;
      shownUid = user.uid;
      callback(user);
      return;
    }
    if (!shownUid || signedOutRecently()) {
      clear();
      shownUid = null;
      callback(null);
      return;
    }
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      shownUid = null;
      callback(null);
    }, SESSION_LOSS_GRACE_MS);
  };
  return { emit, stop: clear };
}

/**
 * Suscripción a los cambios de sesión de Google, cargando la fachada de forma perezosa. Conserva el
 * contrato de `onSocialAuthChanged`: devuelve una función de teardown SÍNCRONA que cancela la carga
 * en curso o desuscribe si ya se resolvió.
 *
 * SI LA FACHADA NO SE PUEDE CARGAR, NO SE DICE «NADIE». Con sesión guardada, la respuesta honesta a un chunk que no
 * baja (sin red, o un despliegue que rotó los hashes) es «aún no lo sé»: emitir `null` desconectaba lo social
 * —tema incluido— de alguien que seguía teniendo su sesión. Se calla y lo vuelve a intentar cuando vuelve la red o
 * la pestaña vuelve a estar a la vista.
 */
export function subscribeSocialAuth(callback: (user: SocialAuthUser | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  const grace = withSessionGrace(callback);

  const attach = (m: FacadeModule): void => {
    if (cancelled) return;
    unsubscribe = m.onSocialAuthChanged(grace.emit);
  };

  // SIN SESIÓN QUE RESTAURAR NO SE DESCARGA EL SDK. Se responde «no hay sesión», que es la verdad, y se deja
  // apuntado que en cuanto alguien cargue la fachada —el botón de iniciar sesión, el hub social, el panel— hay que
  // engancharse a ella. Así quien solo usa sus listas no paga nunca esos kilobytes, y quien inicia sesión no nota
  // ninguna diferencia: el propio flujo de login carga la fachada y este suscriptor entra con él.
  if (!mayRestoreAuthSession() && !isFirebaseFacadeLoaded()) {
    pendingAuthSubscribers.add(attach);
    // En microtarea, para conservar el contrato asíncrono de siempre (nadie espera un callback síncrono aquí).
    void Promise.resolve().then(() => {
      if (!cancelled) grace.emit(null);
    });
    return () => {
      cancelled = true;
      grace.stop();
      pendingAuthSubscribers.delete(attach);
      if (unsubscribe) unsubscribe();
    };
  }

  let stopRetrying = () => {};
  const tryLoad = (): void => {
    void loadFacade()
      .then(attach)
      .catch(() => {
        if (cancelled) return;
        const retry = () => {
          if (document.visibilityState !== 'visible') return;
          stopRetrying();
          tryLoad();
        };
        window.addEventListener('online', retry);
        document.addEventListener('visibilitychange', retry);
        stopRetrying = () => {
          window.removeEventListener('online', retry);
          document.removeEventListener('visibilitychange', retry);
          stopRetrying = () => {};
        };
      });
  };
  tryLoad();
  return () => {
    cancelled = true;
    grace.stop();
    stopRetrying();
    if (unsubscribe) unsubscribe();
  };
}

// --- Perfil / configuración ---
/** L1 — perfil propio por uid (con fallback legacy por email dentro de la fachada). */
export async function resolveOwnProfile(user: { uid: string; email?: string }): Promise<SocialProfileReference | null> {
  const m = await loadFacade();
  return m.resolveOwnProfile(user);
}

export async function resolveStableProfileId(uid: string): Promise<string> {
  const m = await loadFacade();
  return m.resolveStableProfileId(uid);
}

export async function recoverGithubToken(uid: string): Promise<string | null> {
  const m = await loadFacade();
  return m.recoverGithubToken(uid);
}

export async function getPrivateConfig(uid: string): Promise<FirestorePrivateConfig | null> {
  const m = await loadFacade();
  return m.getPrivateConfig(uid);
}

export async function setPrivateConfig(uid: string, config: Partial<FirestorePrivateConfig>): Promise<void> {
  const m = await loadFacade();
  return m.setPrivateConfig(uid, config);
}

export async function getPublicConfig(uid: string): Promise<FirestorePublicConfig | null> {
  const m = await loadFacade();
  return m.getPublicConfig(uid);
}

export async function setPublicConfig(uid: string, config: Partial<FirestorePublicConfig>): Promise<void> {
  const m = await loadFacade();
  return m.setPublicConfig(uid, config);
}
