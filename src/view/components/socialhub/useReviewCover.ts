import { useCallback } from 'react';
import { coverUrl } from '../../../core/utils/coverUrl';
import { sabemosQueNoTiene } from '../../../core/utils/coverMemory';
import { peticionDeCaratula } from '../../../core/utils/coverDone';
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
 *  2. `acceso`, que es la política del sitio donde se pinta (`CoverAccess`). En TUS reseñas es `true` y manda
 *     solo tu preferencia. En el hub social es `'solo-cache'`: se ve lo que el servidor ya tenga resuelto y lo
 *     que falte se queda sin imagen, porque resolver el catálogo de otra persona es lo que escribe en KV y ese
 *     presupuesto es el de los enlaces compartidos. Es la MISMA regla que sigue su tabla de juegos
 *     (`cachedOnly` en `SocialProfileDetailScreen`).
 *  3. Que de ese título no conste ya que no tiene carátula (`sabemosQueNoTiene`), para no volver a preguntar.
 *
 * El tamaño es el `ancho` del renglón por lo mismo que allí: la franja es apaisada y recorta una banda de una
 * imagen vertical, así que la pequeña llega estirada casi seis veces y lo que queda es una mancha.
 */
/** `true` = pedir como siempre; `'solo-cache'` = solo lo ya resuelto, sin preguntar a IGDB; `false` = nada. */
export type CoverAccess = boolean | 'solo-cache';

export function useReviewCover(acceso: CoverAccess = true): (name: string, platforms?: readonly string[]) => string | null {
  const { covers } = useCovers();
  // El modo ampliado (DLC, packs y mods) tiene su propio espacio de caché: se pide con la misma clave con la que
  // ese navegador ya haya pedido esta carátula en el listado, o la respuesta no se reaprovecha.
  const ampliado = useIsAdmin();
  const permitido = covers && acceso !== false;
  const soloCache = acceso === 'solo-cache';

  return useCallback((name: string, platforms: readonly string[] = []) => {
    if (!permitido) return null;
    const limpio = String(name || '').trim();
    if (!limpio) return null;
    /* En lo ajeno, un título que tu biblioteca ya resolvió se pide como lo pediste tú y sin la marca, igual que
       en la tabla: está resuelto seguro y así sale de la caché del navegador (ver `peticionDeCaratula`).
       Y también en lo PROPIO cuando no llegan plataformas, que es lo que pasa en las sugerencias (las relacionadas
       no las llevan). Pedida solo por nombre, la URL no era la del listado: otra descarga de la misma imagen, un
       «no tiene» que la memoria no reconocía y, como la clave del servidor lleva las plataformas
       (`claveCache`), otra resolución contra IGDB por un juego que ya estaba emparejado. */
    const { nombre, plataformas, soloCache: marca } = peticionDeCaratula(limpio, platforms, ampliado, {
      preferirConocidas: !ampliado && (soloCache || platforms.length === 0),
      soloCache,
    });
    // Se pregunta con la URL NORMAL —que es la que guarda el registro de fallos— y se pide la ancha: si de este
    // título no hay carátula, tampoco la habrá en otro tamaño.
    if (sabemosQueNoTiene(coverUrl(nombre, plataformas, ampliado))) return null;
    return coverUrl(nombre, plataformas, ampliado, 'ancho', marca);
  }, [permitido, soloCache, ampliado]);
}
