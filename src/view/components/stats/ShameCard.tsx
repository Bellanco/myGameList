import { memo } from 'react';
import { useStatsLabels } from './statsVoice';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { TagRanking } from './TagRanking';
import { TagChips } from './TagChips';
import { Dumbbell } from './Dumbbell';
import { GameRefList } from './GameRefList';
import { formatDecimal, formatHours } from './format';
import type { ShameSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

/**
 * Apartado de la lista de la vergüenza. Vive solo en "General": los abandonos no llevan año (el formulario no
 * pide "Años completado" fuera de completados), así que no se pueden repartir por pestaña.
 *
 * Las razones van en nube de etiquetas y el índice de abandono en barras de porcentaje —no de recuento—, para
 * que el apartado no sea otra tanda de barras iguales a las de arriba.
 */
export const ShameCard = memo(function ShameCard({
  shame,
  scale,
  publicOnly = false,
}: {
  shame: ShameSummary;
  scale: ScoreScale;
  /**
   * El resumen se ha calculado con la PROYECCIÓN PÚBLICA (ver `friendStatsData`): fuera lo que ese canal no
   * publica —horas, la marca de "merece otra oportunidad", las razones de abandono y las fechas de los últimos en
   * caer—. Enseñarlo con ceros y huecos haría creer que ese amigo no anota nada, cuando lo que pasa es que eso no
   * ha llegado.
   */
  publicOnly?: boolean;
}) {
  const labels = useStatsLabels();
  const L = labels.shame;
  const TILES = labels.tiles;
  if (shame.total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? shame.avgGrade : shame.avgGrade / 20;

  return (
    <>
      <div className="stats-tiles">
        <StatTile label={L.total} value={<CountUp value={shame.total} />} />
        {/* Sin horas no hay cifra de tiempo: pasa con la proyección pública y también con quien oculta su tiempo
            de juego, y en los dos casos un "0 h" se leería como un dato en vez de como una ausencia. */}
        {publicOnly || shame.hours === 0 ? null : (
          <StatTile label={L.hours} value={<CountUp value={shame.hours} format={formatHours} />} unit="h" />
        )}
        {shame.scored > 0 ? (
          <StatTile
            label={L.avgGrade}
            value={<CountUp value={avgInScale} format={formatDecimal} />}
            unit={scale === 'grade' ? TILES.outOf100 : TILES.outOf5}
            hint={TILES.avgGradeHint(shame.scored)}
          />
        ) : null}
        {publicOnly ? null : <StatTile label={L.retry} value={<CountUp value={shame.retry} />} />}
      </div>

      <section>
        {/* Sin géneros con recorrido suficiente no hay mancuernas que dibujar (dos juegos no son una
            tendencia): en ese caso se enseña al menos qué géneros aparecen entre los abandonos. */}
        {shame.abandonRate.length ? (
          <>
            <h3>{L.rate}</h3>
            <Dumbbell rows={shame.abandonRate} />
          </>
        ) : (
          <>
            <h3>{L.genres}</h3>
            <TagRanking tags={shame.genres} />
          </>
        )}
      </section>

      {publicOnly ? null : (
        <div className="stats-split">
          <section>
            <h3>{L.reasons}</h3>
            {shame.reasons.length ? <TagChips tags={shame.reasons} tone="danger" /> : <p className="stats-empty">{L.noReasons}</p>}
          </section>
          <section>
            <h3>{L.recent}</h3>
            <GameRefList games={shame.recent} meta={shame.hours > 0 ? 'hours' : 'grade'} />
          </section>
        </div>
      )}
    </>
  );
});
