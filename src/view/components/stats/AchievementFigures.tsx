import { memo, type CSSProperties } from 'react';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import type { AchievementSummary } from '../../../core/achievements/types';

/**
 * LA CIFRA: cuántos logros del catálogo llevas, y qué parte es eso del total.
 *
 * Componente propio porque se pinta en TRES sitios —el apartado del panel, el listado y la vista global— y las
 * tres veces dice exactamente lo mismo. Estuvo escrita dos veces y ya empezaba a divergir.
 *
 * EL NIVEL DE PERFIL NO ESTÁ AQUÍ, y es una retirada deliberada, no un olvido: los puntos por rareza y la curva
 * por tramos siguen calculándose y probándose en `core/achievements/summary` —`summary.level`, `points`,
 * `pointsIntoLevel`, `pointsToNext`—, pero no se enseñan mientras no esté decidido cómo se presenta. Volver a
 * ponerlo es añadir su bloque aquí; el dato ya está.
 *
 * La barra dice la MISMA cosa que el número, así que va `aria-hidden` y la cifra la lee un lector de pantalla
 * del texto: una `progressbar` con el mismo valor sería decirlo dos veces.
 */
export const AchievementFigures = memo(function AchievementFigures({ summary }: { summary: AchievementSummary }) {
  return (
    <div className="ach-figures">
      <p className="ach-figure">
        <span className="ach-figure-label">{ACHIEVEMENTS_UI.countLabel}</span>
        <strong className="ach-figure-value">{ACHIEVEMENTS_UI.count(summary.earned, summary.total)}</strong>
        {/* «del catálogo actual», con esas palabras: añadir logros baja la fracción de todo el mundo —el mismo
            efecto que tiene en Steam publicar logros de DLC— y eso se asume y se dice, no se disimula congelando
            la fracción por versión, que sería inventarse un número. */}
        <span className="ach-figure-hint">{ACHIEVEMENTS_UI.countHint(summary.percent)}</span>
        <span className="ach-figure-bar" aria-hidden="true">
          <i style={{ '--pct': `${summary.percent}%` } as CSSProperties} />
        </span>
      </p>
    </div>
  );
});
