import { memo, type CSSProperties } from 'react';
import { formatCount } from './format';

/** Una de las dos series: su rótulo en la leyenda y el color de lista que la pinta (`--stats-<list>`). */
export interface DumbbellSeries {
  label: string;
  list: 'c' | 'v' | 'e' | 'p' | 'd';
}

export interface DumbbellRow {
  tag: string;
  /** Valor de la PRIMERA serie (`series[0]`). */
  first: number;
  /** Valor de la SEGUNDA serie (`series[1]`). */
  second: number;
  /** Cifra al final de la fila (el porcentaje de abandono, p. ej.). Sin ella, la fila no reserva ese hueco. */
  note?: string;
}

/**
 * Mancuernas: por cada etiqueta, dos puntos unidos por una varilla sobre un eje común de número de juegos.
 *
 * Dice de una vez las dos cosas que antes necesitaban dos gráficos: el VOLUMEN (dónde caen los puntos en el
 * eje) y la PROPORCIÓN (cuánto separa a los dos puntos). Y al ir sobre un eje compartido, las etiquetas se
 * comparan entre sí sin tener que leer los números.
 *
 * Nació para terminados frente a abandonados y hoy compara también lo que deseas con lo que esperas, así que las
 * dos series llegan de fuera con su rótulo y su color de lista. La varilla va del color de la primera al de la
 * segunda.
 */
export const Dumbbell = memo(function Dumbbell({
  rows,
  series,
}: {
  rows: DumbbellRow[];
  series: readonly [DumbbellSeries, DumbbellSeries];
}) {
  if (rows.length === 0) return null;

  // El eje lo fijan LAS DOS series, no solo una: con un género que se deja más veces de las que se acaba (5
  // abandonos frente a 2 finales), el máximo salía de la serie equivocada y su punto se colocaba en el 138% —fuera
  // del carril, fuera de la tarjeta y con scroll horizontal en toda la vista—.
  const max = Math.max(...rows.flatMap((row) => [row.first, row.second]), 1);
  // Margen a los lados: el punto tiene diámetro y su cifra va centrada encima, así que un valor colocado en el
  // 100% exacto se salía del carril —y con él, de la tarjeta y de la pantalla, forzando scroll horizontal.
  const INSET = 6;
  const at = (value: number) => INSET + (value / max) * (100 - INSET * 2);
  const [first, second] = series;
  const colors = { '--db-first': `var(--stats-${first.list})`, '--db-second': `var(--stats-${second.list})` } as CSSProperties;
  const withNotes = rows.some((row) => row.note !== undefined);

  return (
    <>
      <ul className={`dumbbell${withNotes ? '' : ' is-plain'}`} style={colors}>
        {rows.map((row, index) => (
          // EMPATE: los dos puntos caen en el mismo sitio y el de encima tapaba al otro, así que parecía que una
          // de las series no tenía nada. Se pinta UN punto partido con los dos colores y una sola cifra.
          <li key={row.tag} className={row.first === row.second ? 'is-tied' : undefined} style={{ '--i': index } as CSSProperties}>
            <span className="dumbbell-tag" title={row.tag}>{row.tag}</span>
            <span className="dumbbell-track">
              <span
                className="dumbbell-bar"
                style={{ left: `${at(Math.min(row.first, row.second))}%`, width: `${Math.abs(at(row.second) - at(row.first))}%` }}
              />
              <span className="dumbbell-dot is-first" style={{ left: `${at(row.first)}%` }}>
                <span className="dumbbell-num">{formatCount(row.first)}</span>
              </span>
              <span className="dumbbell-dot is-second" style={{ left: `${at(row.second)}%` }}>
                <span className="dumbbell-num">{formatCount(row.second)}</span>
              </span>
            </span>
            {withNotes ? <span className="dumbbell-rate">{row.note}</span> : null}
          </li>
        ))}
      </ul>

      <ul className="stats-legend">
        {/* De la segunda serie a la primera: así se leía cuando las series eran fijas (terminados antes que
            abandonados), y quien pasa las series las ordena contando con ello. */}
        <li><span className={`stats-legend-dot is-${second.list}`} aria-hidden="true" />{second.label}</li>
        <li><span className={`stats-legend-dot is-${first.list}`} aria-hidden="true" />{first.label}</li>
      </ul>
    </>
  );
});
