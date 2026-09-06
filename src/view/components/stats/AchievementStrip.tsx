import { memo, type CSSProperties } from 'react';
import { AchievementMedal } from './AchievementMedal';
import { Icon } from '../Icon';
import { ACHIEVEMENTS_BY_ID } from '../../../core/achievements/catalog';

export interface StripItem {
  id: string;
  level: number;
  /** Fecha ya formateada; vacía si no hay sello deducible. */
  date: string;
}

interface AchievementStripProps {
  items: readonly StripItem[];
  /**
   * Tope de medallas. **Sin él se pintan todas**, que es lo correcto en el panel: la tira envuelve y se adapta al
   * ancho, así que un «+16» escondía justo lo que la persona quiere ver de un vistazo —lo que ha conseguido— para
   * ahorrar un espacio que la rejilla ya sabe repartir sola.
   *
   * Se conserva para la ficha de una amistad, donde la tira comparte cabecera con el avatar y el rango y no
   * puede crecer sin empujarlos.
   */
  limit?: number;
  size?: 'md' | 'sm';
  /** Abrir el listado. Sin él, la tira es solo lectura. */
  onOpen?: () => void;
  /**
   * `false` deja las medallas DECORATIVAS: sin control, sin parada de tabulador y con el rótulo solo en `hover`.
   *
   * Es lo que pide la tarjeta del feed, donde la pulsable es la tarjeta ENTERA: ahí un control por medalla sería
   * un control dentro de otro —marcado inválido— y tres paradas de tabulador que llevan al mismo sitio que la
   * tarjeta. El nombre de cada logro no se pierde: va en el nombre accesible de la tarjeta.
   */
  interactive?: boolean;
  /**
   * Baldosa final que lleva al listado completo, **del mismo tamaño que una medalla y en el mismo sitio**: como
   * si fuera un logro más al final de la fila.
   *
   * Existe porque el acceso al listado quedaba escondido —en la ficha de una amistad no había ninguno, y en el
   * panel era un enlace pequeño debajo—, y porque el «+7» de lo que no cabe tiene que ser esa misma baldosa: si
   * hay medallas que no se ven, lo lógico es que la cosa que las cuenta sea la que lleva a verlas.
   */
  onSeeAll?: () => void;
  seeAllLabel?: string;
}

/**
 * LA TIRA: una fila de medallas y **solo la imagen**. Sin rótulos, sin fechas, sin cifras alrededor.
 *
 * Va debajo del nombre en la ficha social y en el apartado del panel. Que sea solo imagen es lo que la hace
 * funcionar ahí: la cabecera de una ficha ya tiene avatar, nombre y muesca de rango, y unas medallas rotuladas
 * la convertirían en un listado. Así es una firma —lo que esa persona ha hecho, de un vistazo— y quien quiera el
 * detalle entra en el listado.
 *
 * EL NOMBRE SALE AL PASAR POR ENCIMA, **y también con el tabulador**. Un `title` de HTML no vale: no sale con
 * teclado, no sale en táctil y los lectores de pantalla lo tratan de forma desigual. El rótulo es un elemento
 * propio que aparece en `:hover` y en `:focus-visible` (ver `achievements.scss`), y el nombre accesible completo
 * lo lleva la medalla. En táctil no hay hover: ahí el toque lleva al listado, que es donde el nombre está escrito.
 */
export const AchievementStrip = memo(function AchievementStrip({
  items,
  limit,
  size = 'md',
  onOpen,
  interactive = true,
  onSeeAll,
  seeAllLabel = 'Ver todos los logros',
}: AchievementStripProps) {
  const shown = typeof limit === 'number' ? items.slice(0, limit) : items;
  if (shown.length === 0) return null;

  return (
    <ul className="ach-strip" data-size={size}>
      {shown.map((item) => {
        const def = ACHIEVEMENTS_BY_ID.get(item.id);
        // Un `id` desconocido se ignora en silencio: un amigo con una versión más nueva publicará logros que este
        // cliente no conoce, y reaparecerán en cuanto se actualice. Nunca es un error de parseo.
        if (!def) return null;
        // El nombre ya trae su grado desde el catálogo («Créditos finales III»): componerlo otra vez aquí lo
        // escribiría dos veces.
        const caption = def.labels.name;

        const medal = <AchievementMedal def={def} level={item.level} size={size} date={item.date} />;

        return (
          <li key={item.id} className="ach-strip-item">
            {!interactive ? (
              <span className="ach-strip-btn is-static">
                {medal}
                <span className="ach-strip-tip" aria-hidden="true">{caption}</span>
              </span>
            ) : onOpen ? (
              <button type="button" className="ach-strip-btn" onClick={onOpen}>
                {medal}
                <span className="ach-strip-tip" aria-hidden="true">{caption}</span>
              </button>
            ) : (
              // Sin destino sigue siendo enfocable: el rótulo tiene que poder alcanzarse con el tabulador aunque
              // no haya nada que pulsar.
              <span className="ach-strip-btn" tabIndex={0}>
                {medal}
                <span className="ach-strip-tip" aria-hidden="true">{caption}</span>
              </span>
            )}
          </li>
        );
      })}
      {/* LA BALDOSA FINAL. Cuando hay medallas fuera del corte cuenta cuántas («+7»); cuando están todas, es una
          flecha. En los dos casos lleva al mismo sitio, así que no son dos controles distintos: es el mismo, con
          la cifra encima si hay algo que contar. */}
      {onSeeAll ? (
        <li className="ach-strip-item">
          <button
            type="button"
            className="ach-strip-all"
            style={{ '--sz': `${size === 'sm' ? 28 : 48}px` } as CSSProperties}
            onClick={(event) => { event.stopPropagation(); onSeeAll(); }}
            aria-label={seeAllLabel}
          >
            {items.length > shown.length ? (
              <span className="ach-strip-all-count">+{items.length - shown.length}</span>
            ) : (
              <Icon name="angle-right" />
            )}
          </button>
        </li>
      ) : items.length > shown.length ? (
        // Sin destino al que llevar, el resto se cuenta y ya. Va con el tamaño de la medalla porque ES una
        // medalla más en la fila; decorativo, porque los nombres de lo que no cabe viven en el `aria-label` de
        // quien contiene la tira.
        <li className="ach-strip-item" aria-hidden="true">
          <span className="ach-strip-more" style={{ '--sz': `${size === 'sm' ? 28 : 48}px` } as CSSProperties}>
            +{items.length - shown.length}
          </span>
        </li>
      ) : null}
    </ul>
  );
});
