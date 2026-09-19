import { useCallback } from 'react';
import { coverUrl } from '../../../core/utils/coverUrl';
import { sabemosQueNoTiene } from '../../../core/utils/coverMemory';
import { useCovers } from '../../hooks/useCovers';
import { useIsAdmin } from '../../hooks/useIsAdmin';

/**
 * LA CARÁTULA DE FONDO DE UNA RESEÑA. Devuelve la URL con la que se pinta la franja recortada que cruza la
 * tarjeta —el mismo gesto que el renglón del listado de juegos (`_table.scss`, «LA CARÁTULA EN EL RENGLÓN»)— o
 * `null` cuando no toca pedir ninguna.
 *
 * Vive aparte porque lo usan TRES piezas que no comparten padre: la lista de reseñas de un perfil, el detalle de
 * una reseña y el bloque de relacionadas del pie. Escribir la misma cuenta tres veces es como acaban divergiendo.
 *
 * QUÉ DECIDE QUE HAYA IMAGEN, en este orden:
 *  1. La PREFERENCIA de quien mira, que viene apagada de fábrica: encenderla es lo que autoriza a que el
 *     servidor pregunte por títulos a IGDB, y sin ella aquí no sale ni una petición.
 *  2. `allowed`, que es la política del sitio donde se pinta. En TUS reseñas es que sí y manda solo tu
 *     preferencia. En las de otra persona lo pone quien monta la pantalla, y hoy es mithril: resolver el
 *     catálogo de alguien que no eres tú es el gasto que menos se puede acotar del servicio, así que se concede
 *     al rango que paga los privilegios. Es la MISMA regla que ya siguen su tabla de juegos
 *     (`SocialProfileDetailScreen`) y la franja ancha del renglón (`GameTable`).
 *  3. Que de ese título no conste ya que no tiene carátula (`sabemosQueNoTiene`), para no volver a preguntar.
 *
 * El tamaño es el `ancho` del renglón por lo mismo que allí: la franja es apaisada y recorta una banda de una
 * imagen vertical, así que la pequeña llega estirada casi seis veces y lo que queda es una mancha.
 */
export function useReviewCover(allowed = true): (name: string, platforms?: readonly string[]) => string | null {
  const { covers } = useCovers();
  // El modo ampliado (DLC, packs y mods) tiene su propio espacio de caché: se pide con la misma clave con la que
  // ese navegador ya haya pedido esta carátula en el listado, o la respuesta no se reaprovecha.
  const ampliado = useIsAdmin();
  const permitido = covers && allowed;

  return useCallback((name: string, platforms: readonly string[] = []) => {
    if (!permitido) return null;
    const limpio = String(name || '').trim();
    if (!limpio) return null;
    // Se pregunta con la URL NORMAL —que es la que guarda el registro de fallos— y se pide la ancha: si de este
    // título no hay carátula, tampoco la habrá en otro tamaño.
    if (sabemosQueNoTiene(coverUrl(limpio, platforms, ampliado))) return null;
    return coverUrl(limpio, platforms, ampliado, 'ancho');
  }, [permitido, ampliado]);
}
