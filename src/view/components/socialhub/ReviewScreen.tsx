import type { CSSProperties, ReactNode } from 'react';
import { ReviewDetailBody } from '../ReviewDetailBody';
import { ReviewDetailHead, type ReviewAuthor } from '../ReviewDetailHead';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';
import type { IconName } from '../../../core/constants/icons';
import { HubScreen } from './HubScreen';
import { HubStatus } from './HubStatus';
import { HubBackButton } from './HubBackButton';
import { useReviewCover } from './useReviewCover';
// Ver `ProfileReviewsList`: esta pantalla la reutiliza el panel de estadísticas para TUS reseñas, y allí no se
// carga el chunk del hub.
import '../../../styles/reviews.scss';

/** Lo que se pinta de una reseña abierta, venga del feed o del listado de un perfil. */
export interface ReviewScreenContent {
  gameName: string;
  reviewText: string;
  score: number;
  grade: number | null;
  /* Mutables y no `readonly` porque es lo que pide `ReviewDetailBody`, que es quien los pinta: cambiar aquel
     contrato tocaría también la ficha de la ruleta y la página pública, y ninguno de los dos gana nada. */
  platforms?: string[];
  genres?: string[];
  strengths?: string[];
  weaknesses?: string[];
}

/**
 * EL DETALLE DE UNA RESEÑA, UNA SOLA VEZ.
 *
 * Una reseña se lee por DOS CAMINOS y cada uno tiene su dirección, porque cada uno la encuentra donde el otro no
 * puede (está razonado en `openRelatedReview`, en el viewmodel):
 *
 *  · `/social/user/:actorProfileId/game/:id/review` — desde el FEED. El id es el pseudónimo público del gist y
 *    la reseña sale de la ENTRADA DE ACTIVIDAD, que es lo único que hay de alguien cuyas listas no tenemos.
 *  · `/social/profiles/:profileId/game/:id/review` — desde un PERFIL. El id es el de la entrada del directorio
 *    y la reseña sale de sus LISTAS compartidas, que es lo único que encuentra una reseña propia sin publicar.
 *
 * Lo que NO tenía por qué estar dos veces es esta pantalla. Estuvo: `SocialDetailScreen` y
 * `SocialProfileReviewScreen` montaban la misma cabecera, el mismo cuerpo y el mismo bloque de relacionadas con
 * dos marcados que había que acordarse de tocar a la vez — y no se hizo: la franja de la carátula se añadió en
 * una y la otra se quedó sin ella. Ahora las dos rutas resuelven sus datos por su cuenta (que es su trabajo) y
 * entregan aquí lo que hay que pintar.
 *
 * LAS TRES DIFERENCIAS REALES entre los dos caminos están en las props y no en dos ficheros:
 *  · la FIRMA: con avatar y enlace al perfil cuando se llega del feed; sin enlace dentro del propio perfil, y
 *    ausente del todo en tus reseñas, donde todas llevarían la misma (ver `ReviewDetailHead`);
 *  · la ESPERA: el detalle del feed se resuelve contra el directorio, así que puede llegar antes que sus datos;
 *  · el ADELANTO: de un perfil ajeno puede que solo tengamos los 160 caracteres del canal, y eso se avisa.
 */
