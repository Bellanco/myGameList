// F2 — preferencia de escala de puntuación (estrellas 0–5 vs nota 0–100), guardada en Firestore `publicConfig/{uid}`
// (owner-only). Es una preferencia de PRESENTACIÓN del dueño: al vivir por-usuario en la nube, le sigue entre
// dispositivos. Solo está disponible con sesión de Google; sin ella, se queda en el valor por defecto (estrellas).
//
// Store reactivo en memoria (pub/sub) para que la UI reaccione sin prop-drilling (ver hook `useScoreScale`). La
// lectura de Firestore es ASÍNCRONA: se hidrata al iniciar sesión; hasta entonces se muestran estrellas (sin flash).
import { DEFAULT_SCORE_SCALE, type ScoreScale } from '../../core/utils/scoreScale';
import { getPublicConfig, setPublicConfig } from './firebaseGateway';

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

/** Hidrata la escala desde Firestore al iniciar sesión. Best-effort: si falla (reglas/offline), se queda en estrellas. */
export async function hydrateScoreScale(uid: string): Promise<void> {
  try {
    const cfg = await getPublicConfig(uid);
    setLocal(cfg?.scoreScale === 'grade' ? 'grade' : DEFAULT_SCORE_SCALE);
  } catch {
    // permission-denied / Firebase ausente → se conserva el valor por defecto (estrellas).
  }
}

/** Cambia la escala y la persiste en Firestore (requiere uid). Actualiza el local de inmediato (optimista). */
export async function persistScoreScale(uid: string, scale: ScoreScale): Promise<void> {
  setLocal(scale);
  await setPublicConfig(uid, { scoreScale: scale });
}

/** Al cerrar sesión: vuelve a estrellas (no hay preferencia sin cuenta asociada). */
export function resetScoreScale(): void {
  setLocal(DEFAULT_SCORE_SCALE);
}
