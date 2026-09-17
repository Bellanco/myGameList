/**
 * LOS TOPES LOCALES DE LAS CARÁTULAS, y para quién dejan de aplicarse.
 *
 * En el navegador hay tres topes, y los tres existen por lo mismo: que una biblioteca grande no crezca sin fin en
 * un sitio del que nadie se acuerda —la caché del service worker, la memoria de «este juego no tiene» y la lista
 * de lo ya recorrido—. No protegen al servidor de nada; protegen al propio dispositivo.
 *
 * Al rango más alto se le levantan, PERO NO A CIEGAS: se levantan mientras el navegador diga que hay sitio de
 * sobra. Esa condición no es una formalidad. Cuando un origen llega a su cuota, el navegador no desaloja «lo que
 * sobra»: puede desalojarlo TODO —el shell, los chunks, la biblioteca guardada para verla sin red—, así que un
 * privilegio sin guarda acabaría costando justo lo que la aplicación promete. Con holgura no se poda; al
 * acercarse al límite vuelven los topes y se recorta, que es exactamente lo que hacía antes.
 *
 * Y se decide AQUÍ, en el cliente, porque es un límite del propio dispositivo: no gobierna ningún recurso del
 * servicio (para eso está el cupo de `/cover`, que se resuelve en el servidor con el token verificado). Quien
 * manipule su copia solo se afecta a sí mismo, que es el mismo criterio de los demás privilegios de rango
 * (`PROFILE_TIER_FEED_TTL_MS` y compañía).
 */

/**
 * A partir de qué ocupación vuelven los topes. El 80 % deja margen para que el resto de la aplicación —el gist
 * de la biblioteca, las reseñas, los chunks— quepa sin pelearse con las imágenes por el último hueco.
 */
const OCUPACION_MAXIMA = 0.8;

/** Lo último que se supo. Se consulta en caliente (cada guardado, cada poda), así que no puede ser asíncrono. */
let levantados = false;

/** ¿Están los topes locales levantados ahora mismo? */
export function topesLevantados(): boolean {
  return levantados;
}

/**
 * ¿Hay sitio de sobra en el almacenamiento del origen?
 *
 * Sin `navigator.storage.estimate` —Safari viejo, contextos sin permiso— se responde que NO: ante la duda, los
 * topes se quedan, que es el comportamiento de siempre y el que nunca deja a nadie sin app por falta de espacio.
 */
export async function hayHolguraDeAlmacenamiento(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return false;
    const { usage, quota } = await navigator.storage.estimate();
    if (!quota || usage === undefined) return false;
    return usage / quota < OCUPACION_MAXIMA;
  } catch {
    return false;
  }
}

/**
 * Recalcula si los topes se levantan y se lo cuenta al service worker, que tiene el suyo propio (el de la caché
 * de carátulas) y no puede mirar ni el rango ni el almacenamiento por su cuenta.
 *
 * Devuelve lo que ha decidido, para quien quiera enseñarlo o probarlo.
 */
export async function evaluarTopesDeImagenes(esDelRangoMaximo: boolean): Promise<boolean> {
  levantados = esDelRangoMaximo && (await hayHolguraDeAlmacenamiento());
  try {
    const registro = await navigator.serviceWorker?.ready;
    registro?.active?.postMessage({ tipo: 'covers-sin-tope', valor: levantados });
  } catch {
    // Sin service worker (desarrollo, primer arranque, navegador que no lo soporta) no hay nada que avisar: su
    // tope es suyo y, mientras no reciba el aviso, sigue podando como siempre.
  }
  return levantados;
}

/** Solo para las pruebas: vuelve al estado de partida. */
export function reiniciarTopesDeImagenes(): void {
  levantados = false;
}