export function ReviewScreen({
  SOCIAL_UI,
  title,
  subtitle,
  icon,
  content,
  author = null,
  dateLabel = '',
  onBack,
  backLabel,
  status,
  statusKind,
  actions = null,
  related = null,
  coversAllowed = false,
  screenLoading = false,
  bodyLoading = false,
  previewOnly = false,
  missingLabel,
}: {
  SOCIAL_UI: SocialUiLabels;
  /** Encabezado de la cáscara: cada camino nombra la pantalla a su manera. */
  title: string;
  subtitle: string;
  icon?: IconName;
  /** La reseña. `null` es «todavía no hay»: con `screenLoading` se espera, y sin él se dice que no está. */
  content: ReviewScreenContent | null;
  author?: ReviewAuthor | null;
  dateLabel?: string;
  onBack: () => void;
  backLabel: string;
  status: string;
  statusKind: string;
  /** Fila de la derecha bajo el encabezado (hoy, compartir la reseña si es tuya). */
  actions?: ReactNode;
  /** Bloque de relacionadas al pie, que monta quien tiene con qué relacionarla. */
  related?: ReactNode;
  /** ¿Se puede pedir la carátula del juego para el fondo? Ver `useReviewCover`. */
  coversAllowed?: boolean;
  /** La reseña entera viene de camino: se espera con su forma en vez de decir que no existe. */
  screenLoading?: boolean;
  /** El texto completo viene de camino, pero la cabecera ya se puede pintar. */
  bodyLoading?: boolean;
  /** Lo que hay es el adelanto de ≤160 del canal, no la reseña: se dice. */
  previewOnly?: boolean;
  /** Qué decir cuando no hay reseña y ya no va a llegar. */
  missingLabel: string;
}) {
  const coverOf = useReviewCover(coversAllowed);
  const cover = content ? coverOf(content.gameName, content.platforms) : null;

  /** Fila de acciones bajo el encabezado. El encabezado en sí lo pone `HubScreen`. */
  const actionsRow = (
    <div className="hub-screen-actions hub-screen-actions-split" aria-label={SOCIAL_UI.feed.detailActionsAria}>
      <div className="hub-screen-actions-left">
        <HubBackButton onBack={onBack} label={backLabel} />
      </div>
      {actions ? <div className="hub-screen-actions-right">{actions}</div> : null}
    </div>
  );

  const shell = { ariaLabel: SOCIAL_UI.feed.sectionAria, title, subtitle, ...(icon ? { icon } : {}) };

  if (!content) {
    return (
      <HubScreen {...shell}>
        {actionsRow}
        {screenLoading ? (
          <article className="hub-feed-card hub-feed-card-detail">
            {/* Misma anidación que `ReviewDetailHead`, para que la firma de la reseña no cambie de sitio al
                llegar: disco del avatar, nombre y fecha. */}
            <header className="hub-feed-card-head" aria-hidden="true">
              <span className="hub-avatar hub-skeleton" />
              <div className="hub-feed-card-head-text">
                <span className="hub-skeleton hub-skeleton-line" style={{ width: '38%' }} />
                <span className="hub-skeleton hub-skeleton-line" style={{ width: '22%' }} />
              </div>
            </header>
            <DetailBodySkeleton />
            <p className="sr-only" role="status">{SOCIAL_UI.feed.detailLoadingReview}</p>
          </article>
        ) : (
          <p>{missingLabel}</p>
        )}
        <HubStatus status={status} statusKind={statusKind} />
      </HubScreen>
    );
  }

  return (
    <HubScreen {...shell}>
      {actionsRow}
      <article
        className={`hub-feed-card hub-feed-card-detail${cover ? ' has-cover' : ''}`}
        style={cover ? ({ '--row-cover': `url("${cover}")` } as CSSProperties) : undefined}
      >
        <ReviewDetailHead
          gameName={content.gameName}
          author={author}
          dateLabel={dateLabel}
          score={{ score: content.score, grade: content.grade }}
        />
        {bodyLoading ? (
          <DetailBodySkeleton />
        ) : (
          <ReviewDetailBody
            review={content.reviewText}
            platforms={content.platforms}
            genres={content.genres}
            strengths={content.strengths}
            weaknesses={content.weaknesses}
          />
        )}
        {/* Lo que está pasando, para quien no ve el esqueleto. */}
        {bodyLoading ? <p className="sr-only" role="status">{SOCIAL_UI.feed.detailLoadingReview}</p> : null}
        {previewOnly ? <p className="hub-detail-preview-note">{SOCIAL_UI.feed.detailPreviewOnly}</p> : null}
      </article>
      {related}
      <HubStatus status={status} statusKind={statusKind} />
    </HubScreen>
  );
}

/**
 * El cuerpo del detalle MIENTRAS lo que va a ocupar su sitio todavía viene de camino.
 *
 * Uno solo para las dos esperas de esta pantalla —la del evento y la del análisis completo—, porque el hueco que
 * reservan es el mismo. Las líneas van dentro de `.hub-detail-body-skeleton` y no sueltas: a partir de 44rem
 * `.hub-detail-body` se pone en FILA (reseña a la izquierda, metadatos a la derecha) y sueltas cada línea se
 * habría convertido en una columna.
 */
function DetailBodySkeleton() {
  return (
    <div className="hub-detail-body" aria-hidden="true">
      <div className="hub-detail-body-skeleton">
        {['96%', '88%', '93%', '54%'].map((width) => (
          <span key={width} className="hub-skeleton hub-skeleton-line" style={{ width }} />
        ))}
      </div>
      {/* Los cuatro bloques de chips también tienen su hueco: sin él, al llegar el análisis la pantalla crecía de
          golpe por debajo y empujaba las reseñas relacionadas. */}
      <div className="hub-detail-metadata">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="hub-skeleton hub-detail-meta-skeleton" />
        ))}
      </div>
    </div>
  );
}
