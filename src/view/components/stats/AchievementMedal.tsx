import { memo, type CSSProperties } from 'react';
import {
  ACHIEVEMENTS_UI,
  ACHIEVEMENT_RARITY_LABELS,
  medalThreshold,
  temperClass,
} from '../../../core/constants/achievementLabels';
import type { AchievementDef } from '../../../core/achievements/types';
// LA HOJA SE IMPORTA AQUÍ, y es la decisión que evita un fallo mudo. Las medallas se pintan en DOS chunks
// perezosos distintos —el panel con `/logros` y la ficha del hub social—, así que colgar sus estilos de
// `stats.scss` o de `social.scss` deja la otra pantalla sin estilos SIN QUE SALTE NINGÚN ERROR. Es exactamente lo
// que ya pasó con `ProfileReviewsList` en `/perfil/resenas` y con el medallón de la nota en `/r/:token`. Atada al
// componente, Vite la emite en cada chunk que de verdad pinta una medalla. Ver `styles/reviews.scss`.
import '../../../styles/achievements.scss';

export type MedalSize = 'lg' | 'md' | 'sm';

/** Lado de la medalla en cada sitio: el listado, la tira de la ficha y la tira de novedades (§8.5). */
const SIZES: Record<MedalSize, number> = { lg: 72, md: 48, sm: 28 };

interface AchievementMedalProps {
  def: AchievementDef;
  /** 0 = bloqueado. */
  level: number;
  size?: MedalSize;
  /** Fecha ya formateada, solo para el nombre accesible. */
  date?: string;
  /** Oculto y sin conseguir: ni icono ni nombre, solo el «?» (§6.7). */
  masked?: boolean;
}

/**
 * La medalla. UN DISCO EN PENUMBRA: fondo pardo casi negro con un foco cálido entrando por arriba a la
 * izquierda, y el dibujo en oro recogiendo esa luz. La referencia es el tenebrismo —Caravaggio, Ribera—, y no es
 * un capricho: un disco oscuro con una sola cosa iluminada dentro es lo que aguanta los 28 px de la tira de
 * novedades sin volverse una mancha.
 *
 * EL DIBUJO NO SE DIBUJA. Sale del sprite (`AchievementSprite`), que a su vez copia los trazos de Lucide, y aquí
 * se pinta TRES VECES sobre el mismo símbolo: una en negro desplazada hacia abajo —la sombra que proyecta—, otra
 * con el degradado de oro y una tercera, finísima y clara, desplazada al contrario. Esas tres pasadas son todo el
 * relieve; no hay filtro, no hay imagen y no hay coste por icono.
 *
 * TRES SEÑALES Y CADA UNA EN SU CANAL, que es lo que impide que se pisen:
 *   · **aura exterior** → la RAREZA (escala de loot de RPG, saltándose el azul porque el azul es el acento)
 *   · **temple del filo** → el TRAMO de la escalera: cobre abajo, plata en medio, oro arriba
 *   · **píldora del canto** → LA CIFRA de ese escalón: «×100», «≤5», «75%»
 *
 * LA PÍLDORA VA MONTADA EN EL BORDE DE ABAJO, no dentro. Es lo que la hace caber: a 48 px una pastilla centrada
 * en el disco tapaba el dibujo, y en la esquina se salía por la curva. Cruzando el canto se apoya en el filo,
 * deja el dibujo entero y gana el fondo oscuro que necesita para leerse.
 *
 * Y VA SIN UNIDAD: dentro de una escalera la unidad es siempre la misma, así que «52» dice lo mismo que «52 sem»
 * en la mitad de sitio. La unidad la pone la fila del listado, que escribe la condición entera.
 *
 * NO SALE EN `sm` (28 px). Ahí no cabe nada legible y la tarjeta del feed no es un sitio donde se comparen
 * escalones; la señal de escalón que sí sobrevive a ese tamaño es el temple, que es del tamaño del disco entero.
 * Es también la razón por la que se retiró el numeral romano: el romano no sobrevivía a la tira y el filo sí.
 *
 * TODAS MIDEN EXACTAMENTE LO MISMO, tenga el logro el grado que tenga y esté conseguido, bloqueado u oculto: una
 * rejilla de medallas de distinto tamaño no cuadricula.
 */
