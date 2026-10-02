import { memo, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { YEAR_SUMMARY_ICONS as ICONS, YEAR_SUMMARY_UI as L, type SummaryVoice } from '../../../core/constants/yearSummaryLabels';
import type { IconName } from '../../../core/constants/icons';
import { Icon } from '../Icon';
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
/** Cuántas carátulas lleva como mucho la composición de la portada, y con cuántas cargadas merece la pena. */
const COLLAGE_MAX = 9;
const COLLAGE_MIN = 3;

interface YearSummaryProps {
  summary: YearSummaryData;
  voice: SummaryVoice;
}

function gradeText(grade: number, scale: ScoreScale): string {
  return scale === 'grade' ? String(Math.round(grade)) : formatDecimal(grade / 20);
}

/**
 * Una diferencia de nota tal y como se va a LEER, en las unidades de quien mira (puntos sobre 100, o estrellas con
 * un decimal). El signo y el «más alto»
 * salen de aquí y no de la diferencia en bruto, para que nunca salga un «+0» que dice que puntuó más alto.
 */
function shownDelta(delta: number, scale: ScoreScale): number {
  return scale === 'grade' ? Math.round(delta) : Math.round(delta / 2) / 10;
}

function cumulative(months: readonly number[]): number[] {
  let total = 0;
  return months.map((count) => (total += count));
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

/** Por debajo de esta distancia (en % del alto) las dos cifras del final se pisarían: se separan. */
const RACE_LABEL_GAP = 10;

/**
 * LA CARRERA MES A MES de «frente al año anterior»: los juegos acumulados de los dos años y la línea del total del
 * anterior, que es la meta. El trazo va en un SVG que se estira con la caja (`preserveAspectRatio="none"` y trazo
 * que no escala); los puntos y las cifras van en HTML encima, en porcentaje, para que la letra mida lo mismo en el
 * teléfono que en una pantalla ancha.
 */
function YearRace({ year, before, now, previous, goal, pass }: { year: number; before: number; now: number[]; previous: number[]; goal: number; pass: number }) {
  const top = Math.max(1, now[11], previous[11], goal) * 1.12;
  const x = (month: number) => ((month + 0.5) / 12) * 100;
  const y = (value: number) => (value / top) * 100;
  const points = (values: number[]) => ['0,100', ...values.map((value, month) => `${x(month).toFixed(2)},${(100 - y(value)).toFixed(2)}`)].join(' ');
  const close = Math.abs(y(now[11]) - y(goal)) < RACE_LABEL_GAP;
  const nowAbove = now[11] >= goal;
  const at = (month: number, value: number) => ({ '--x': String(x(month)), '--y': String(y(value)) }) as CSSProperties;
  return (
    <div className="ys-race" role="img" aria-label={L.previous.raceAria(year, before, now[11], goal)}>
      <div className="ys-race-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line className="ys-race-goal" x1="0" x2="100" y1={100 - y(goal)} y2={100 - y(goal)} vectorEffect="non-scaling-stroke" />
          <polygon className="ys-race-area" points={`${points(now)} ${x(11).toFixed(2)},100`} />
          <polyline className="ys-race-prev" points={points(previous)} vectorEffect="non-scaling-stroke" />
          <polyline className="ys-race-now" points={points(now)} vectorEffect="non-scaling-stroke" />
        </svg>
        {pass >= 0 && pass < 11 ? (
          <span className={`ys-race-pt is-pass ${pass < 5 ? 'is-right' : ''}`.trim()} style={at(pass, now[pass])}>
            <b>{L.previous.passLabel(pass, now[pass])}</b>
          </span>
        ) : null}
        <span className="ys-race-pt is-end" style={at(11, now[11])} />
        <span className={`ys-race-end is-now ${close ? (nowAbove ? 'is-up' : 'is-down') : ''}`.trim()} style={{ '--y': String(y(now[11])) } as CSSProperties}>
          {now[11]}
        </span>
        <span className={`ys-race-end is-goal ${close ? (nowAbove ? 'is-down' : 'is-up') : ''}`.trim()} style={{ '--y': String(y(goal)) } as CSSProperties}>
          {goal}
        </span>
      </div>
      <div className="ys-race-cap">
        {L.monthsShort.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
      <div className="ys-race-legend">
        <span>
          <i />
          {year}
        </span>
        <span>
          <i className="is-prev" />
          {before}
        </span>
      </div>
    </div>
  );
}

/**
 * LA COMPOSICIÓN DE LA PORTADA: las carátulas del año en mosaico inclinado, al estilo de los resúmenes anuales de
 * las tiendas, fundidas con el acento por la izquierda para que el año y la cifra se sigan leyendo. Va de fondo y
 * en absoluto: la tarjeta mide lo mismo con composición que sin ella.
 *
 * Solo aparece cuando han CARGADO al menos `COLLAGE_MIN`: una o dos sueltas no son una composición, son un hueco.
 * Las que fallan (un 404 de «solo caché», un título sin carátula) se quitan sin dejar tesela vacía. Sin carátulas
 * —preferencia apagada o nada resuelto— no se pinta nada y la portada queda como estaba.
 */
function CoverCollage({ urls }: { urls: string[] }) {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const add = useCallback((url: string) => (prev: ReadonlySet<string>) => (prev.has(url) ? prev : new Set(prev).add(url)), []);
  const tiles = urls.filter((url) => !failed.has(url));
  const ready = tiles.filter((url) => loaded.has(url)).length >= COLLAGE_MIN;
  if (tiles.length < COLLAGE_MIN) return null;
  return (
    <div className={`ys-collage ${ready ? 'is-ready' : ''}`.trim()} aria-hidden="true">
      <div className="ys-collage-grid">
        {tiles.map((url) => (
          <img key={url} src={url} alt="" loading="lazy" decoding="async" onLoad={() => setLoaded(add(url))} onError={() => setFailed(add(url))} />
        ))}
      </div>
    </div>
  );
}

export const YearSummary = memo(function YearSummary({ summary, voice }: YearSummaryProps) {
  const scale = useScoreScale();
  // Mismo criterio que sus reseñas: de la estantería de otra persona solo lo que el servidor ya tenga resuelto.
  const coverOf = useReviewCover(voice.own ? true : 'solo-cache');
  const cover = summary.best ? coverOf(summary.best.name, summary.best.platforms) : null;
  // Mismo tamaño que el renglón del listado: lo que ya viste en tu lista sale de la caché del navegador.
  const collage = useMemo(
    () => summary.covers.slice(0, COLLAGE_MAX).flatMap((game) => coverOf(game.name, game.platforms, 'medio') ?? []),
    [coverOf, summary.covers],
  );
  const commonCover = summary.common?.top ? coverOf(summary.common.top.name, summary.common.top.platforms) : null;
  const outOf = L.format.outOf(scale);
  const { when, previous, common } = summary;

  /** `accent`: la portada, que lleva su propia tarjeta en vez de la social del tema. */
  const cards: Array<{ key: string; icon: IconName; accent?: boolean; className?: string; kicker: string; body: ReactNode }> = [];

  cards.push({
    key: 'cover',
    icon: ICONS.cover,
    accent: true,
    className: 'is-accent',
    kicker: L.cover.kicker(voice),
    body: (
      <>
        <CoverCollage urls={collage} />
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
      icon: ICONS.best,
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
      icon: ICONS.when,
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
      icon: ICONS.genres,
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
      icon: ICONS.tags,
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
    const gradeDelta = summary.avgGrade !== null && previous.avgGrade !== null ? shownDelta(summary.avgGrade - previous.avgGrade, scale) : null;
    // La carrera necesita fechas en los dos años; sin ellas la tarjeta se queda en las cifras.
    const race = when && previous.months ? { now: cumulative(when.months), previous: cumulative(previous.months) } : null;
    // El mes en que lo FECHADO de este año ya pasa del total del anterior: con fecha o sin ella, «todo» es verdad.
    const pass = race ? race.now.findIndex((total) => total > previous.count) : -1;
    const undated = when && race ? when.undated + previous.undated : 0;
    cards.push({
      key: 'previous',
      icon: ICONS.previous,
      kicker: L.previous.kicker(previous.year),
      body: (
        <>
          <h4 className="ys-title">{pass >= 0 ? L.previous.passed(voice, pass, previous.year) : L.previous.title(summary.count, previous.count, previous.year)}</h4>
          {race ? <YearRace year={summary.year} before={previous.year} now={race.now} previous={race.previous} goal={previous.count} pass={pass} /> : null}
          <div className="ys-facts">
            <div>
              <b>
                {L.format.signed(String(Math.abs(countDelta)), countDelta)} {L.previous.games}
              </b>
              <span>{L.previous.gamesVs(summary.count, previous.count)}</span>
            </div>
            {gradeDelta !== null && summary.avgGrade !== null && previous.avgGrade !== null ? (
              <div>
                <b>
                  {L.format.signed(scale === 'grade' ? String(Math.abs(gradeDelta)) : formatDecimal(Math.abs(gradeDelta)), gradeDelta)} {L.previous.grade}
                </b>
                <span>{L.previous.gradeVs(voice, gradeText(summary.avgGrade, scale), gradeText(previous.avgGrade, scale), gradeDelta)}</span>
              </div>
            ) : null}
            {previous.genreRise ? (
              <div>
                <b>{L.previous.genreRise(previous.genreRise.name, previous.genreRise.from, previous.genreRise.to)}</b>
                <span>{L.previous.genreRiseText}</span>
              </div>
            ) : null}
          </div>
          {undated > 0 ? <p className="ys-note">{L.previous.raceUndated(undated)}</p> : null}
        </>
      ),
    });
  }

  if (common) {
    const { near, gap, affinity, picks } = common;
    cards.push({
      key: 'common',
      icon: ICONS.common,
      // De fondo, la carátula del juego en común que más os gustó a los dos, con el velo de las reseñas.
      className: `is-common ${commonCover ? 'has-cover' : ''}`.trim(),
      kicker: L.common.kicker,
      body: (
        <>
          {common.names.length ? (
            <>
              {commonCover ? <span className="ys-card-cover" aria-hidden="true" style={{ '--ys-cover': `url("${commonCover}")` } as CSSProperties} /> : null}
              <h4 className="ys-title">{affinity !== null ? L.common.titleAffinity(common.names.length, affinity) : L.common.title(common.names.length)}</h4>
              {affinity !== null ? (
                <span className="ys-affinity" aria-hidden="true">
                  <i style={{ '--ys-p': String(affinity) } as CSSProperties} />
                </span>
              ) : null}
              <ul className="ys-tags">
                {common.names.map((name) => (
                  <li key={name} className="ys-tag">
                    {name}
                  </li>
                ))}
              </ul>
              {near || gap ? (
                <div className="ys-facts">
                  {near ? (
                    <div>
                      <b>{near.name}</b>
                      <span>{L.common.near(voice, gradeText(near.yours, scale), gradeText(near.theirs, scale))}</span>
                    </div>
                  ) : null}
                  {gap ? (
                    <div>
                      <b>{gap.name}</b>
                      <span>{L.common.gap(voice, gradeText(gap.yours, scale), gradeText(gap.theirs, scale))}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="ys-dim">{L.common.none}</p>
          )}
          {picks.length ? (
            <div className="ys-picks">
              <h5 className="ys-picks-title">{L.common.picksTitle}</h5>
              <ul>
                {picks.map((pick) => {
                  const pickCover = coverOf(pick.name, pick.platforms);
                  const reason = pick.best ? L.common.pickBest : pick.month !== null ? L.common.pickMonth(pick.month) : null;
                  return (
                    <li key={pick.name} className="ys-pick">
                      <div
                        className={`ys-boxart ys-pick-art ${pickCover ? 'has-cover' : ''}`.trim()}
                        style={pickCover ? ({ '--ys-cover': `url("${pickCover}")` } as CSSProperties) : undefined}
                        aria-hidden="true"
                      >
                        <span>{pick.name}</span>
                      </div>
                      <div>
                        <b className="ys-pick-name">{pick.name}</b>
                        <span className="ys-pick-meta">
                          {reason ? `${reason} · ` : null}
                          <Grade grade={pick.grade} scale={scale} /> {outOf}
                        </span>
                        {pick.quote ? <p className="ys-pick-quote">{L.format.quote(pick.quote)}</p> : null}
                        <span className="ys-pick-where">{L.common.pickWhere}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      ),
    });
  }

  return (
    /* `stats-hub` no es por la maquetación de Estadísticas, que no se usa: es el ámbito donde cada tema declara las
       PALANCAS de sus gráficas (canto, radio, cifra; ver `stats.scss`). Con él, las barras del resumen se doblan
       como las del panel sin enumerarlas en ocho skins. Y la tarjeta es la social (`hub-feed-card`), que cada tema
       ya viste —placa, tinta, pergamino—; la portada se queda con la suya, que es la del acento. */
    <div className="ys stats-hub">
      {cards.map((card, index) => (
        <section
          key={card.key}
          className={[card.accent ? null : 'hub-feed-card', 'ys-card', card.className].filter(Boolean).join(' ')}
          aria-label={card.kicker}
        >
          <div className="ys-head">
            <span className="ys-kicker">
              <Icon name={card.icon} className="ui-icon ys-kicker-icon" />
              {card.kicker}
            </span>
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
