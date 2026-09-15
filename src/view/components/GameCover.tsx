import { memo } from 'react';
import { categoryToneStyle } from '../../core/constants/categoryTone';

/**
 * La RANURA de la carátula: un marco de proporción fija (3:4) que siempre ocupa el mismo sitio, tenga imagen o
 * no. Es lo que hace que el mosaico se lea como una colección y no como fichas sueltas — el problema que
 * `docs/plan-formas-listado.md` §3.2 describía como «una caja enseña dos chips y la de al lado cuatro».
 *
 * POR QUÉ LA PROPORCIÓN ES FIJA Y NO LA PONE LA IMAGEN. En una rejilla, la fila mide lo que mida su caja más
 * alta, y el virtualizador MIDE FILAS (`measureElement`). Si el alto dependiera de que la imagen cargue, cada
 * carátula que llega recalcularía su fila y la barra de desplazamiento daría saltos mientras se baja. Con el
 * marco declarado, el hueco existe desde el primer pintado y la imagen solo lo rellena.
 *
 * EL RELLENO CUANDO NO HAY IMAGEN no es un hueco gris: es el mismo reparto de la rampa categórica que ya tiñe
 * los géneros (`categoryTone`). Sale de un hash del nombre, así que es ESTABLE —el mismo juego tiene siempre su
 * color— y el tono concreto lo pone cada tema, como todo lo demás.
 *
 * Y LLEVA EL TÍTULO, solo el título. Hubo un paso intermedio con las iniciales en grande, y el contexto lo
 * desmintió: una pantalla entera de monogramas se leía bien, pero UNO entre carátulas de verdad parecía un fallo
 * de carga. El nombre compuesto no: se lee como una portada sobria, que es lo que es, y además identifica el
 * juego igual de bien que una carátula. Se descartó el `nocover.png` de IGDB por lo contrario: es un recuadro
 * gris con su logo y «COVER MISSING», o sea la marca de un tercero y cara de error, ajena a los temas.
 *
 * `aria-hidden`: decorativo a propósito. El nombre ya lo anuncian el título de la caja y el texto del botón que
 * la abre; repetirlo aquí haría que un lector de pantalla dijera el juego tres veces por caja.
 */
export const GameCover = memo(function GameCover({
  name,
  src,
}: {
  /** Nombre del juego: de él salen el color del relleno y el título de la portada de casa. */
  name: string;
  /** URL de la carátula. Sin ella (lo normal hasta que el emparejador la encuentre) se pinta el relleno. */
  src?: string | null;
}): React.JSX.Element {
  return (
    <div className="game-cover" style={categoryToneStyle(name)} aria-hidden="true">
      {src ? (
        // `loading="lazy"`: en una biblioteca de 300 juegos, el mosaico pediría 300 imágenes de golpe.
        // `decoding="async"` para que descodificar una carátula no bloquee el pintado de la fila.
        <img className="game-cover-img" src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="game-cover-placeholder">
          <span className="game-cover-title">{name}</span>
        </span>
      )}
    </div>
  );
});

