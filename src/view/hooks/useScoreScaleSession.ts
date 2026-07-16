import { useEffect, useState } from 'react';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';
import { hydrateScoreScale, resetScoreScale } from '../../model/repository/scorePreferenceRepository';

/**
 * Enlaza la sesión de Google con la preferencia de escala (F2): al restaurar/iniciar sesión hidrata la escala
 * desde Firestore (`publicConfig/{uid}`); al cerrar sesión vuelve a estrellas. Devuelve el `uid` actual (o null),
 * que Ajustes usa para gatear la opción (candado si no hay sesión) y para persistir el cambio.
 *
 * Se monta UNA vez cerca de la raíz (App) para que la escala esté disponible en toda la app, no solo en el hub social.
 *
 * Devuelve `ready` (si la sesión ya se resolvió) además del `uid`: la pestaña/pantalla "Cuenta" lo usa para no
 * redirigir a un usuario logueado durante el breve instante inicial en que el uid aún es null (auth sin resolver).
 */
export function useScoreScaleSession(): { uid: string | null; ready: boolean } {
  const [state, setState] = useState<{ uid: string | null; ready: boolean }>({ uid: null, ready: false });

  useEffect(() => {
    return subscribeSocialAuth((user) => {
      setState({ uid: user?.uid ?? null, ready: true });
      if (user?.uid) {
        void hydrateScoreScale(user.uid);
      } else {
        resetScoreScale();
      }
    });
  }, []);

  return state;
}
