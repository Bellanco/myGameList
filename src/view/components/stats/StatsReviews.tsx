import { memo, useMemo } from 'react';
import { STATS_UI } from '../../../core/constants/statsLabels';
import { SOCIAL_UI } from '../../../core/constants/socialLabels';
import { Icon } from '../Icon';
import { HubBackButton } from '../socialhub/HubBackButton';
import { ProfileReviewsList, type ReviewEntry } from '../socialhub/ProfileReviewsList';
import { SocialProfileReviewScreen } from '../socialhub/SocialProfileReviewScreen';
import { RelatedReviews } from '../socialhub/RelatedReviews';
import { ShareReviewButton } from './ShareReviewButton';
import { rankRelatedReviews, type RelatedReviewCandidate } from '../../../core/social/relatedReviews';
import { gameTitleKey } from '../../../core/utils/gameTitleKey';
import { resolveGrade, starsFromGrade } from '../../../core/utils/scoreScale';
import { TAB_IDS, type GameItem, type TabData } from '../../../model/types/game';

const L = STATS_UI.reviews;

/** Tus reseñas, tomadas de las listas en memoria: cualquiera con texto, esté en la lista que esté. */
function collectReviews(games: TabData): Array<ReviewEntry & { game: GameItem; effectiveGrade: number }> {
  const items: Array<ReviewEntry & { game: GameItem; effectiveGrade: number }> = [];

  for (const tab of TAB_IDS) {
    for (const game of games[tab] || []) {
      const reviewText = String(game.review || '').trim();
      if (!reviewText || !game?.name?.trim()) continue;
      const effectiveGrade = resolveGrade(game);
      items.push({
        id: game.id,
        gameName: game.name.trim(),
        rating: starsFromGrade(effectiveGrade),
        grade: typeof game.grade === 'number' ? game.grade : null,
        // Todo lo que no está en la lista del completista es un juego que NO te has pasado (abandonado, en
        // curso o pendiente), y eso cambia cómo se lee la nota: la lista lo avisa.
        unfinished: tab !== 'c',
        reviewText,
        ts: Number(game._ts) || 0,
        game,
        effectiveGrade,
      });
    }
  }

  // De mejor a peor nota, que es como se leen en el panel; a igualdad, por nombre para que el orden sea estable.
  //
  // Ordena por la nota EFECTIVA (`resolveGrade`), no por el campo `grade`: quien puntuó antes de la escala fina
  // solo tiene `score` 0–5 y su `grade` viene a null. Ordenar por el campo crudo mandaba esas reseñas al fondo
  // aunque el medallón las pintara con un 100, así que dos juegos con la misma nota acababan en extremos
  // opuestos de la lista.
  return items.sort((a, b) => b.effectiveGrade - a.effectiveGrade || a.gameName.localeCompare(b.gameName, 'es'));
}

interface StatsReviewsProps {
  games: TabData;
  /** Juego cuya reseña se abre a pantalla completa; 0 = la lista. */
  gameId: number;
  onBack: () => void;
  onOpenReview: (gameId: number) => void;
  /** Volver de una reseña concreta a donde se abrió. */
  onBackToList: () => void;
  /** ¿Ese "donde se abrió" es el panel? Cambia solo el rótulo del botón, para no prometer otra pantalla. */
  backToPanel?: boolean;
}

/**
 * TUS reseñas dentro del panel de estadísticas.
 *
 * No monta una lista nueva: reutiliza la del hub social (`ProfileReviewsList`) y su pantalla de detalle
 * (`SocialProfileReviewScreen`), que ya sabían pintar esto para el perfil de cualquiera. Lo único propio es de
 * dónde salen los datos —aquí, de tus listas en memoria, con el texto completo— y a dónde vuelve el botón de
 * atrás, que es al panel.
 *
 * Va por ruta propia y no enlazando al hub social porque tus reseñas son tuyas: enlazar allí las habría dejado
 * detrás del asistente de configuración del espacio social para quien no lo tenga montado.
 */
