import { useEffect } from 'react';
import { subscribeSocialAuth } from '../../model/repository/firebaseGateway';

/**
 * Dispara el auto-saneado del perfil al restaurar/iniciar sesión de Google: purga de restos legacy, identidad
 * pseudónima que nunca se estableció y marca de esquema atrasada (las tres cosas que el panel de administración ve
 * pero no puede arreglar; ver `firebaseProfileHealRepository`).
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

// Intentos diferidos por uid en esta carga de página. Reintentar es seguro (el documento queda intacto), pero
// hacerlo sin tope convierte un fallo persistente —reglas denegando, offline prolongado— en un bucle callado que
// repite la misma lectura en cada reemisión de auth. Al tercero se para y se dice en voz alta: eso es la diferencia
// entre «se arreglará solo» y «esto está atascado», que antes no se podía distinguir desde fuera.
const deferralsByUid = new Map<string, number>();
const MAX_DEFERRED_ATTEMPTS = 3;

export function useLegacyProfileHeal(): void {
  useEffect(() => {
    return subscribeSocialAuth((user) => {
      const uid = String(user?.uid || '');
      if (!uid || attemptedUids.has(uid)) {
        return;
      }
      attemptedUids.add(uid);

      const retryUnlessExhausted = (why: string) => {
        const attempts = (deferralsByUid.get(uid) || 0) + 1;
        deferralsByUid.set(uid, attempts);
        if (attempts < MAX_DEFERRED_ATTEMPTS) {
          attemptedUids.delete(uid);
          return;
        }
        console.warn(
          `[saneado] perfil sin sanear tras ${attempts} intentos (${why}). Se deja para el próximo arranque de la app.`,
        );
      };

      void import('../../model/repository/firebaseProfileHealRepository')
        .then((module) => module.healOwnLegacyProfile(uid))
        .then((healResult) => {
          // Si no se pudo completar (offline, reglas, fallo del respaldo), se reintenta: el documento sigue intacto.
          // El repositorio ya ha dejado la traza del paso concreto en consola y telemetría.
          if (healResult.status === 'deferred') {
            retryUnlessExhausted(healResult.deferredAt || 'motivo desconocido');
            return;
          }
          deferralsByUid.delete(uid);
        })
        // Fallo al CARGAR el módulo (chunk que no baja): no ha corrido nada, así que aquí no hay paso que reportar.
        .catch((error) => {
          retryUnlessExhausted(error instanceof Error ? error.message : 'módulo no disponible');
        });
    });
  }, []);
}
