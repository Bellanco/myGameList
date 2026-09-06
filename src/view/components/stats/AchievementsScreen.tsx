import { memo, type ReactNode } from 'react';
import { AchievementRow } from './AchievementRow';
import { AchievementFigures } from './AchievementFigures';
import { AchievementSprite } from '../AchievementSprite';
import { HubBackButton } from '../socialhub/HubBackButton';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import { Icon } from '../Icon';
import type { AchievementItem, AchievementSummary } from '../../../core/achievements/types';

/** Fecha corta y legible. Sin hora: el día basta, y el minuto diría a qué horas usas la app (§5.3). */
export function formatUnlockDate(ms: number): string {
  if (!ms || ms <= 0) return '';
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface AchievementsScreenProps {
  /**
   * UNA LISTA, sin agrupar por familia. Las categorías partían el listado en cinco tramos y dentro de cada uno
   * volvía a empezar el orden, así que había que recorrer la pantalla entera para saber qué llevas: la pregunta
   * que se hace uno al abrirla es «qué tengo y qué me falta», no «qué tengo de cada tipo». Primero lo conseguido
   * y luego lo que no, como en Steam. La familia sigue en el catálogo, para el filtro del feed y el denominador.
   */
  items: readonly AchievementItem[];
  summary: AchievementSummary;
  /** Porcentaje de gente que tiene cada logro, y sobre cuántos. `null` = muestra insuficiente (§6.6bis). */
  rarity: { percent: ReadonlyMap<string, number>; sample: number } | null;
  /** De quién son. Vacío = tuyos. */
  owner?: string;
  /**
   * Vista GLOBAL: el catálogo entero ordenado por lo común que es cada logro, con recuadro en los que tiene el
   * dueño de este perfil. Las filas cambian de forma (ver `AchievementRow`) y las dos cifras se callan — aquí no
   * se mide a nadie, se mide al catálogo.
   */
  global?: { self: boolean };
  /** Rótulo de la cabecera cuando no es el listado de siempre. */
  heading?: string;
  /** Texto bajo el título. */
  lead?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Ir y volver de los logros globales. Es el ÚNICO acceso a esa vista. */
  onToggleGlobals?: () => void;
  /** Rótulo del botón cuando se está EN los globales: nombra a dónde vuelve («Tus logros» / «Sus logros»). */
  globalsBackLabel?: string;
  /** Cuerpo alternativo, para cuando no hay lista que pintar. */
  children?: ReactNode;
}

/**
 * EL LISTADO DE LOGROS, con la forma de Steam: imagen, nombre, descripción y el día en que se desbloqueó.
 *
 * UNA SOLA PANTALLA PARA LAS TRES VISTAS —los tuyos, los de una amistad y el catálogo global— y para los dos
 * sitios desde los que se llega: `/logros` y el hub social. Lo único que cambia es de dónde salen los datos, que
 * es el patrón que ya usan `StatsReviews` y `ProfileReviewsList`: una lista, varias fuentes.
 *
 * Y EL ARMAZÓN ES EL DE LAS DEMÁS PANTALLAS de la app —`hub-screen` con su tarjeta, su cabecera con icono y su
 * fila de acciones—, exactamente el que monta `StatsReviews` para tus reseñas. No es cosmética: esta pantalla se
 * abre indistintamente desde el panel y desde el hub, y con un armazón propio se notaría el salto justo en la
 * pantalla que existe para no notarlo.
 *
 * MONTA EL SPRITE. Los 38 símbolos entran con esta pantalla y con la ficha del hub, nunca con `App.tsx`: son dos
 * chunks perezosos distintos, así que el empaquetador lo sacará a un chunk compartido, que es lo correcto.
 */
export const AchievementsScreen = memo(function AchievementsScreen({
  items,
  summary,
  rarity,
  owner,
  global,
  heading,
  lead,
  onBack,
  backLabel,
  onToggleGlobals,
  globalsBackLabel = ACHIEVEMENTS_UI.ownAchievements,
  children,
}: AchievementsScreenProps) {
  const title = heading || (owner ? ACHIEVEMENTS_UI.titleOf(owner) : ACHIEVEMENTS_UI.title);
  const subtitle = lead ?? (global ? ACHIEVEMENTS_UI.globalLead : ACHIEVEMENTS_UI.subtitle);

  return (
    <section className="hub-hub hub-screen ach-screen" aria-label={title}>
      <AchievementSprite />
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="chess-knight" className="hub-hub-icon" />
            <h2>{title}</h2>
          </div>
          <p>{subtitle}</p>
        </header>

        <div className="hub-screen-actions" aria-label={title}>
          <div className="hub-screen-actions-left">
            {onBack ? <HubBackButton onBack={onBack} label={backLabel || ACHIEVEMENTS_UI.back} /> : null}
            {/* LOS LOGROS GLOBALES se abren DESDE AQUÍ y solo desde aquí. Estuvieron en la barra de la ficha, y
                ahí competían con «sus reseñas» y «sus estadísticas» sin ser de la misma familia: aquello dice
                QUÉ mirar de esa persona, y esto es otra vista de la pantalla en la que ya estás. */}
            {onToggleGlobals ? (
              <button
                className={`btn btn-secondary ${global ? 'is-active' : ''}`.trim()}
                type="button"
                aria-pressed={Boolean(global)}
                onClick={onToggleGlobals}
              >
                <Icon name={global ? 'chess-knight' : 'star-olive-branches'} />
                {/* El botón NOMBRA SU DESTINO, no la dirección. Decía «Volver a los logros» y en las dos vistas
                    sigues en los logros: lo que cambia es cuáles. */}
                {global ? globalsBackLabel : ACHIEVEMENTS_UI.globalButton}
              </button>
            ) : null}
          </div>
        </div>

        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-detail-metadata">
            {/* La cifra va TAMBIÉN en la vista global: ahí la pregunta es «cuánto de este catálogo tengo», y
                responderla arriba es lo que convierte la lista en algo que se puede situar. */}
            <AchievementFigures summary={summary} />

            {children}

            {!children && items.length === 0 ? (
              <div className="ach-empty">
                <strong>{ACHIEVEMENTS_UI.empty.title}</strong>
                <p>{ACHIEVEMENTS_UI.empty.body}</p>
              </div>
            ) : null}

            <ul className="ach-list">
              {items.map(({ def, state }) => {
                const holders = rarity?.percent.get(def.id);
                return (
                  <AchievementRow
                    key={def.id}
                    def={def}
                    level={state.level}
                    value={state.value}
                    next={state.next}
                    date={formatUnlockDate(state.unlockedAt)}
                    global={global}
                    rarity={
                      rarity && typeof holders === 'number'
                        ? {
                            percent: holders,
                            holders: Math.round((holders / 100) * rarity.sample),
                            sample: rarity.sample,
                          }
                        : null
                    }
                  />
                );
              })}
            </ul>
          </div>
        </article>
      </div>
    </section>
  );
});
