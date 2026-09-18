import { memo } from 'react';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { SCORE_SCALES } from '../../../core/utils/scoreScale';
import { persistScoreScale } from '../../../model/repository/scorePreferenceRepository';
import { useScoreScale } from '../../hooks/useScoreScale';
import { Icon } from '../Icon';
import { SharedReviewsCard } from '../SharedReviewsCard';
import { StarRating } from '../StarRating';
import { ScoreRing } from '../ScoreRing';
import { AppearanceSettings } from '../AppearanceSettings';

interface PersonalizationSettingsProps {
  scoreScaleUid: string | null; // uid de Google (para gatear/guardar la escala); null → candado
  /** ¿Tiene espacio social? De ahí salen el nick y el rango, así que sin él no hay enlaces que gestionar. */
  hasSocialProfile: boolean;
}

/**
 * «Personalización» — el primero de los cuatro grupos de Ajustes: cómo se ve la aplicación, cómo se puntúa y
 * qué has publicado.
 *
 * TRES BLOQUES A LO ANCHO, en el orden en que se tocan: el TEMA arriba —es lo que cambia la pantalla entera y
 * lo único que pide sitio de verdad—, debajo las preferencias sueltas (cómo se puntúa y los cinco
 * interruptores) y al final lo que has publicado. Nada de dos columnas de tarjetas: partir la pantalla dejaba
 * la apariencia en una columna estrecha —donde vuelve a apilarse— con medio escritorio vacío al lado. Lo que
 * reparte aquí es el CONTENIDO de cada bloque, que se estira a lo ancho hasta llenarlo.
 *
 * LA APARIENCIA TIENE TARJETA PROPIA, y no es un detalle de maquetación. Antes vivía DENTRO de la tarjeta de la
 * escala de nota, bajo su `inert`: quien no tenía sesión de Google se quedaba sin paleta, sin modo claro, sin
 * mayúsculas y sin carátulas, aunque ninguna de esas preferencias necesite cuenta —viven en `localStorage` y
 * solo se replican a la nube si hay sesión—. Separadas, el candado queda donde de verdad hace falta.
 *
 * A esta pantalla solo se llega con espacio social (la puerta la ponen el menú y `App`), así que en la práctica
 * siempre hay sesión; el candado de la escala se queda por el instante en que la sesión aún no ha resuelto.
 */
export const PersonalizationSettings = memo(function PersonalizationSettings({ scoreScaleUid, hasSocialProfile }: PersonalizationSettingsProps) {
  const scoreScale = useScoreScale();
  const scoreScaleLabels = SETTINGS_UI.scoreScale;

  return (
    <section className="settings-hub settings-personalization" aria-label={SETTINGS_UI.groups.personalization.title}>
      <div className="settings-card settings-card-themes">
        <h2>{SETTINGS_UI.groups.themes}</h2>
        <AppearanceSettings only="theme" />
      </div>

      <div className="settings-card settings-card-score">
        <h2>{SETTINGS_UI.groups.preferences}</h2>
        {!scoreScaleUid ? (
          <p className="score-scale-locked">
            <Icon name={COMMON_ICONS.lock} />
            {scoreScaleLabels.lockedHint}
          </p>
        ) : null}
        <div className={`score-scale-choice${scoreScaleUid ? '' : ' is-locked'}`} role="radiogroup" aria-label={scoreScaleLabels.groupAria}>
          {SCORE_SCALES.map((opt) => {
            const isStars = opt === 'stars';
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={scoreScale === opt}
                disabled={!scoreScaleUid}
                className={`score-scale-opt${scoreScale === opt ? ' on' : ''}`}
                onClick={() => { if (scoreScaleUid) void persistScoreScale(scoreScaleUid, opt); }}
              >
                <span className="score-scale-dot" aria-hidden="true" />
                <span className="score-scale-txt">
                  <b>{isStars ? scoreScaleLabels.starsLabel : scoreScaleLabels.gradeLabel}</b>
                  <span>{isStars ? scoreScaleLabels.starsHint : scoreScaleLabels.gradeHint}</span>
                </span>
                <span className="score-scale-sample" aria-hidden="true">
                  {isStars ? <StarRating value={4} /> : <ScoreRing grade={80} />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Los cinco interruptores comparten tarjeta con la escala: son la misma clase de decisión —una
            preferencia de dos respuestas— y juntos llenan a lo ancho lo que por separado eran dos tarjetas a
            medias. */}
        <AppearanceSettings only="toggles" />
      </div>

      {/* Los enlaces públicos van aquí y no en «Integración»: no son una preferencia ni un canal de datos, son
          contenido tuyo publicado en internet, y se gestionan al lado de lo que decides mostrar. */}
      <SharedReviewsCard enabled={hasSocialProfile} />
    </section>
  );
});
