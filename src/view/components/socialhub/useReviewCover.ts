import { useCallback } from 'react';
import { coverUrl } from '../../../core/utils/coverUrl';
import { sabemosQueNoTiene } from '../../../core/utils/coverMemory';
import { peticionDeCaratula } from '../../../core/utils/coverDone';
import { useCovers } from '../../hooks/useCovers';
import { useIsAdmin } from '../../hooks/useIsAdmin';

/**
 * `true` = pedir como siempre; `'solo-cache'` = lo ajeno, que se resuelve solo con la parte del cupo del día
 * reservada a lo ajeno (`c=2`, ver `functions/cover.ts`); `false` = nada.
 */
export type CoverAccess = boolean | 'solo-cache';

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
 *     solo tu preferencia. En el hub social es `'solo-cache'`: se ve lo que el servidor ya tenga resuelto, y lo
 *     que falte solo se resuelve mientras quede la parte del cupo del día reservada a lo ajeno; si no, se queda
 *     sin imagen hasta otro intento. Resolver el catálogo de otra persona es lo que escribe en KV, y ese
 *     presupuesto lo comparten tu biblioteca y los enlaces compartidos. Es la MISMA regla que sigue su tabla de
 *     juegos (`cachedOnly` en `SocialProfileDetailScreen`).
 *  3. Que de ese título no conste ya que no tiene carátula (`sabemosQueNoTiene`), para no volver a preguntar.
 *
 * El tamaño es el `ancho`: la franja es apaisada y recorta una banda de una imagen vertical, así que la pequeña
 * llega estirada casi seis veces y lo que queda es una mancha. (El renglón de la lista se quedó en `medio`, que
 * bajo su velo no se distingue y pesa menos al recorrer una biblioteca entera; ver `coverDeRenglon`.)
 *
 * Quien pinta la carátula ENTERA y pequeña —la composición del resumen del año— pide `medio`, que es además la URL
 * exacta del renglón del listado: la imagen que ya se vio en la lista sale de la caché del navegador.
 */
export function useReviewCover(
  acceso: CoverAccess = true,
): (name: string, platforms?: readonly string[], tamano?: 'medio' | 'ancho') => string | null {
  const { covers } = useCovers();
  const permitido = covers && acceso !== false;
  // El modo ampliado (DLC, packs y mods) tiene su propio espacio de caché: se pide con la misma clave con la que
  // ese navegador ya haya pedido esta carátula en el listado, o la respuesta no se reaprovecha.
  // Solo se pregunta si puede haber carátula: si no, la respuesta no sirve de nada y preguntar no es gratis. La
  // página pública de un enlace compartido no las permite, y ahí la pregunta descargaba Firebase y, en móvil,
  // contactaba con Google en cuanto el navegador tenía el almacenamiento bloqueado (ver `useIsAdmin`).
  // Y en lo ajeno tampoco: ese espacio aparte solo lo llena la biblioteca propia, y lo ajeno no resuelve con el
  // cupo entero, así que la lente dejaba sin carátula todo lo que la administración no tiene (ver `GameTable`).
  const soloCache = acceso === 'solo-cache';
  const ampliado = useIsAdmin(permitido && !soloCache);

  return useCallback((name: string, platforms: readonly string[] = [], tamano: 'medio' | 'ancho' = 'ancho') => {
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
    return coverUrl(nombre, plataformas, ampliado, tamano, marca ? 'ajeno' : 'resolver');
  }, [permitido, soloCache, ampliado]);
}
