// F2 — preferencia de escala de puntuación (estrellas 0–5 vs nota 0–100), guardada en Firestore `publicConfig/{uid}`
// (owner-only). Es una preferencia de PRESENTACIÓN del dueño: al vivir por-usuario en la nube, le sigue entre
// dispositivos. Solo está disponible con sesión de Google; sin ella, se queda en el valor por defecto (estrellas).
//
// Store reactivo en memoria (pub/sub) para que la UI reaccione sin prop-drilling (ver hook `useScoreScale`). La
// lectura de Firestore es ASÍNCRONA: se hidrata al iniciar sesión; hasta entonces se muestran estrellas (sin flash).
import { DEFAULT_SCORE_SCALE, type ScoreScale } from '../../core/utils/scoreScale';
import { getPublicConfig, setPublicConfig } from './firebaseGateway';
import { scoreScaleKey } from '../../core/constants/storageKeys';

let _scale: ScoreScale = DEFAULT_SCORE_SCALE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function setLocal(scale: ScoreScale): void {
  if (scale === _scale) return;
  _scale = scale;
  emit();
}

/** Valor actual (síncrono). Fuente para `useSyncExternalStore`. */
export function getScoreScale(): ScoreScale {
  return _scale;
}

/** Suscribe un listener a los cambios de escala; devuelve la función para desuscribir. */
export function subscribeScoreScale(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * COPIA EN ESTE NAVEGADOR, por usuario. La nube manda, pero si no responde (Firestore sin cuota, sin red) quien usa
 * la nota 0–100 volvía a ver estrellas en sus listas: lo único de Firestore que ensuciaba la pantalla principal
 * (docs/plan-degradacion-servicios.md, fase 5). Con la copia, se pinta lo último que se supo.
 */
function readStoredScale(uid: string): ScoreScale | null {
  try {
    const raw = localStorage.getItem(scoreScaleKey(uid));
    return raw === 'grade' || raw === 'stars' ? raw : null;
  } catch {
    return null;
  }
}

function storeScale(uid: string, scale: ScoreScale): void {
  try {
    localStorage.setItem(scoreScaleKey(uid), scale);
  } catch {
    // best-effort
  }
}

/** Hidrata la escala al iniciar sesión: primero la copia local (sin parpadeo) y después la de Firestore, si responde. */
export async function hydrateScoreScale(uid: string): Promise<void> {
  const stored = readStoredScale(uid);
  if (stored) setLocal(stored);
  try {
    const cfg = await getPublicConfig(uid);
    const scale = cfg?.scoreScale === 'grade' ? 'grade' : DEFAULT_SCORE_SCALE;
    setLocal(scale);
    storeScale(uid, scale);
  } catch {
    // permission-denied / Firebase ausente / sin cuota → se conserva la copia local, o estrellas si no la hay.
  }
}

/**
 * Cambia la escala y la persiste (requiere uid). Local de inmediato (optimista) y en la nube best-effort: si
 * Firestore no atiende, la preferencia sigue valiendo en este navegador y se subirá la próxima vez que se cambie.
 */
export async function persistScoreScale(uid: string, scale: ScoreScale): Promise<void> {
  setLocal(scale);
  storeScale(uid, scale);
  await setPublicConfig(uid, { scoreScale: scale }).catch(() => {});
}

/** Al cerrar sesión: vuelve a estrellas (no hay preferencia sin cuenta asociada). */
export function resetScoreScale(): void {
  setLocal(DEFAULT_SCORE_SCALE);
}
