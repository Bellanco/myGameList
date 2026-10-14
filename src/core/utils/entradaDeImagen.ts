/**
 * TODA IMAGEN ENTRA, NINGUNA APARECE. El salto de «hueco» a «foto» de un fotograma al siguiente —el avatar que
 * salta, la carátula del renglón que se enciende de golpe detrás del texto— se lee como un fallo de pintado. La
 * receta es la de `GameCover` (`_table.scss`, «CÓMO ENTRA UNA CARÁTULA»): mientras no ha llegado no se enseña, y al
 * llegar se INSTALA con un fundido.
 *
 * Esto la hace común a cualquier imagen, sin estado de React: un `ref` que marca el elemento con `data-entrada` y
 * deja el gesto al CSS.
 *   · `cargando` — todavía no ha llegado: invisible (y así un `<img>` a medio bajar no enseña bandas).
 *   · `lista`    — acaba de llegar: entra con el fundido.
 *   · `ya`       — ya estaba en memoria (vista antes en la sesión, o precargada): se enseña quieta. Volver a una
 *                  pantalla no repite el gesto en todo lo que ya se había visto.
 * Sin marca —la petición falló, o el `ref` no llegó a correr— la imagen se ve tal cual. Nunca se queda invisible.
 *
 * POR QUÉ UN `ref` Y NO UN HOOK. La carátula de fondo del listado se pinta dentro del bucle de filas de
 * `GameTable`, donde no cabe un hook, y un estado de React por imagen haría que cada carátula que llega volviera a
 * pintar su fila —o la tabla entera— mientras se baja. El `ref` marca el nodo y el navegador hace el resto.
 *
 * El `ref` es UNO POR URL y se reutiliza: con una función nueva en cada render React lo volvería a llamar en cada
 * render, y una fila que repinta a mitad del fundido lo reiniciaría. Con la misma función solo se llama al montar y
 * cuando cambia la URL, que es justo cuando hay que volver a empezar.
 *
 * El CSS: `img[data-entrada]` está en `_motion.scss`, para cualquier `<img>`; las capas de fondo usan el mixin de
 * `_entrada.scss` en su hoja, porque la capa que hay que fundir (un `::before`, un hijo) es de cada pieza.
 */
import type { RefCallback } from 'react';
import { caratulaPrecargada } from './precargaDeCaratulas';

type Entrada = 'cargando' | 'lista' | 'ya';

/** Las URL que ya han llegado en esta sesión: lo que vuelva a pintarse con ellas se enseña sin el gesto. */
const llegadas = new Set<string>();
/** Las precargas de fondo en vuelo, para que dos piezas con la misma carátula no la pidan dos veces. */
const enVuelo = new Map<string, Promise<boolean>>();
const refsDeImagen = new Map<string, RefCallback<HTMLImageElement>>();
const refsDeFondo = new Map<string, RefCallback<HTMLElement>>();

function marcar(elemento: HTMLElement, entrada: Entrada | null): void {
  if (entrada) elemento.dataset.entrada = entrada;
  else delete elemento.dataset.entrada;
}

function yaLlego(url: string): boolean {
  return llegadas.has(url) || caratulaPrecargada(url);
}

/** Un `<img>`: se mira si ya está completo y, si no, se espera a su `load`. */
function entrarImagen(imagen: HTMLImageElement, url: string): (() => void) | undefined {
  /* Un `<img>` cuya URL está en la memoria del documento llega COMPLETO en el mismo instante en que se le pone el
     `src`, antes de que corra este `ref` (que va después de tocar el DOM y antes de pintar). Ese ya está: quieto. */
  if (imagen.complete) {
    marcar(imagen, imagen.naturalWidth > 0 ? 'ya' : null);
    return undefined;
  }
  /* Y el que no está completo entra, aunque la URL ya se hubiera visto: marcarlo `ya` lo dejaría a la vista
     mientras baja, y llegaría de golpe, que es lo que esto quita. */
  marcar(imagen, 'cargando');
  const alLlegar = () => {
    llegadas.add(url);
    marcar(imagen, 'lista');
  };
  // El que falla no se queda invisible: cada pieza decide qué enseña en su lugar (silueta, enlace…).
  const alFallar = () => marcar(imagen, null);
  imagen.addEventListener('load', alLlegar, { once: true });
  imagen.addEventListener('error', alFallar, { once: true });
  return () => {
    imagen.removeEventListener('load', alLlegar);
    imagen.removeEventListener('error', alFallar);
  };
}

/** La misma URL que pinta el CSS, pedida aparte para saber cuándo ha llegado: el navegador sirve las dos con una. */
function esperar(url: string): Promise<boolean> {
  let promesa = enVuelo.get(url);
  if (!promesa) {
    promesa = new Promise<boolean>((resolver) => {
      const imagen = new Image();
      imagen.onload = () => {
        llegadas.add(url);
        enVuelo.delete(url);
        resolver(true);
      };
      imagen.onerror = () => {
        enVuelo.delete(url);
        resolver(false);
      };
      imagen.src = url;
    });
    enVuelo.set(url, promesa);
  }
  return promesa;
}

/** Una capa con la imagen de fondo (`background-image: var(--…)`): un fondo de CSS no avisa al llegar. */
function entrarFondo(elemento: HTMLElement, url: string): () => void {
  if (yaLlego(url) || typeof Image === 'undefined') {
    marcar(elemento, 'ya');
    return () => {};
  }
  marcar(elemento, 'cargando');
  let vigente = true;
  void esperar(url).then((llego) => {
    if (vigente) marcar(elemento, llego ? 'lista' : null);
  });
  return () => {
    vigente = false;
  };
}

/** `ref` para un `<img>` que tiene que entrar con fundido. Pásale el mismo `src` que lleva el elemento. */
export function refEntradaDeImagen(src: string | null | undefined): RefCallback<HTMLImageElement> | undefined {
  if (!src) return undefined;
  let ref = refsDeImagen.get(src);
  if (!ref) {
    ref = (imagen) => (imagen ? entrarImagen(imagen, src) : undefined);
    refsDeImagen.set(src, ref);
  }
  return ref;
}

/**
 * `ref` para el elemento que lleva (o cuya capa lleva) una imagen de fondo: la URL es la misma que va en su
 * `url("…")`. El elemento recibe `data-entrada`, y su hoja decide con el mixin de `_entrada.scss` qué capa funde.
 */
export function refEntradaDeFondo(url: string | null | undefined): RefCallback<HTMLElement> | undefined {
  if (!url) return undefined;
  let ref = refsDeFondo.get(url);
  if (!ref) {
    ref = (elemento) => (elemento ? entrarFondo(elemento, url) : undefined);
    refsDeFondo.set(url, ref);
  }
  return ref;
}
