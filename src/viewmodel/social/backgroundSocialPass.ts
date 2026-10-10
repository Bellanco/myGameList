// LA PASADA SOCIAL DESDE LA APP PRINCIPAL (docs/plan-feed-sin-vacio.md, Fase 3).
//
// La «última vez activo» (`profiles.updatedAt`) y los movimientos de lista solo salían con el hub abierto, o de paso
// al guardar una reseña. Quien usaba la app a diario sin abrir el hub pasaba por inactivo a los 30 días y
// desaparecía del feed de sus amigos, y sus movimientos no llegaban a publicarse nunca. Esta pasada lo hace desde la
// app principal:
//
//   · al ARRANCAR y al VOLVER A LA PESTAÑA (con la app cerrada no corre nada: es una web);
//   · PUBLICA solo si hay cambios que la última pasada no vio, y con 8 h como mínimo entre pasadas (decisión del
//     usuario: GitHub recibe a lo sumo un GET y un PATCH cada 8 h, y solo si hay algo que subir);
//   · la RECENCIA se refresca como mucho una vez al día, como en el hub (`PROFILE_TOUCH_MIN_INTERVAL_MS`);
//   · NADA sin la aceptación legal vigente (`canPublishSocialInBackground`, Fase 2): ni la publicación ni la recencia.
//
// Sin red ni Firebase hasta saber que hay algo que hacer: lo normal es que no lo haya, y esto corre en cada apertura.
// Por eso todo lo pesado (el SDK, el repositorio del gist social) llega por `import()` y solo cuando toca.
import { useEffect, useRef } from 'react';
import { PROFILE_TOUCH_MIN_INTERVAL_MS } from '../../core/constants/socialActivity';
import { localActivityChanged } from '../../core/social/activityStamp';
import { runWhenIdle } from '../../core/utils/idle';
import { getLocalMeta, patchLocalMeta } from '../../model/repository/indexedDbRepository';
import { ensureSyncConfigLoaded, getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { getCurrentSocialAuthUser, hasStoredAuthSession } from '../../model/repository/firebaseGateway';
import { TAB_IDS, type TabData } from '../../model/types/game';
import type { LocalMeta } from '../../model/types/local';

/** Mínimo entre dos pasadas que publican (decisión del usuario, 10-10-2026). */
export const BACKGROUND_SOCIAL_PASS_MIN_INTERVAL_MS = 8 * 60 * 60 * 1000;

export type BackgroundSocialPassResult =
  | 'nada'
  | 'sin-listados'
  | 'sin-canal'
  | 'sin-sesion'
  | 'sin-aceptacion'
  | 'hecho'
  | 'fallo';

/** Lo que la pasada necesita de fuera, inyectable para probarla sin red. */
export interface BackgroundSocialPassDeps {
  getLocalMeta: () => Promise<LocalMeta | null>;
  patchLocalMeta: (patch: Partial<LocalMeta>) => Promise<void>;
  /** ¿Hay canal social (gist y token) en ESTE dispositivo? Quien nunca dio de alta lo social aquí no publica. */
  hasSocialChannel: () => Promise<boolean>;
  /** ¿Hay una sesión de Google guardada? Se mira sin cargar el SDK. */
  hasStoredSession: () => boolean;
  localActivityChanged: (games: TabData, meta: LocalMeta | null) => boolean;
  getUid: () => Promise<string | null>;
  canPublish: (uid: string) => Promise<boolean>;
  touchActivity: (uid: string) => Promise<void>;
  reconcile: (games: TabData) => Promise<unknown>;
}

const DEFAULT_DEPS: BackgroundSocialPassDeps = {
  getLocalMeta,
  patchLocalMeta,
  hasSocialChannel: async () => {
    await ensureSyncConfigLoaded(); // los tokens se descifran de forma asíncrona
    const config = getSocialSyncConfig();
    return Boolean(config?.gistId && config?.token);
  },
  hasStoredSession: hasStoredAuthSession,
  localActivityChanged,
  getUid: async () => (await getCurrentSocialAuthUser())?.uid || null,
  canPublish: async (uid) => (await import('../../model/repository/socialConsentGate')).canPublishSocialInBackground(uid),
  touchActivity: async (uid) => (await import('../../model/repository/firebaseRepository')).touchOwnProfileActivityThrottled(uid),
  reconcile: async (games) => (await import('../../model/repository/socialActivityReconcile')).reconcileReviewActivity({ games }),
};

/** La pasada en vuelo: el arranque y la vuelta a la pestaña pueden coincidir, y dos pasadas serían dos PATCH. */
let inFlight: Promise<BackgroundSocialPassResult> | null = null;

export function resetBackgroundSocialPassForTests(): void {
  inFlight = null;
}

function hasAnyGame(games: TabData): boolean {
  return TAB_IDS.some((tab) => (games[tab] || []).length > 0);
}

async function runPass(games: TabData, deps: BackgroundSocialPassDeps): Promise<BackgroundSocialPassResult> {
  // Listados sin cargar: no hay con qué comparar (y la reconciliación, sobre todo, no debe retirar nada).
  if (!hasAnyGame(games)) return 'sin-listados';

  // TODO lo que sigue hasta la sesión es local: lo normal es salir aquí sin haber tocado la red.
  const meta = await deps.getLocalMeta().catch(() => null);
  const now = Date.now();
  const touchDue = now - Number(meta?.profileTouchedAt || 0) >= PROFILE_TOUCH_MIN_INTERVAL_MS;
  const passDue = now - Number(meta?.backgroundSocialPassAt || 0) >= BACKGROUND_SOCIAL_PASS_MIN_INTERVAL_MS;
  const publishDue = passDue && deps.localActivityChanged(games, meta);
  if (!touchDue && !publishDue) return 'nada';

  if (!(await deps.hasSocialChannel())) return 'sin-canal';
  if (!deps.hasStoredSession()) return 'sin-sesion';

  // A partir de aquí ya hay algo que hacer, y sí se carga Firebase.
  const uid = await deps.getUid();
  if (!uid) return 'sin-sesion';
  if (!(await deps.canPublish(uid))) return 'sin-aceptacion';

  if (touchDue) await deps.touchActivity(uid);
  if (!publishDue) return 'hecho';

  try {
    await deps.reconcile(games);
  } catch {
    // Sin sellar: la próxima apertura lo vuelve a intentar.
    return 'fallo';
  }
  await deps.patchLocalMeta({ backgroundSocialPassAt: Date.now() }).catch(() => {});
  return 'hecho';
}

/** Una pasada (ver la cabecera). Nunca lanza: es trabajo de fondo y su fallo no se enseña. */
export function runBackgroundSocialPass(
  games: TabData,
  deps: BackgroundSocialPassDeps = DEFAULT_DEPS,
): Promise<BackgroundSocialPassResult> {
  if (inFlight) return inFlight;
  const run = runPass(games, deps)
    .catch((): BackgroundSocialPassResult => 'fallo')
    .finally(() => {
      if (inFlight === run) inFlight = null;
    });
  inFlight = run;
  return run;
}

/**
 * La pasada, montada desde `IdleWork`: cuando el navegador queda ocioso tras arrancar, y cada vez que la pestaña
 * vuelve a estar visible. Los listados van en una ref: la pasada lee siempre los vivos, pero cambiarlos no la dispara
 * (eso sería un PATCH por cada juego movido, justo lo que el intervalo de 8 h evita). Solo espera a que haya juegos.
 */
export function useBackgroundSocialPass(games: TabData): void {
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const ready = hasAnyGame(games);

  useEffect(() => {
    if (!ready) return undefined;
    const run = () => {
      void runBackgroundSocialPass(gamesRef.current);
    };
    const cancelIdle = runWhenIdle(run);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelIdle();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready]);
}
