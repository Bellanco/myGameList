import { memo } from 'react';
import { AchievementSprite } from '../AchievementSprite';
import { AchievementStrip, type StripItem } from './AchievementStrip';
import { AchievementFigures } from './AchievementFigures';
import { formatUnlockDate } from './AchievementsScreen';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import type { AchievementDef, AchievementState, AchievementSummary } from '../../../core/achievements/types';

interface AchievementsCardProps {
  summary: AchievementSummary;
  earned: ReadonlyArray<{ def: AchievementDef; state: AchievementState }>;
  onOpen: () => void;
}

/**
 * EL APARTADO DEL PANEL, justo debajo de «Lo mejor de tu biblioteca».
 *
 * El sitio no es casual: `top` es lo que la biblioteca tiene de mejor y los logros son lo que su dueño ha hecho
 * con ella; leídos seguidos, cuentan la misma historia desde los dos lados.
 *
 * Y lleva poco a propósito —las dos cifras, la barra y las últimas medallas— porque el panel ya está lleno y los
 * logros no son su tema: lo que hay aquí es el titular, y el detalle está en `/logros`.
 */
/** Cuántas medallas caben sin que el apartado se coma el panel: dos filas holgadas más la baldosa del final. */
const CARD_MEDALS = 23;

export const AchievementsCard = memo(function AchievementsCard({ summary, earned, onOpen }: AchievementsCardProps) {
  const items: StripItem[] = earned.map(({ def, state }) => ({
    id: def.id,
    level: state.level,
    date: formatUnlockDate(state.unlockedAt),
  }));

  return (
    <div className="stats-card ach-card">
      <AchievementSprite />
      <h2>{ACHIEVEMENTS_UI.title}</h2>
      <p className="stats-card-sub">{ACHIEVEMENTS_UI.subtitle}</p>

      <AchievementFigures summary={summary} />

      {/* LAS ÚLTIMAS, NO TODAS. Aquí no había tope —con 32 logros la rejilla envolvía en dos filas y se
          repartía el ancho sola—, pero desde que cada escalón es un logro, «todas las conseguidas» son ciento y
          pico medallas con su filtro cada una, y este apartado es el titular de un panel que ya está lleno. El
          resto no se pierde: la baldosa del final las cuenta y lleva al listado, que es donde se miran. */}
      <AchievementStrip
        items={items}
        limit={CARD_MEDALS}
        size="md"
        onOpen={onOpen}
        onSeeAll={onOpen}
        seeAllLabel={ACHIEVEMENTS_UI.cardAction}
      />
    </div>
  );
});
