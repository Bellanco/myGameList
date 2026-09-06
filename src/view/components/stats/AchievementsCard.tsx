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

      {/* TODAS, sin tope: la rejilla envuelve y se reparte el ancho sola. Y al final, la baldosa que lleva al
          listado: del tamaño de una medalla y en la misma fila, para que el acceso no dependa de un enlace
          pequeño perdido debajo. */}
      <AchievementStrip items={items} size="md" onOpen={onOpen} onSeeAll={onOpen} seeAllLabel={ACHIEVEMENTS_UI.cardAction} />
    </div>
  );
});
