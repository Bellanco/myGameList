import { memo } from 'react';
import { YEAR_SUMMARY_UI } from '../../core/constants/yearSummaryLabels';
import type { SharedYearSummary } from '../../model/types/share';
import { IconSprite } from './IconSprite';
import { YearSummary } from './socialhub/YearSummary';
import type { CoverAccess } from './socialhub/useReviewCover';

/**
 * EL RESUMEN DEL AÑO COMPARTIDO, tal como lo ve quien abre su enlace (`/r/:token`, ver docs/plan-resumen-del-ano.md).
 *
 * Es el MISMO componente del perfil, en tercera persona con el nick y con dos diferencias:
 *  - sin cita: no viaja en el artículo, y un «Sin reseña» diría algo falso de su autor (`quotes={false}`);
 *  - carátulas solo para quien tiene cuenta social en este navegador (`coverAccess`, decisión del usuario,
 *    12-10-2026). Sin ella no se pide ni una a `/cover`: son las visitas que pueden ser miles, y el arte de terceros
 *    no se enseña a quien no tiene la app.
 *
 * En modo artículo no hay app, y por tanto no hay sprite de iconos montado: se monta aquí. Ya viaja en el chunk de
 * entrada, así que no cuesta una descarga más.
 */
export const PublicYearSummary = memo(function PublicYearSummary({
  article,
  coverAccess,
  standalone,
}: {
  article: SharedYearSummary;
  coverAccess: CoverAccess;
  standalone: boolean;
}) {
  return (
    <>
      {standalone ? <IconSprite /> : null}
      <header className="hub-screen-header">
        <div className="hub-hub-title-wrap">
          <h2>{YEAR_SUMMARY_UI.title(article.year)}</h2>
        </div>
        {article.authorNick ? <p className="ys-dim">{YEAR_SUMMARY_UI.publicPage.by(article.authorNick)}</p> : null}
      </header>
      <article className="hub-feed-card hub-feed-card-detail">
        <YearSummary summary={article.summary} voice={{ own: false, name: article.authorNick }} coverAccess={coverAccess} quotes={false} />
      </article>
    </>
  );
});
