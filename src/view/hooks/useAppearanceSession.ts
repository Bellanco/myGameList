import { useEffect } from 'react';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import { setPreferenceUid } from '../../model/repository/preferenceStore';
import { hydrateAppearance } from './preferences';

/**
 * F1 — Enlaza la sesión de Google con la apariencia (paleta + claro/oscuro + caja + efectos + botón de Steam
 * Deck): al iniciar/restaurar sesión fija el uid y hidrata desde Firestore (`publicConfig/{uid}`); al cerrar
 * sesión solo limpia el uid (la apariencia sigue viviendo en local, por dispositivo). Se monta UNA vez cerca de
 * la raíz (App), como `useScoreScaleSession`.
 */
export function useAppearanceSession(): void {
  useEffect(() => {
    return subscribeSocialAuth((user) => {
      if (user?.uid) {
        setPreferenceUid(user.uid);
        void hydrateAppearance(user.uid);
      } else {
        setPreferenceUid(null);
      }
    });
  }, []);
}
