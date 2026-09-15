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
 * color— y el tono concreto lo pone cada tema, como todo lo demás. Un juego sin carátula no parece un juego
 * roto, parece un juego con su color.
 *
 * `aria-hidden`: decorativo a propósito. El nombre ya lo anuncian el título de la caja y el texto del botón que
 * la abre; repetirlo aquí haría que un lector de pantalla dijera el juego tres veces por caja.
 */
export const GameCover = memo(function GameCover({
  name,
  src,
}: {
  /** Nombre del juego: de él salen el color del relleno y el monograma. */
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
        <span className="game-cover-monogram">{monogram(name)}</span>
      )}
    </div>
  );
});

/**
 * Dos letras a partir del título: iniciales de sus dos primeras palabras con peso («Hollow Knight» → HK), o las
 * dos primeras letras si solo hay una («Inside» → IN).
 *
 * Se descarta el artículo inicial y nada más. La tentación es filtrar todas las palabras vacías, pero entonces
 * «Ori and the Blind Forest» y «Ori and the Will of the Wisps» dan las mismas letras: el monograma solo
 * distingue si conserva lo que viene justo detrás del nombre de la saga.
 */
function monogram(name: string): string {
  const palabras = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (palabras.length > 1 && /^(the|el|la|los|las|a|an)$/i.test(palabras[0])) {
    palabras.shift();
  }
  if (!palabras.length) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}
