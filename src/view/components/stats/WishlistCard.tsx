import { memo } from 'react';
import { useStatsLabels } from './statsVoice';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { PolarRose } from './PolarRose';
import { DotMatrix } from './DotMatrix';
import { WaitingTimeline } from './WaitingTimeline';
import { formatDecimal } from './format';
import type { WishlistSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

/**
 * Apartado de la lista de próximos. También es de "General": un juego que aún no has jugado no pertenece a
 * ningún año. Su nota NO se mezcla con las valoraciones: ahí el campo es el interés previo.
 */
export const WishlistCard = memo(function WishlistCard({
  wishlist,
  scale,
  publicOnly = false,
}: {
  wishlist: WishlistSummary;
  scale: ScoreScale;
  /**
   * Calculado con la proyección pública: la fecha de llegada a la lista no viaja por ese canal, así que no hay
   * línea de tiempo que dibujar (ver `friendStatsData`).
   */
  publicOnly?: boolean;
}) {
  const labels = useStatsLabels();
  const L = labels.wishlist;
  const TILES = labels.tiles;
  if (wishlist.total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? wishlist.interest.avgGrade : wishlist.interest.avgGrade / 20;

  return (
    <>
      <div className="stats-tiles">
        <StatTile label={L.total} value={<CountUp value={wishlist.total} />} />
        {wishlist.interest.count > 0 ? (
          <StatTile
            label={L.interest}
            value={<CountUp value={avgInScale} format={formatDecimal} />}
            unit={scale === 'grade' ? TILES.outOf100 : TILES.outOf5}
            hint={L.interestHint(wishlist.interest.count)}
          />
        ) : null}
        {wishlist.deck > 0 ? <StatTile label={L.deck} value={<CountUp value={wishlist.deck} />} /> : null}
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.genres}</h3>
          <PolarRose tags={wishlist.genres} />
        </section>
        <section>
          <h3>{L.platforms}</h3>
          <DotMatrix tags={wishlist.platforms} />
        </section>
      </div>

      {/* Una sola línea de tiempo en lugar de dos rankings: enseña a la vez quién lleva años esperando y quién
          acaba de entrar, que es lo que antes contaban "los que más esperan" y "los últimos en llegar". */}
      {publicOnly ? null : (
        <section>
          <h3>{L.oldest}</h3>
          <WaitingTimeline games={wishlist.games} />
        </section>
      )}
    </>
  );
});
