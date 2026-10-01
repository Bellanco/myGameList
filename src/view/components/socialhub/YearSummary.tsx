import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import { YEAR_SUMMARY_UI as L, type SummaryVoice } from '../../../core/constants/yearSummaryLabels';
import { hueFromGrade, type ScoreScale } from '../../../core/utils/scoreScale';
import type { YearSummary as YearSummaryData } from '../../../core/stats/yearSummary';
import { useScoreScale } from '../../hooks/useScoreScale';
import { formatDecimal } from '../stats/format';
import { useReviewCover } from './useReviewCover';
// La hoja va con el componente, que es perezoso: así llega con él a cualquier sitio que lo monte, sin depender de
// que otra hoja del hub esté cargada (ver `styles/yearSummary.scss`).
import '../../../styles/yearSummary.scss';

/**
 * EL RESUMEN DEL AÑO, dentro del perfil: siete tarjetas como capítulos, una idea por tarjeta y apiladas hacia
 * abajo. El cálculo vive en `core/stats/yearSummary` y llega hecho; aquí solo se decide cómo se pinta y en qué
 * escala de nota (la de quien mira, como el resto del perfil).
 *
 * Las tarjetas sin datos no se pintan —sin fechas no hay «cuándo», sin otra persona no hay «contigo»— y los
 * capítulos se numeran con las que quedan, para que nunca salga un «03 / 07» con huecos.
 */
interface YearSummaryProps {
  summary: YearSummaryData;
  voice: SummaryVoice;
}

function gradeText(grade: number, scale: ScoreScale): string {
  return scale === 'grade' ? String(Math.round(grade)) : formatDecimal(grade / 20);
}

function Grade({ grade, scale }: { grade: number; scale: ScoreScale }) {
  return (
    <span className="ys-grade" style={{ '--ys-hue': String(hueFromGrade(grade)) } as CSSProperties}>
      {gradeText(grade, scale)}
    </span>
  );
}

