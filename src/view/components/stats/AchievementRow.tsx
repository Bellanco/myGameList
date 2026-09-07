import { memo, type CSSProperties } from 'react';
import { AchievementMedal } from './AchievementMedal';
import { ACHIEVEMENTS_UI, ACHIEVEMENT_RARITY_LABELS } from '../../../core/constants/achievementLabels';
import type { AchievementDef } from '../../../core/achievements/types';

export interface AchievementRowData {
  def: AchievementDef;
  level: number;
  value: number;
  next: number | null;
  /** Fecha ya formateada; vacía si no hay sello deducible, que es un estado legítimo (§5.3). */
  date: string;
  /** Porcentaje de gente que lo tiene y sobre cuántos. `null` = muestra insuficiente, no se pinta (§6.6bis). */
  rarity: { percent: number; holders: number; sample: number } | null;
  /**
   * Vista GLOBAL: el catálogo entero ordenado por lo común que es cada logro, con un recuadro en los que tiene el
   * dueño del perfil que se está mirando. Cambia tres cosas de la fila y ninguna es cosmética:
   *
   *  - el recuadro, que es la señal que se busca de un vistazo al recorrer una lista larga;
   *  - **sin barras de progreso**, porque aquí no se mide un camino sino una pertenencia (y el progreso de otra
   *    persona hacia algo que no tiene no es asunto de nadie, §3);
   *  - la fecha se calla, porque la columna que importa es el porcentaje.
   *
   * `self` decide la voz: en tu propia ficha se dice «Lo tienes» y en la de otra persona «Conseguido». La misma
   * lección que `statsVoice`, que ya existe para el panel por el mismo motivo.
   */
  global?: { self: boolean };
  /**
   * ¿Son TUYOS? Decide cuál de los dos textos del catálogo se enseña en lo conseguido: el HECHO («Te has
   * terminado 100 juegos») solo vale si el que lee es el que lo hizo. En la ficha de otra persona se sigue
   * enseñando la META, que describe el logro sin atribuírselo a nadie — la misma lección que `statsVoice`.
   */
  mine?: boolean;
}

/**
 * UNA FILA DEL LISTADO, con la forma de Steam: **imagen, nombre, descripción y el día en que se desbloqueó**.
 *
 * Un listado y no una rejilla, y es la decisión que hace usable la pantalla: la descripción cabe entera, sin
 * recortes ni globos de ayuda. Cada fila lleva **siempre** la condición literal y, si no está al tope, el umbral
 * del siguiente nivel — es lo que convierte una ristra de adornos en algo que se puede usar.
 *
 * EL OCULTO que no se tiene ocupa su fila con «?» y «se revela al conseguirlo», nunca una pista de cuál es. Y el
 * BLOQUEADO es la misma forma desaturada, no un hueco: la desaturación no puede ser la única señal —es color
 * puro— así que el estado va también en el texto.
 */
