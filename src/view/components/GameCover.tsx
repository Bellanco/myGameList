import { memo, useState } from 'react';
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
  src2x,
}: {
  /** Nombre del juego: de él salen el color del relleno y el título de la portada de casa. */
  name: string;
  /** URL de la carátula. Sin ella (lo normal hasta que el emparejador la encuentre) se pinta el relleno. */
  src?: string | null;
  /**
   * La misma carátula al doble de resolución, para pantallas de densidad doble. Se ofrece junto a `src` y ELIGE
   * EL NAVEGADOR: en una pantalla normal ni se pide, así que nadie descarga bytes que no puede ver.
   *
   * Con descriptores `1x`/`2x` y no con `w` + `sizes`: la caja mide siempre entre 190 y 240 px, así que lo que
   * varía no es el hueco sino la densidad. Con `sizes` habría que adivinar el ancho que calcula el JS de la
   * rejilla, y adivinarlo mal hace que el navegador elija peor que si no le dijéramos nada.
   */
  src2x?: string | null;
}): React.JSX.Element {
  /* EL ESTADO DE LA CARGA, que es de ESTE elemento y no una decisión guardada. Hubo una versión que apuntaba
     qué `src` había fallado para no volver a pintarlo, y se comía carátulas buenas: `onError` NO distingue
     «esta imagen no existe» de «esta carga se ha cancelado», y la rejilla virtualizada cancela cargas todo el
     rato al reciclar filas mientras se baja. Un juego que pasaba rápido por pantalla quedaba marcado como roto
     para el resto de la sesión.
     Aquí no se guarda nada: el estado vive y muere con el elemento, y lo único que decide es cuál de las tres
     caras se enseña ahora mismo. Si una carga se cancela, la siguiente vez vuelve a empezar en «cargando».
       · `cargando` — hay URL y todavía no ha llegado: se ve la portada de casa, quieta. Mientras se espera no
                      pasa nada, y es a propósito: un esqueleto animado sobre una portada que ya está pintada es
                      ruido sobre algo que no falta.
       · `lista`    — llegó, y es AQUÍ donde ocurre el gesto: la imagen no aparece de golpe, ENTRA. Cómo entra lo
                      pone cada tema (ver `_table.scss` y las hojas de cada skin).
       · `sin`      — no hay URL (preferencia apagada, o ya se sabía que no tiene) o la petición falló: se queda
                      la portada de casa, que es una portada de verdad y no un hueco. */
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'sin'>(src ? 'cargando' : 'sin');

  /* Al reciclarse el elemento le cambia el `src` sin desmontarse, así que el estado tiene que volver a empezar:
     sin esto, una caja que ya había cargado enseñaría la imagen ANTERIOR marcada como lista mientras baja la
     nueva.
     Y el reinicio va DURANTE EL RENDER, comparando con el `src` de la vuelta anterior, en vez de en un efecto.
     Un efecto corre DESPUÉS de pintar, así que dejaba un fotograma con la URL nueva y el estado viejo —justo la
     imagen anterior a plena opacidad que esto viene a evitar— y costaba un render de más por cada caja que la
     rejilla recicla, que al bajar por una biblioteca grande son unos cuantos por fotograma. React vuelve a
     ejecutar el componente en el acto, sin pintar la vuelta descartada: es el patrón para ajustar estado cuando
     cambia una prop. */
  const [anterior, setAnterior] = useState(src);
  if (src !== anterior) {
    setAnterior(src);
    setEstado(src ? 'cargando' : 'sin');
  }

  return (
    <div className="game-cover" data-carga={estado} style={categoryToneStyle(name)} aria-hidden="true">
      {/* La portada de casa va SIEMPRE debajo, y QUIETA: es lo que hace que mientras se espera no falte nada, y
          que no quede un hueco si la Function responde 404 (juego sin carátula o sin emparejar). El gesto no
          ocurre aquí, ocurre cuando la imagen entra. */}
      <span className="game-cover-placeholder">
        <span className="game-cover-title">{name}</span>
      </span>
      {src ? (
        // `loading="lazy"`: en una biblioteca de 300 juegos, el mosaico pediría 300 imágenes de golpe.
        // `decoding="async"` para que descodificar una carátula no bloquee el pintado de la fila.
        <img
          className="game-cover-img"
          src={src}
          srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setEstado('lista')}
          onError={() => setEstado('sin')}
        />
      ) : null}
    </div>
  );
});