/** Casillas del año, una por día y en columnas de semana, encendidas las que tienen algún fin. */
function YearCalendar({ year, finishes }: { year: number; finishes: Array<{ key: string; names: string[] }> }) {
  const cells = useMemo(() => {
    const byDay = new Map(finishes.map((entry) => [entry.key, entry.names]));
    const out: Array<{ key: string; names?: string[]; month: number; day: number } | null> = [];
    const start = new Date(year, 0, 1);
    for (let i = 0; i < start.getDay(); i += 1) out.push(null);
    for (const date = new Date(start); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
      const key = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      out.push({ key, names: byDay.get(key), month: date.getMonth(), day: date.getDate() });
    }
    return out;
  }, [finishes, year]);

  return (
    <>
      <div className="ys-cal" role="img" aria-label={L.when.calendarAria}>
        {cells.map((cell, index) =>
          cell ? (
            <i
              key={cell.key}
              className={cell.names ? 'is-on' : undefined}
              title={cell.names ? cell.names.map((name) => L.when.gameTitle(name, cell.month, cell.day)).join('\n') : undefined}
            />
          ) : (
            <i key={`pad-${index}`} className="is-pad" />
          ),
        )}
      </div>
      <div className="ys-cal-cap" aria-hidden="true">
        {L.monthsShort.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </>
  );
}

export const YearSummary = memo(function YearSummary({ summary, voice }: YearSummaryProps) {
  const scale = useScoreScale();
  // Mismo criterio que sus reseñas: de la estantería de otra persona solo lo que el servidor ya tenga resuelto.
  const coverOf = useReviewCover(voice.own ? true : 'solo-cache');
  const cover = summary.best ? coverOf(summary.best.name, summary.best.platforms) : null;
  const outOf = L.format.outOf(scale);
  const { when, previous, common } = summary;

  const cards: Array<{ key: string; className?: string; kicker: string; body: ReactNode }> = [];

  cards.push({
    key: 'cover',
    className: 'is-accent',
    kicker: L.cover.kicker(voice),
    body: (
      <>
        <div className="ys-cover-row">
          <div>
            <div className="ys-big">{summary.year}</div>
            <p className="ys-lead">
              <strong>{L.cover.finished(voice, summary.count)}</strong>
              {L.cover.withReview(summary.withReview)}
            </p>
          </div>
          {summary.avgGrade !== null ? (
            <div className="ys-avg">
              <span>{L.cover.avg}</span>
              <b>{gradeText(summary.avgGrade, scale)}</b>
            </div>
          ) : null}
        </div>
        <div className="ys-chips" aria-label={L.cover.platformsAria}>
          {summary.platforms.map((platform) => (
            <span key={platform.name} className="ys-chip">
              {L.format.chip(platform.name, platform.count)}
            </span>
          ))}
          {summary.palmares ? <span className="ys-chip is-trophy">{L.cover.palmares(summary.palmares.rank, summary.palmares.seasonName)}</span> : null}
        </div>
      </>
    ),
  });

  if (summary.best) {
    const { best } = summary;
    cards.push({
      key: 'best',
      kicker: L.best.kicker,
      body: (
        <div className="ys-two">
          <div className={`ys-boxart ${cover ? 'has-cover' : ''}`.trim()} style={cover ? ({ '--ys-cover': `url("${cover}")` } as CSSProperties) : undefined}>
            <span>{best.name}</span>
          </div>
          <div>
            <h4 className="ys-title">{best.name}</h4>
            <div className="ys-meta">
              <Grade grade={best.grade} scale={scale} /> <span className="ys-dim">{L.format.meta([outOf, best.genre, best.platform])}</span>
            </div>
            {best.quote ? <blockquote className="ys-quote">{L.format.quote(best.quote)}</blockquote> : <p className="ys-dim">{L.best.noQuote(voice)}</p>}
            {summary.podium.length ? (
              <ol className="ys-podium" start={2} aria-label={L.best.podiumAria}>
                {summary.podium.map((entry) => (
                  <li key={entry.name}>
                    <span>{entry.name}</span>
                    <Grade grade={entry.grade} scale={scale} />
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
      ),
    });
  }

  if (when) {
    const days = when.days;
    cards.push({
      key: 'when',
      kicker: L.when.kicker(voice),
      body: (
        <>
          <h4 className="ys-title">{L.when.top(voice, when.topMonths, when.topCount)}</h4>
          <div className="ys-months" role="img" aria-label={L.when.monthsAria(when.months)} style={{ '--ys-max': String(when.topCount) } as CSSProperties}>
            {when.months.map((count, month) => (
              <div key={L.monthsShort[month]} className={`ys-month ${when.topMonths.includes(month) ? 'is-top' : ''} ${count === 0 ? 'is-zero' : ''}`.trim()}>
                <div className="ys-month-bar" style={{ '--ys-n': String(count) } as CSSProperties}>
                  {count ? <b>{count}</b> : null}
                </div>
                <small>{L.monthsShort[month]}</small>
              </div>
            ))}
          </div>
          {days ? <YearCalendar year={summary.year} finishes={days.finishes} /> : null}
          <div className="ys-facts">
            {days && days.topWeekday !== null ? (
              <div>
                <b>{L.when.weekday(voice, days.topWeekday, days.topWeekdayCount, when.dated).title}</b>
                <span>{L.when.weekday(voice, days.topWeekday, days.topWeekdayCount, when.dated).text}</span>
              </div>
            ) : null}
            <div>
              <b>{L.joinList(when.first.names)}</b>
              <span>{L.format.firstOrLast(L.when.first(when.first.names), L.dateLong(when.first.month, when.first.day))}</span>
            </div>
            {when.dated > 1 ? (
              <div>
                <b>{L.joinList(when.last.names)}</b>
                <span>{L.format.firstOrLast(L.when.last(when.last.names), L.dateLong(when.last.month, when.last.day))}</span>
              </div>
            ) : null}
          </div>
          {when.undated > 0 ? <p className="ys-note">{L.when.undated(when.undated)}</p> : null}
        </>
      ),
    });
  }

  if (summary.genres.length) {
    const top = summary.genres[0].count;
    const leaders = summary.genres.filter((genre) => genre.count === top).map((genre) => genre.name);
    cards.push({
      key: 'genres',
      kicker: L.genres.kicker(voice),
      body: (
        <>
          <h4 className="ys-title">{L.genres.title(leaders, top, summary.count)}</h4>
          <ul className="ys-genres">
            {summary.genres.map((genre, index) => (
              <li key={genre.name} className="ys-genre" style={{ '--ys-c': `var(--cat-${(index % 7) + 1})`, '--ys-p': String((genre.count / top) * 100) } as CSSProperties}>
                <span className="ys-genre-name">{genre.name}</span>
                <span className="ys-genre-bar" aria-hidden="true">
                  <i />
                </span>
                <span className="ys-genre-n">{genre.count}</span>
                <span className="ys-genre-best">{L.genres.detail(genre.avgGrade !== null ? gradeText(genre.avgGrade, scale) : null, genre.bestName)}</span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (summary.strengths.length || summary.weaknesses.length) {
    const max = Math.max(1, ...summary.strengths.map((tag) => tag.count), ...summary.weaknesses.map((tag) => tag.count));
    const weight = (count: number) => ({ '--ys-w': String(Math.round((count / max) * 4)) }) as CSSProperties;
    cards.push({
      key: 'tags',
      kicker: L.tags.kicker(voice),
      body: (
        <>
          {summary.strengths.length ? (
            <ul className="ys-tags" aria-label={L.tags.strengthsAria}>
              {summary.strengths.map((tag) => (
                <li key={tag.name} className="ys-tag is-up" style={weight(tag.count)}>
                  {tag.name} <b>{L.format.tagCount(tag.count)}</b>
                </li>
              ))}
            </ul>
          ) : null}
          {summary.weaknesses.length ? (
            <ul className="ys-tags" aria-label={L.tags.weaknessesAria}>
              {summary.weaknesses.map((tag) => (
                <li key={tag.name} className="ys-tag is-down" style={weight(tag.count)}>
                  {tag.name} <b>{L.format.tagCount(tag.count)}</b>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ),
    });
  }

  if (previous) {
    const countDelta = summary.count - previous.count;
    const gradeDelta = summary.avgGrade !== null && previous.avgGrade !== null ? summary.avgGrade - previous.avgGrade : null;
    cards.push({
      key: 'previous',
      kicker: L.previous.kicker(previous.year),
      body: (
        <div className="ys-vs">
          <div>
            <b className={countDelta > 0 ? 'is-up' : countDelta < 0 ? 'is-down' : undefined}>{L.format.signed(String(Math.abs(countDelta)), countDelta)}</b>
            <small>{L.previous.games(previous.count, previous.year)}</small>
          </div>
          {gradeDelta !== null && previous.avgGrade !== null ? (
            <div>
              <b>{L.format.signed(gradeText(Math.abs(gradeDelta), scale), Math.round(gradeDelta * 10))}</b>
              <small>{L.previous.grade(voice, gradeText(previous.avgGrade, scale), previous.year, Math.round(gradeDelta * 10))}</small>
            </div>
          ) : null}
        </div>
      ),
    });
  }

  if (common) {
    cards.push({
      key: 'common',
      className: 'is-common',
      kicker: L.common.kicker,
      body: common.names.length ? (
        <>
          <h4 className="ys-title">{L.common.title(common.names.length)}</h4>
          <ul className="ys-tags">
            {common.names.map((name) => (
              <li key={name} className="ys-tag">
                {name}
              </li>
            ))}
          </ul>
          {common.gap ? (
            <p className="ys-gap">{L.common.gap(common.gap.name, gradeText(common.gap.theirs, scale), gradeText(common.gap.yours, scale), voice)}</p>
          ) : null}
        </>
      ) : (
        <p className="ys-dim">{L.common.none}</p>
      ),
    });
  }

  return (
    <div className="ys">
      {cards.map((card, index) => (
        <section key={card.key} className={`ys-card ${card.className || ''}`.trim()} aria-label={card.kicker}>
          <div className="ys-head">
            <span className="ys-kicker">{card.kicker}</span>
            <span className="ys-chap" aria-hidden="true">
              {L.chapter(index + 1, cards.length)}
            </span>
          </div>
          {card.body}
        </section>
      ))}
    </div>
  );
});
