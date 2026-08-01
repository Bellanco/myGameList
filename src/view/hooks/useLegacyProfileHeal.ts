import { useEffect } from 'react';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';

/**
 * Dispara el auto-saneado del perfil legacy al restaurar/iniciar sesión de Google.
 *
 * Se monta UNA vez en App. Todo el trabajo real vive en `firebaseProfileHealRepository`, que se carga con
 * `import()` dinámico para no arrastrar el SDK de Firestore al grafo del arranque (mismo criterio que
 * `firebaseGateway`): la app funciona sin Firebase y esto no puede competir con el primer render.
 *
 * Silencioso por diseño: el usuario no ha pedido esta migración, no tiene que decidir nada y no hay nada que
 * pueda hacer si falla. En el caso normal (perfil ya limpio) es una sola lectura, además cacheada.
 */

// uids ya procesados en esta carga de página: el saneado es idempotente, pero no hace falta repetir la lectura
// cada vez que `onAuthStateChanged` reemite (refresco de token, cambio de pestaña).
const attemptedUids = new Set<string>();

export function useLegacyProfileHeal(): void {
  useEffect(() => {
    return subscribeSocialAuth((user) => {
      const uid = String(user?.uid || '');
      if (!uid || attemptedUids.has(uid)) {
        return;
      }
      attemptedUids.add(uid);

      void import('../../model/repository/firebaseProfileHealRepository')
        .then((module) => module.healOwnLegacyProfile(uid))
        .then((healResult) => {
          // Si no se pudo completar (offline, reglas, fallo del respaldo), se reintenta en el próximo arranque:
          // el documento sigue intacto, así que reintentar es seguro.
          if (healResult.status === 'deferred') {
            attemptedUids.delete(uid);
          }
        })
        .catch(() => {
          attemptedUids.delete(uid);
        });
    });
  }, []);
}
