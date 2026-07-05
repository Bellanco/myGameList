import { useSyncExternalStore } from 'react';
import { getScoreScale, subscribeScoreScale } from '../../model/repository/scorePreferenceRepository';
import type { ScoreScale } from '../../core/utils/scoreScale';

/**
 * Escala de puntuación actual (F2), reactiva: 'stars' (0–5, defecto) o 'grade' (aro 0–100). La fuente vive en el
 * store `scorePreferenceRepository`, que se hidrata desde Firestore al iniciar sesión de Google. El cambio se hace
 * desde Ajustes (necesita el uid); este hook es solo de LECTURA para pintar según la escala.
 */
export function useScoreScale(): ScoreScale {
  return useSyncExternalStore(subscribeScoreScale, getScoreScale, getScoreScale);
}