export const AchievementMedal = memo(function AchievementMedal({
  def,
  level,
  size = 'md',
  date = '',
  masked = false,
}: AchievementMedalProps) {
  const side = SIZES[size];
  const locked = level < 1;

  // EL TEMPLE DICE QUÉ ESCALÓN ES, no en qué nivel está: el nivel de un escalón solo puede ser 0 o 1, así que
  // sacarlo del estado dejaría todas las medallas con el mismo filo.
  //
  // Y EL OCULTO NO LO LLEVA, por lo mismo que no lleva su aura (§6.7): un filo de oro sobre un «?» dice que hay
  // una escalera larga detrás y que estás al final de ella, que es media pista.
  const temper = masked ? '' : temperClass(def.grade, def.grades);
  // El OCULTO no la lleva —la cifra de un «?» dice cuántos escalones tiene la escalera y por dónde vas, que es
  // media pista (§6.7)—, y el bloqueado sí: ahí la cifra es el objetivo, que es lo que hace útil la mitad de
  // abajo del listado. Lo que cambia en el bloqueado es el tono, como con el temple.
  const threshold = masked || size === 'sm' ? '' : medalThreshold(def.ladder, def.step, def.grades, def.descending);

  // El nombre accesible lo lleva la MEDALLA, no un `title`: el `title` no sale con teclado, no sale en táctil y
  // los lectores de pantalla lo tratan de forma desigual. Sin esto, la tira solo-imagen de la ficha social sería
  // ilegible para quien no ve el disco.
  const label = masked
    ? ACHIEVEMENTS_UI.medalHiddenAria
    : locked
      ? ACHIEVEMENTS_UI.medalLockedAria(def.labels.name)
      : ACHIEVEMENTS_UI.medalAria(def.labels.name, date);

  const classes = [
    'ach-medal',
    // EL OCULTO NO LLEVA SU AURA. El aura dice la rareza, y la rareza de un oculto es una pista de cuál es: con
    // seis excepcionales en el catálogo, un halo naranja sobre un «?» reduce la adivinanza a seis casillas. La
    // regla del §6.7 es «nunca una pista», y esto lo era. Al conseguirlo aparece el aura como en cualquier otro.
    masked ? 'is-comun' : `is-${def.rarity}`,
    // EL BLOQUEADO SÍ LLEVA TEMPLE, y el oculto no. No es una excepción caprichosa: de un logro bloqueado se
    // enseña a propósito de qué va y por dónde va su escalera —es lo que hace útil la mitad de abajo del
    // listado—, mientras que del oculto no se enseña nada. Lo que cambia en el bloqueado es el tono: el filo se
    // queda en peltre, con la misma gradación pero sin metal, para que no se lea como conseguido.
    masked ? '' : temper,
    locked ? 'is-locked' : '',
    masked ? 'is-hidden' : '',
  ].filter(Boolean).join(' ');

  const icon = `#ach-${def.icon}`;

  return (
    <span
      className={classes}
      style={{ '--sz': `${side}px` } as CSSProperties}
      role="img"
      aria-label={label}
      data-rarity={masked ? undefined : ACHIEVEMENT_RARITY_LABELS[def.rarity]}
    >
      <span className="ach-canvas" aria-hidden="true">
        {masked ? null : (
          <svg className="ach-art" viewBox="0 0 24 24">
            <g className="ach-sh"><use href={icon} /></g>
            <g className="ach-fg"><use href={icon} /></g>
            <g className="ach-hl"><use href={icon} /></g>
          </svg>
        )}
        <span className="ach-light" />
        <span className="ach-grain" />
      </span>
      {/* Decorativa: lo que dice el escalón a un lector de pantalla es el nombre del logro, que ya trae su
          romano del catálogo («Créditos finales V»). */}
      {threshold ? <span className="ach-step" aria-hidden="true">{threshold}</span> : null}
    </span>
  );
});
