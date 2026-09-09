import { memo, type CSSProperties } from 'react';
import { AchievementMedal } from './AchievementMedal';
import { ACHIEVEMENTS_UI, ACHIEVEMENT_RARITY_LABELS } from '../../../core/constants/achievementLabels';
import type { AchievementDef } from '../../../core/achievements/types';

export interface AchievementRowData {
  def: AchievementDef;
  level: number;
  value: number;
  next: number | null;
  /** Fecha ya formateada; vacía si no hay sello deducible ni suelo del que tirar. */
  date: string;
  /**
   * ¿La fecha viene del SUELO y no del logro? Se pinta igual —una columna de fechas con huecos no se lee— y lo
   * dice el rótulo del puntero: el día es el más antiguo del que hay constancia, y el logro cayó ese día o
   * después.
   */
  dateFromFloor?: boolean;
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
  dateFromFloor = false,
  rarity,
  global,
  mine = true,
}: AchievementRowData) {
  const isGlobal = Boolean(global);
  const earned = level >= 1;
  // YA NO HAY FILA TAPADA. Un logro oculto que no tienes no llega a esta fila: se filtra antes
  // (`core/achievements/visibility.ts`), porque una fila con «?» y «se revela al conseguirlo» contaba que
  // existe algo que no puedes saber qué es y gastaba el sitio de la pantalla en no decir nada.
  // El grado ya viene EN EL NOMBRE («Créditos finales III»): lo pone el catálogo al expandir la escalera, que
  // es el único sitio que sabe cuántos escalones tiene. Componerlo aquí otra vez lo escribiría dos veces.
  const name = def.labels.name;
  // DOS TEXTOS, Y EL QUE TOCA: lo conseguido se cuenta en pasado («Te has terminado 100 juegos») y lo que falta
  // se pide en imperativo («Termina 100 juegos»). Con un solo texto, una de las dos mitades de la lista se leía
  // mal: en imperativo, una medalla ya ganada parecía una tarea pendiente.
  const condition = earned && mine ? def.labels.done : def.labels.condition;

  // «Sin cabos sueltos» mide un porcentaje y las demás cuentan cosas: el progreso tiene que decirlo o «42 de 75»
  // se lee como 42 juegos.
  const isPercent = def.id === 'cobertura';
  const pct = next !== null && next > 0 ? Math.max(0, Math.min(100, Math.round((value / next) * 100))) : 100;
  const progress = next !== null
    ? (isPercent ? ACHIEVEMENTS_UI.progressPercent(value, next) : ACHIEVEMENTS_UI.progress(value, next))
    : ACHIEVEMENTS_UI.maxed;

  const classes = ['ach-row', earned ? '' : 'is-locked', isGlobal ? 'is-global' : '', isGlobal && earned ? 'is-owned' : '']
    .filter(Boolean)
    .join(' ');

  // EL PROGRESO SALE DEL CUERPO Y SE VA A SU PROPIO RENGLÓN. Iba pegado bajo la condición y compartía columna con
  // ella, así que en una fila apretada el «31 de 50 · 62 %» quedaba encajado entre el texto y la fecha. Ahora
  // arranca a MEDIO CAMINO de la fila (lo coloca la hoja) y respira: el texto manda arriba, el avance abajo.
  const showProgress = (!isGlobal || global?.self) && !earned && next !== null && value > 0;

  // EL FONDO DE LA FILA GLOBAL SE LLENA CON EL PORCENTAJE. Es la lista ordenada por esa cifra, así que el relleno
  // convierte el orden en algo que se ve sin leer: la escalera baja sola de arriba abajo. Sutil a propósito —es
  // el dato de fondo, no el contenido— y va como variable para que el tema pueda vestirlo (`achievements.scss`).
  const fill = isGlobal && rarity ? `${Math.max(0, Math.min(100, rarity.percent))}%` : undefined;

  return (
    // `data-r` EN LA FILA y no solo en su rótulo: de ahí sale `--rc`, el color de la rareza con el que la hoja
    // pinta el canto templado del borde izquierdo y el progreso. La dificultad dejó de ser un adorno de la
    // esquina derecha para ser el canto de la fila, y eso lo tiene que saber la fila entera.
    <li className={classes} data-r={def.rarity} style={fill ? ({ '--fill': fill } as CSSProperties) : undefined}>
      {/* `list` (34 px) en LAS DOS VISTAS. La medalla manda en la altura de la fila: a 48 la lista de 334 entradas
          se estiraba a quince pantallas, y a 34 sigue teniendo dibujo, filo y píldora legibles. El tamaño se
          decide aquí y no en la hoja, para que no haya dos sitios donde cambiarlo. */}
      <AchievementMedal def={def} level={level} size="list" date={date} />

      <div className="ach-row-body">
        <p className="ach-row-name">{name}</p>
        <p className="ach-row-condition">{condition}</p>
      </div>

      <div className="ach-row-meta">
        {/* El día del desbloqueo. Sin fecha deducible el hueco se queda VACÍO: no pone «desconocido» ni inventa
            un día, que es lo que haría creer que la app sabe algo que no sabe. */}
        {isGlobal ? (
          /* «CONSEGUIDO» YA NO SE LEE, SE VE: el recuadro, el nombre encendido y el relleno teñido dicen lo mismo
             que esa palabra, y repetirlo en cada una de las 334 filas gastaba la línea que debe llevar la cifra
             por la que está ordenada la lista.
             PERO SIGUE AHÍ PARA QUIEN NO VE EL RECUADRO. El recuadro es forma y color, y eso no puede ser la
             única señal de nada: el texto se va a `sr-only`, así que un lector de pantalla recorre la lista
             sabiendo cuáles son suyos exactamente igual que antes. */
          <span className="ach-row-owned sr-only">
            {global?.self
              ? (earned ? ACHIEVEMENTS_UI.ownedSelf : ACHIEVEMENTS_UI.notOwnedSelf)
              : (earned ? ACHIEVEMENTS_UI.owned : ACHIEVEMENTS_UI.notOwned)}
          </span>
        ) : (
          /* SOLO LO CONSEGUIDO LLEVA FECHA, y lo que no se tiene NO LLEVA NADA. Ponía «Bloqueado» en la columna
             del día, que es la lectura de Steam al revés: un logro sin conseguir no tiene fecha porque no ha
             pasado, no porque esté en un estado que haya que anunciar. La medalla apagada, el nombre en gris y
             el progreso ya lo dicen tres veces, y el nombre accesible de la medalla lo dice con la palabra. */
          earned ? (
            <span
              className="ach-row-date"
              title={date && dateFromFloor ? ACHIEVEMENTS_UI.floorDateTitle : (date ? undefined : ACHIEVEMENTS_UI.noDateTitle)}
            >
              {date || ACHIEVEMENTS_UI.noDate}
            </span>
          ) : null
        )}

        {/* LA PALABRA NO SE PINTA YA: la dice el canto de la fila, que es la misma escala del aura de la medalla
            y está en el sitio fijo de todas las filas. Pero el color no puede ser la única señal de nada —es
            justo el motivo por el que esta palabra existe— así que se queda para lector de pantalla. */}
        <span className="ach-row-rarity sr-only">{ACHIEVEMENT_RARITY_LABELS[def.rarity]}</span>
        {rarity ? (
          <span className="ach-row-share" title={ACHIEVEMENTS_UI.rarityPercent(rarity.percent, rarity.holders, rarity.sample)}>
            {/* A la vista, la cifra sola: es lo único que cambia de una fila a otra, y la frase completa repetida
                334 veces convertía la columna en un párrafo. El denominador sigue estando —en el rótulo del
                puntero y, entero, para quien lee con lector de pantalla—, porque es lo que impide leer «el 100 %»
                como una afirmación sobre todo el mundo. */}
            <span aria-hidden="true">{ACHIEVEMENTS_UI.rarityShare(rarity.percent)}</span>
            <span className="sr-only">
              {ACHIEVEMENTS_UI.rarityPercent(rarity.percent, rarity.holders, rarity.sample)}
            </span>
          </span>
        ) : null}
      </div>

      {/* EL RENGLÓN DEL PROGRESO, fuera del cuerpo y fuera de la meta: es una fila propia de la rejilla, así que
          puede empezar a media anchura sin que el texto ni la fecha le dejen sitio a codazos.
          En la vista global solo sale en TU perfil: el espejo de otra persona lleva los logros CONSEGUIDOS y
          nada más, así que de una amistad no se sabe por dónde va —ni debe saberse, que es la línea del §3—. */}
      {showProgress ? (
        <p className="ach-row-progress">
          <span className="ach-row-bar" aria-hidden="true">
            <i style={{ '--pct': `${pct}%` } as CSSProperties} />
          </span>
          <span className="ach-row-progress-text">{progress}</span>
        </p>
      ) : null}
    </li>
  );
});
