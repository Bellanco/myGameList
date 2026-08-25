// EFECTO de la decisión de publicar reseña: cargar el repositorio del canal social y llamar a lo que toque.
//
// La DECISIÓN (qué hacer) es pura y vive en `core/social/reviewPublication`. Aquí está lo que no puede ser puro:
// el import dinámico y el tratamiento del fallo.
//
// POR QUÉ NO ESTÁ EN `App.tsx`, que es de donde sale. Dos motivos, y el primero es una regla del proyecto:
//
//  1. `.github/instructions/view.instructions.md` lo prohíbe: «Components are presentational … **Do not import
//     repositories** here». `App` hacía `import('./model/repository/socialPublishRepository')` dos veces y
//     escribía en IndexedDB para marcar el reintento. Eso es trabajo de esta capa.
//  2. No había forma de probarlo. Medida la cobertura real de los e2e sobre `App.tsx`, el recorrido interactivo
//     completo aportaba DOS sentencias sobre el simple arranque: los manejadores no se ejecutan. Este bloque
//     —justo donde ya se colocó el bug del id— quedaba sin una sola prueba. Sacado aquí, se comprueba con el
//     repositorio simulado.

import { patchLocalMeta } from '../model/repository/indexedDbRepository';
import type { ReviewPublication } from '../core/social/reviewPublication';

/**
 * Marca que una publicación de actividad social se ha perdido, para que la reconciliación del hub la recupere.
 *
 * Se escribe directamente contra `indexedDbRepository` y NO vía `socialActivityReconcile` porque el fallo que se
 * está tratando puede ser precisamente el del import dinámico de ese módulo: pedirle ayuda al módulo que no ha
 * cargado no funcionaría.
 */
async function marcarPendiente(): Promise<void> {
  try {
    await patchLocalMeta({ pendingSocialActivity: true });
  } catch {
    /* best-effort: no puede romper el guardado del juego. */
  }
}

/**
 * Lleva a cabo la decisión sobre el canal social. No lanza nunca: un fallo aquí no puede tumbar el guardado de un
 * juego, que ya está hecho y persistido cuando esto se llama.
 *
 * `onDeferred` se invoca SOLO si la publicación no llegó y queda pendiente de reconciliación. La vista decide qué
 * contarle al usuario; aquí no se sabe nada de avisos.
 */
export async function applyReviewPublication(input: {
  /** Id REAL del juego guardado (lo devuelve `saveDraft`; nunca uno predicho). */
  id: number;
  publication: ReviewPublication;
  onDeferred: () => void;
}): Promise<void> {
  if (input.publication.kind === 'none') {
    return;
  }

  try {
    // Perezoso a propósito: publicar es un camino que la mayoría de guardados no toma, y este módulo arrastra el
    // canal social entero (gist + Firebase). No debe pesar en el guardado de un juego sin reseña.
    const repositorio = await import('../model/repository/socialPublishRepository');

    if (input.publication.kind === 'unpublish') {
      await repositorio.unpublishReviewActivity({ id: input.id });
      return;
    }

    await repositorio.publishReviewActivity({
      id: input.id,
      // audit-allow: `publishReviewActivity` convierte el texto a snippet y publica solo el rating redondeado.
      ...input.publication.payload,
    });
  } catch {
    // El fallo puede ser del propio import dinámico (index.html cacheado tras un despliegue, red intermitente) o
    // de GitHub (403 por rate-limit, 5xx). En ambos casos la publicación se perdía sin rastro ni reintento.
    await marcarPendiente();
    input.onDeferred();
  }
}