export const AchievementRow = memo(function AchievementRow({
  def,
  level,
  value,
  next,
  date,
  rarity,
  global,
  mine = true,
}: AchievementRowData) {
  const isGlobal = Boolean(global);
  const earned = level >= 1;
  const masked = Boolean(def.hidden) && !earned;
  // El grado ya viene EN EL NOMBRE («Créditos finales III»): lo pone el catálogo al expandir la escalera, que
  // es el único sitio que sabe cuántos escalones tiene. Componerlo aquí otra vez lo escribiría dos veces.
  const name = masked ? ACHIEVEMENTS_UI.hiddenName : def.labels.name;
  // DOS TEXTOS, Y EL QUE TOCA: lo conseguido se cuenta en pasado («Te has terminado 100 juegos») y lo que falta
  // se pide en imperativo («Termina 100 juegos»). Con un solo texto, una de las dos mitades de la lista se leía
  // mal: en imperativo, una medalla ya ganada parecía una tarea pendiente.
  const condition = masked
    ? ACHIEVEMENTS_UI.hiddenCondition
    : (earned && mine ? def.labels.done : def.labels.condition);

  // «Sin cabos sueltos» mide un porcentaje y las demás cuentan cosas: el progreso tiene que decirlo o «42 de 75»
  // se lee como 42 juegos.
  const isPercent = def.id === 'cobertura';
  const pct = next !== null && next > 0 ? Math.max(0, Math.min(100, Math.round((value / next) * 100))) : 100;
  const progress = next !== null
    ? (isPercent ? ACHIEVEMENTS_UI.progressPercent(value, next, pct) : ACHIEVEMENTS_UI.progress(value, next, pct))
    : ACHIEVEMENTS_UI.maxed;

  const classes = ['ach-row', earned ? '' : 'is-locked', isGlobal ? 'is-global' : '', isGlobal && earned ? 'is-owned' : '']
    .filter(Boolean)
    .join(' ');

  // EL FONDO DE LA FILA GLOBAL SE LLENA CON EL PORCENTAJE. Es la lista ordenada por esa cifra, así que el relleno
  // convierte el orden en algo que se ve sin leer: la escalera baja sola de arriba abajo. Sutil a propósito —es
  // el dato de fondo, no el contenido— y va como variable para que el tema pueda vestirlo (`achievements.scss`).
  const fill = isGlobal && rarity ? `${Math.max(0, Math.min(100, rarity.percent))}%` : undefined;

  return (
    <li className={classes} style={fill ? ({ '--fill': fill } as CSSProperties) : undefined}>
      {/* `md` (48 px) en LAS DOS VISTAS. La medalla manda en la altura de la fila, y a 72 px cada una era casi
          tan alta como ancho su cuadro: la lista se leía como una pila de fichas en vez de como una lista. El
          tamaño se decide aquí y no en la hoja, para que no haya dos sitios donde cambiarlo. */}
      <AchievementMedal def={def} level={level} size="md" date={date} masked={masked} />

      <div className="ach-row-body">
        <p className="ach-row-name">{name}</p>
        <p className="ach-row-condition">{condition}</p>
        {/* EL PROGRESO DE LO QUE AÚN NO TIENES, como hace Steam con sus logros parciales («4 de 10»).
            En la vista global solo sale en TU perfil: el espejo de otra persona lleva los logros CONSEGUIDOS y
            nada más, así que de una amistad no se sabe por dónde va —ni debe saberse, que es la línea del §3—.
            Por eso la condición mira `global.self` y no solo `global`. */}
        {(!isGlobal || global?.self) && !earned && !masked && next !== null && value > 0 ? (
          <p className="ach-row-progress">
            <span className="ach-row-bar" aria-hidden="true">
              <i style={{ '--pct': `${pct}%` } as CSSProperties} />
            </span>
            <span className="ach-row-progress-text">{progress}</span>
          </p>
        ) : null}
      </div>

      <div className="ach-row-meta">
        {/* El día del desbloqueo. Sin fecha deducible el hueco se queda VACÍO: no pone «desconocido» ni inventa
            un día, que es lo que haría creer que la app sabe algo que no sabe. */}
        {isGlobal ? (
          /* EL RECUADRO NO PUEDE SER LA ÚNICA SEÑAL: es forma y color, y en una lista larga de filas casi
             idénticas hay que poder saber por texto cuáles son los que tiene esta persona. */
          <span className="ach-row-owned">
            {global?.self
              ? (earned ? ACHIEVEMENTS_UI.ownedSelf : ACHIEVEMENTS_UI.notOwnedSelf)
              : (earned ? ACHIEVEMENTS_UI.owned : ACHIEVEMENTS_UI.notOwned)}
          </span>
        ) : (
          <span className="ach-row-date" title={earned && !date ? ACHIEVEMENTS_UI.noDateTitle : undefined}>
            {earned ? (date || ACHIEVEMENTS_UI.noDate) : ACHIEVEMENTS_UI.locked}
          </span>
        )}
        {/* Y la rareza, con las dos cifras que van juntas SIEMPRE: la declarada, dicha con palabras porque el aura
            es color puro; y la medida, que nunca se dice sin su denominador.

            DE UN OCULTO NO SE DICE NINGUNA DE LAS DOS. Escribir «EXCEPCIONAL» junto a un «Logro oculto» es una
            pista de cuál es —el catálogo solo tiene seis— y la regla del §6.7 es que un oculto no da ninguna. */}
        {masked ? null : (
          <span className="ach-row-rarity" data-r={def.rarity}>{ACHIEVEMENT_RARITY_LABELS[def.rarity]}</span>
        )}
        {!masked && rarity ? (
          <span className="ach-row-share">
            {ACHIEVEMENTS_UI.rarityPercent(rarity.percent, rarity.holders, rarity.sample)}
          </span>
        ) : null}
      </div>
    </li>
  );
});