export const StatsReviews = memo(function StatsReviews({ games, gameId, onBack, onOpenReview, onBackToList, backToPanel = false }: StatsReviewsProps) {
  const reviews = useMemo(() => collectReviews(games), [games]);
  const open = gameId > 0 ? reviews.find((entry) => entry.id === gameId) : undefined;

  /**
   * Los análisis que se sugieren al pie del que está abierto. Todos TUYOS: aquí no hay más biblioteca que la
   * tuya, y esa es justamente la razón por la que la firma no se usa para relacionarlos (`ignoreAuthorLink`).
   * Solo relacionan el JUEGO, la SAGA y el GÉNERO, que es lo único que aquí distingue una reseña de otra.
   *
   * Es el mismo bloque —y el mismo módulo de orden— que el del hub social, pero con esa señal apagada: allí se
   * mezclan firmas y «otra de esta persona» es una razón de peso para seguir leyendo; aquí sería «otra tuya»,
   * que no dice nada porque todas lo son.
   *
   * Los GÉNEROS sí se conocen, al revés que en el canal social: salen de tus propias fichas.
   */
  const related = useMemo(() => {
    if (!open) {
      return [];
    }
    const candidates: RelatedReviewCandidate[] = [];
    const genresByName = new Map<string, string[]>();

    for (const entry of reviews) {
      const genres = entry.game.genres || [];
      if (genres.length > 0) {
        genresByName.set(gameTitleKey(entry.gameName), genres);
      }
      candidates.push({
        key: String(entry.id),
        gameId: entry.id,
        gameName: entry.gameName,
        // Sin firma: son todas tuyas y el bloque no las rotula (ver `suggestedOpenAria`). Que no puntúe lo
        // garantiza `ignoreAuthorLink`, no este campo.
        authorId: '',
        authorName: '',
        isOwn: true,
        rating: entry.rating,
        grade: entry.grade,
        // El texto COMPLETO: la tarjeta ya lo recorta a tres líneas, y aquí no hay canal que lo haya mutilado.
        snippet: entry.reviewText,
        // La fecha de la reseña cuando existe; si no, la de la ficha, que es lo que enseña el resto del panel.
        updatedAt: Number(entry.game.reviewedAt) || entry.ts,
        full: true,
      });
    }

    return rankRelatedReviews(
      { gameName: open.gameName, authorId: '', isOwn: true, genres: open.game.genres || [] },
      candidates,
      genresByName,
      { ignoreAuthorLink: true },
    );
  }, [open, reviews]);

  if (open) {
    const { game } = open;
    return (
      <SocialProfileReviewScreen
        SOCIAL_UI={SOCIAL_UI}
        review={{
          id: game.id,
          name: open.gameName,
          review: open.reviewText,
          score: open.rating,
          grade: open.grade,
          platforms: game.platforms || [],
          genres: game.genres || [],
          strengths: game.strengths || [],
          weaknesses: game.weaknesses || [],
          reasons: game.reasons || [],
          hours: game.hours ?? null,
          ts: open.ts,
        }}
        // SIN firma: todas estas reseñas son tuyas, así que nombrarte no distingue ninguna de las demás y la
        // cabecera se queda con el juego, que es lo único que aquí las diferencia. Antes se pasaba un chip con
        // «Tus reseñas», que ni siquiera era un nombre y repetía lo que ya dice el encabezado de la pantalla.
        onBack={onBackToList}
        backLabel={backToPanel ? L.backToStats : undefined}
        status=""
        statusKind=""
        // El botón de compartir solo aparece aquí, sobre TUS reseñas. La misma pantalla se usa en el hub social
        // para las de otras personas, y allí no se pasa nada.
        actions={<ShareReviewButton game={game} reviewText={open.reviewText} />}
        // Análisis sugeridos: los tuyos, relacionados por juego, saga o género. Salen de las listas que ya están
        // en memoria, sin tocar el canal social —esta pantalla funciona sin tenerlo montado— y abren dentro del
        // panel, no en el hub.
        related={
          <RelatedReviews
            SOCIAL_UI={SOCIAL_UI}
            items={related}
            title={SOCIAL_UI.feed.suggestedTitle}
            openAria={(entry) => SOCIAL_UI.feed.suggestedOpenAria(entry.gameName)}
            onOpen={(entry) => onOpenReview(entry.gameId)}
          />
        }
      />
    );
  }

  return (
    <section className="hub-hub hub-screen" aria-label={L.screenTitle}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name="signature" className="hub-hub-icon" />
            <h2>{L.screenTitle}</h2>
          </div>
          <p>{L.screenSubtitle}</p>
        </header>

        <div className="hub-screen-actions" aria-label={L.screenTitle}>
          <div className="hub-screen-actions-left">
            <HubBackButton onBack={onBack} label={L.backToStats} />
          </div>
        </div>

        <article className="hub-feed-card hub-feed-card-detail">
          <div className="hub-detail-metadata">
            <div className="hub-metadata-section">
              <strong>{SOCIAL_UI.feed.reviewsTitle}</strong>
              <ProfileReviewsList
                SOCIAL_UI={SOCIAL_UI}
                reviews={reviews}
                onOpenReview={onOpenReview}
                emptyLabel={L.screenEmpty}
                unfinishedLabel={L.unfinished}
                showDate={false}
              />
            </div>
          </div>
        </article>
      </div>
    </section>
  );
});
