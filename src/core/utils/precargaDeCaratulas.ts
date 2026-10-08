/**
 * LAS CARÁTULAS DE ARRIBA DE UNA LISTA, LISTAS ANTES DE ENSEÑARLA. Es para el cambio de lista (`handleTabChange` en
 * `App`), que se anima con una View Transition: el navegador captura la lista nueva en cuanto React la pinta, y en
 * ese instante sus carátulas aún no han llegado. La lista entraba deslizándose con los renglones pelados y las
 * imágenes aparecían de golpe al terminar (medido el 08-10-2026, renglones con carátulas: lista sin imágenes a
 * mitad del deslizamiento, todas de golpe 60 ms después).
 *
 * Así que antes de navegar se piden y DESCODIFICAN las de las primeras filas —las únicas que se ven al llegar— y la
 * transición arranca cuando están, o cuando se acaba el plazo, lo que llegue antes: una red lenta no puede dejar el
 * clic sin respuesta. Casi siempre salen de la caché del service worker y lo que cuesta es descodificarlas.
 *
 * Las URL son las MISMAS que pinta el listado (`coverDelListado`): una distinta sería otra imagen, y la precarga no
 * serviría de nada.
 */
import type { GameItem } from '../../model/types/game';
import { coverDeCaja, coverDeRenglon, type PedidoDePortada } from './coverDelListado';

/** Las listas propias piden con el cupo entero y sin alias, igual que `GameTable` sin `coverPolicy`. */
const PROPIA: PedidoDePortada = { preferirConocidas: false, soloCache: false };

/**
 * Las imágenes ya descodificadas, RETENIDAS: si nadie guarda la referencia, el navegador puede soltar el mapa de bits
 * antes de que el listado lo pinte y la descodificación se repite, que es justo lo que se quería quitar de en medio.
 * Con tope: son unas pocas por cambio de lista, y las viejas ya están pintadas.
 */
const retenidas = new Map<string, HTMLImageElement>();
const MAX_RETENIDAS = 48;

/** ¿Esta carátula está ya descodificada en memoria? `GameCover` la enseña entonces sin su gesto de entrada. */
export function caratulaPrecargada(url: string | null | undefined): boolean {
  return Boolean(url && retenidas.get(url)?.complete);
}

/**
 * Las URL de las carátulas que se verán arriba de la lista: las primeras `cuantas` en el orden en que se pintan.
 * En el mosaico, la de la densidad de la pantalla (el `srcset` de `GameCover` elige la de doble a partir de 1,5).
 */
export function caratulasDeArriba(
  juegos: readonly GameItem[],
  forma: 'list' | 'grid',
  cuantas: number,
  densidad: number,
): string[] {
  const urls: string[] = [];
  for (const juego of juegos.slice(0, cuantas)) {
    let url: string | null;
    if (forma === 'grid') {
      const { src, src2x } = coverDeCaja(true, juego, PROPIA);
      url = densidad >= 1.5 ? src2x : src;
    } else {
      url = coverDeRenglon(true, juego, PROPIA);
    }
    if (url) urls.push(url);
  }
  return urls;
}

/** Pide y descodifica estas carátulas; resuelve cuando están todas o cuando pasa `plazoMs`. Nunca rechaza. */
export function precargarCaratulas(urls: readonly string[], plazoMs: number): Promise<void> {
  if (urls.length === 0 || typeof Image === 'undefined') return Promise.resolve();
  const descodificadas = urls.map((url) => {
    let imagen = retenidas.get(url);
    if (!imagen) {
      imagen = new Image();
      imagen.decoding = 'async';
      imagen.src = url;
      retenidas.set(url, imagen);
      if (retenidas.size > MAX_RETENIDAS) retenidas.delete(retenidas.keys().next().value as string);
    }
    // Un 404 (juego sin carátula) o un corte no son un fallo de la precarga: esa simplemente no estará.
    return imagen.decode().catch(() => {});
  });
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<void>((listo) => { temporizador = setTimeout(listo, plazoMs); });
  return Promise.race([Promise.all(descodificadas).then(() => {}), plazo]).finally(() => clearTimeout(temporizador));
}
