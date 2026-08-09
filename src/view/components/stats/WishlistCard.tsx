import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { STATS_SHORTLIST } from '../../../core/stats/computeStats';
import { StatTile } from './StatTile';
import { TagBars } from './TagBars';
import { GameRefList } from './GameRefList';
import { formatCount, formatDecimal } from './format';
import type { WishlistSummary } from '../../../core/stats/types';
import type { ScoreScale } from '../../../core/utils/scoreScale';

const L = UI_MESSAGES.stats.wishlist;

/**
 * Apartado de la lista de próximos. También es de "General": un juego que aún no has jugado no pertenece a
 * ningún año. Su nota NO se mezcla con las valoraciones: ahí el campo es el interés previo.
 */
export const WishlistCard = memo(function WishlistCard({ wishlist, scale }: { wishlist: WishlistSummary; scale: ScoreScale }) {
  if (wishlist.total === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const avgInScale = scale === 'grade' ? wishlist.interest.avgGrade : wishlist.interest.avgGrade / 20;

  return (
    <>
      <div className="stats-tiles">
        <StatTile label={L.total} value={formatCount(wishlist.total)} />
        {wishlist.interest.count > 0 ? (
          <StatTile
            label={L.interest}
            value={formatDecimal(avgInScale)}
            unit={scale === 'grade' ? UI_MESSAGES.stats.tiles.outOf100 : UI_MESSAGES.stats.tiles.outOf5}
            hint={L.interestHint(wishlist.interest.count)}
          />
        ) : null}
        {wishlist.deck > 0 ? <StatTile label={L.deck} value={formatCount(wishlist.deck)} /> : null}
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.genres}</h3>
          <TagBars tags={wishlist.genres} limit={6} />
        </section>
        <section>
          <h3>{L.platforms}</h3>
          <TagBars tags={wishlist.platforms} limit={6} />
        </section>
      </div>

      <div className="stats-split">
        <section>
          <h3>{L.oldest}</h3>
          <GameRefList games={wishlist.oldest} meta="since" />
        </section>
        {/* Con una lista corta, "los últimos en llegar" serían los mismos juegos en orden inverso: enseñar dos
            veces lo mismo hace parecer que hay más información de la que hay. */}
        {wishlist.total > STATS_SHORTLIST ? (
          <section>
            <h3>{L.recent}</h3>
            <GameRefList games={wishlist.recent} meta="since" />
          </section>
        ) : null}
      </div>
    </>
  );
});
