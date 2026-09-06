import { memo, type CSSProperties } from 'react';
import { ACHIEVEMENTS_UI, ACHIEVEMENT_RARITY_LABELS, romanLevel } from '../../../core/constants/achievementLabels';
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
 * La medalla. Cuadrada de esquinas redondeadas, la imagen A SANGRE y **sin marco**.
 *
 * DOS SEÑALES Y CADA UNA EN SU CANAL, que es lo que impide que se pisen: el **aura exterior** dice la RAREZA
 * —escala de loot de RPG, saltándose el azul porque el azul es el acento de la app— y el **triángulo del ángulo
 * inferior derecho** dice el GRADO. Lo prohibido era meter las dos variables en el mismo elemento, no darle color
 * a la segunda.
 *
 * TODAS MIDEN EXACTAMENTE LO MISMO, tenga el logro el grado que tenga y esté conseguido, bloqueado u oculto: una
 * rejilla de medallas de distinto tamaño no cuadricula. Lo único que cambia entre un grado y otro es el numeral.
 *
 * Y NADA DE LOS CUATRO METALES: bronce, plata, oro y mithril son el rango de perfil (`_tiers.scss`), y en la
 * ficha social la misma tarjeta lleva la muesca de rango y la tira de medallas a dos centímetros.
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
  // EL TRIÁNGULO DICE QUÉ ESCALÓN ES, no en qué nivel está: el nivel de un escalón solo puede ser 0 o 1, así
  // que dibujarlo desde el estado dejaría todas las medallas sin numeral.
  //
  // Y EL OCULTO NO LO LLEVA, por lo mismo que no lleva su aura (§6.7): el «III» de un cuadro tapado dice que hay
  // una escalera de al menos tres detrás, que es media pista.
  const numeral = masked ? '' : romanLevel(def.grade, def.grades);

  // El nombre accesible lo lleva la MEDALLA, no un `title`: el `title` no sale con teclado, no sale en táctil y
  // los lectores de pantalla lo tratan de forma desigual. Sin esto, la tira solo-imagen de la ficha social sería
  // ilegible para quien no ve el cuadro.
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
    locked ? 'is-locked' : '',
    masked ? 'is-hidden' : '',
  ].filter(Boolean).join(' ');

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
          <svg className="ach-art" viewBox="0 0 32 32" filter="url(#imp)">
            <use href={`#ach-${def.icon}`} />
          </svg>
        )}
        <span className="ach-grain" />
        <span className="ach-light" />
      </span>
      {/* El grado vive ENTERO en el triángulo: la imagen no se toca y el tamaño tampoco. Se descartaron teñir un
          marco (choca con el aura, que es la señal que sí tiene que verse de lejos) y engordarlo (cambia el
          tamaño del bulto). Decorativo: lo que dice el nivel a un lector de pantalla es el `aria-label`. */}
      {numeral ? (
        <>
          <span className="ach-corner" aria-hidden="true" />
          <span className="ach-num" aria-hidden="true">{numeral}</span>
        </>
      ) : null}
    </span>
  );
});
