// «¿A QUÉ JUEGO AHORA?» (`/elegir`): todo lo que se puede empezar, de un vistazo y filtrado por género y plataforma.
//
// La pregunta es la del dado —qué juego toca—, pero respondida a la vista en vez de a la suerte: los candidatos son los
// de la ruleta de los listados y el orden es su peso sin el azar (ver `core/pick/pickNext`). Si apetece que decida la
// suerte igualmente, «Gira ahora» abre el dado solo con lo filtrado.
//
// SOLO CON ESPACIO SOCIAL (decisión del usuario, 13-10-2026). La puerta va en la ruta (`App`) y en las dos entradas
// (el enlace de la ruleta y el buscador); esta pantalla da por hecho que se puede ver.
//
// LAS PIEZAS SON LAS DE LA CASA para que cada tema las vista sin código propio: las cajas del mosaico (`.game-card`),
// los botones de encendido y apagado de los filtros (`.btn-toggle`), el botón de pasar a En curso (`.btn-playing`) y
// el marco de las pantallas del panel (`.hub-hub`). Lo nuevo es solo el canto de color de cada lista, que sale de
// los colores con los que cada tema ya pinta «Pasar a…» (`--move-*`, ver `pick.scss`).
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../../../styles/pick.scss';
import { PICK_UI } from '../../../core/constants/pickLabels';
import { categoryToneStyle, categoryToneVar } from '../../../core/constants/categoryTone';
import { buildListsWeigher, type RouletteCandidate } from '../../../core/roulette/roulette';
import {
  buildPickPool,
  filterPickPool,
  parsePickFilters,
  pickOptions,
  serializePickFilters,
  togglePickFilter,
  type PickFacet,
  type PickFilters,
  type PickOption,
} from '../../../core/pick/pickNext';
import { coverDeCaja, type PedidoDePortada } from '../../../core/utils/coverDelListado';
import { resolveGrade } from '../../../core/utils/scoreScale';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TabData, TabId } from '../../../model/types/game';
import { useCovers } from '../../hooks/useCovers';
import { GameCover } from '../GameCover';
import { Icon } from '../Icon';
import { ScoreDisplay } from '../ScoreDisplay';
import { ScreenTitle } from '../socialhub/ScreenTitle';
import { RouletteModal } from '../roulette/RouletteModal';

/** Géneros que se ven sin desplegar: los más frecuentes. Lo marcado sale siempre, aunque esté más abajo. */
const GENRES_VISIBLE = 12;

/** Las carátulas son de TU biblioteca: se piden con el cupo entero, como en los listados. */
const PEDIDO: PedidoDePortada = { preferirConocidas: false, soloCache: false };

/** Las tres listas que pueden aportar juegos, en el orden de la leyenda (el de la ruleta: primero lo nuevo). */
const LEGEND_TABS = ['p', 'v', 'c'] as const;

interface PickNextScreenProps {
  games: TabData;
  /** Pasa el juego a En curso y lleva allí; es lo mismo que hace la ruleta de los listados. */
  onStart: (candidate: RouletteCandidate) => void;
}

export function PickNextScreen({ games, onStart }: PickNextScreenProps) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parsePickFilters(params), [params]);
  const [allGenres, setAllGenres] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const { covers } = useCovers();

  const pool = useMemo(() => buildPickPool(games), [games]);
  const shown = useMemo(() => filterPickPool(pool, filters), [pool, filters]);
  const weight = useMemo(() => buildListsWeigher(games), [games]);
  const genreOptions = useMemo(() => pickOptions(pool, filters, 'genres'), [pool, filters]);
  const platformOptions = useMemo(() => pickOptions(pool, filters, 'platforms'), [pool, filters]);

  // Los filtros viven en la dirección: así el buscador puede traer uno puesto (`/elegir?genre=FPS`) y volver atrás
  // desde En curso deja la pantalla como estaba. `replace` para que cada clic en un chip no sea un paso del historial.
  const setFilters = useCallback((next: PickFilters) => {
    setParams(serializePickFilters(next), { replace: true });
  }, [setParams]);
  const toggle = (facet: PickFacet, value: string) => setFilters(togglePickFilter(filters, facet, value));
  const clear = (facet: PickFacet) => setFilters({ ...filters, [facet]: [] });

  const breakdown = { p: 0, v: 0, c: 0, e: 0, d: 0 } as Record<TabId, number>;
  for (const candidate of shown) breakdown[candidate.sourceTab] += 1;
  const anyFilter = filters.genres.length > 0 || filters.platforms.length > 0;

  const visibleGenres = allGenres
    ? genreOptions
    : genreOptions.filter((option, index) => index < GENRES_VISIBLE || filters.genres.includes(option.value));

  return (
    <section className="hub-hub hub-screen pick-screen" aria-label={PICK_UI.title}>
      <div className="hub-hub-card hub-screen-card hub-feed-card-shell">
        {/* Solo el título: las pantallas no llevan subtítulo (decisión del usuario, 13-10-2026). */}
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <h2><ScreenTitle text={PICK_UI.title} /></h2>
          </div>
        </header>

        {pool.length === 0 ? (
          <p className="pick-empty">{PICK_UI.empty}</p>
        ) : (
          <>
            <div className="pick-filters">
              <PickFacetGroup
                facet="genres"
                label={PICK_UI.genres}
                options={visibleGenres}
                selected={filters.genres}
                onToggle={toggle}
                onClear={clear}
                more={genreOptions.length > GENRES_VISIBLE ? { open: allGenres, onToggle: () => setAllGenres((v) => !v) } : null}
              />
              <PickFacetGroup
                facet="platforms"
                label={PICK_UI.platforms}
                options={platformOptions}
                selected={filters.platforms}
                onToggle={toggle}
                onClear={clear}
                more={null}
              />
            </div>

            <div className="pick-bar">
              <p className="pick-count" role="status">
                <strong>{PICK_UI.count(shown.length)}</strong>
                {shown.length ? <span> · {PICK_UI.breakdown(breakdown.p, breakdown.v, breakdown.c)}</span> : null}
              </p>
              <ul className="pick-legend" aria-label={PICK_UI.legendAria}>
                {LEGEND_TABS.map((tab) => (
                  <li key={tab} data-list={tab}>{PICK_UI.legend[tab]}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-primary pick-spin"
                disabled={shown.length === 0}
                onClick={() => setRouletteOpen(true)}
              >
                <Icon name="dice-d20" />
                {PICK_UI.spin}
              </button>
            </div>

            {shown.length === 0 ? (
              <div className="pick-empty">
                <p>{PICK_UI.noMatch}</p>
                {anyFilter ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setFilters({ genres: [], platforms: [] })}>
                    {PICK_UI.clearAll}
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="pick-grid" aria-label={PICK_UI.results}>
                {shown.map((candidate) => (
                  <li key={`${candidate.sourceTab}:${candidate.game.id}`}>
                    <PickCard candidate={candidate} covers={covers} selectedGenres={filters.genres} onStart={onStart} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {rouletteOpen ? (
        <RouletteModal
          open={rouletteOpen}
          onClose={() => setRouletteOpen(false)}
          title={PICK_UI.spinTitle}
          candidates={shown}
          weight={weight}
          tag={(candidate) => PICK_UI.listTag(candidate.sourceTab)}
          action={() => ({
            btnClass: 'btn-playing',
            icon: 'play',
            label: UI_MESSAGES.rouletteActions.toCurrent,
            doneLabel: UI_MESSAGES.rouletteActions.toCurrentDone,
            onAct: (candidate) => {
              setRouletteOpen(false);
              onStart(candidate);
            },
          })}
        />
      ) : null}
    </section>
  );
}

function PickFacetGroup({ facet, label, options, selected, onToggle, onClear, more }: {
  facet: PickFacet;
  label: string;
  options: PickOption[];
  selected: string[];
  onToggle: (facet: PickFacet, value: string) => void;
  onClear: (facet: PickFacet) => void;
  more: { open: boolean; onToggle: () => void } | null;
}) {
  const labelId = `pick-facet-${facet}`;
  return (
    <div className="pick-facet" role="group" aria-labelledby={labelId}>
      <div className="pick-facet-head">
        <span id={labelId} className="flabel">{label}</span>
        {more ? (
          <button type="button" className="pick-link" aria-expanded={more.open} onClick={more.onToggle}>
            {more.open ? PICK_UI.showLess : PICK_UI.showAll}
          </button>
        ) : null}
        {selected.length ? (
          <button type="button" className="pick-link" aria-label={PICK_UI.clearAria(label)} onClick={() => onClear(facet)}>
            {PICK_UI.clear}
          </button>
        ) : null}
      </div>
      <div className="pick-chips">
        {options.map(({ value, count }) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`btn btn-toggle pick-chip${on ? ' active' : ''}`}
              aria-pressed={on}
              aria-label={PICK_UI.optionAria(value, count)}
              // Lo que dejaría la pantalla vacía no se ofrece; lo ya marcado sí, para poder quitarlo.
              disabled={!on && count === 0}
              onClick={() => onToggle(facet, value)}
            >
              <span>{value}</span>
              <span className="pick-chip-count" aria-hidden="true">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * UNA CAJA: la del mosaico de los listados, con la misma anatomía —carátula (o la caja plana sin ella), nota, nombre
 * y las dos ranuras de plataforma y género— para que cada tema la vista igual. Lo que añade es la pastilla de la lista
 * de la que sale y el botón de empezar. Todas llevan lo mismo (decisión del usuario, 13-10-2026): ni la reseña ni
 * los motivos del abandono, que hacían unas cajas más altas que otras.
 */
function PickCard({ candidate, covers, selectedGenres, onStart }: {
  candidate: RouletteCandidate;
  covers: boolean;
  selectedGenres: string[];
  onStart: (candidate: RouletteCandidate) => void;
}) {
  const { game, sourceTab } = candidate;
  const listTag = <span className="pick-card-list">{PICK_UI.listTag(sourceTab)}</span>;
  const score = resolveGrade(game) > 0 ? <span className="game-card-score"><ScoreDisplay game={game} /></span> : null;
  // El género por el que se ha filtrado va delante: es el que explica por qué está aquí este juego.
  const genres = [...game.genres].sort((a, b) => Number(selectedGenres.includes(b)) - Number(selectedGenres.includes(a)));
  return (
    <article
      className={`game-card pick-card${covers ? '' : ' is-flat'}`}
      data-list={sourceTab}
      style={game.genres[0] ? ({ '--card-tone': categoryToneVar(game.genres[0]) } as CSSProperties) : undefined}
    >
      {covers ? (
        <div className="game-card-art">
          <GameCover name={game.name} {...coverDeCaja(covers, game, PEDIDO)} />
          {score}
          {listTag}
        </div>
      ) : null}
      <div className="game-card-body">
        {!covers ? <div className="game-card-head">{listTag}{score}</div> : null}
        <div className="game-card-name-box">
          <h3 className="game-card-name">{game.name}</h3>
        </div>
        <div className="game-card-tags">
          <div className="game-card-slot is-apretado">{renderSlot(game.platforms, 'chip-plat')}</div>
          <div className="game-card-slot is-apretado">{renderSlot(genres, 'chip-genre', true)}</div>
        </div>
        <button
          type="button"
          className="btn btn-playing pick-card-start"
          aria-label={PICK_UI.startAria(game.name)}
          onClick={() => onStart(candidate)}
        >
          <Icon name="play" />
          {PICK_UI.start}
        </button>
      </div>
    </article>
  );
}

/**
 * Una ranura de la caja: el primer valor y, si hay más, el «+N» detrás. Con las mismas clases que el mosaico
 * (`renderTags` de `GameTable`), así que cada tema la viste igual. Uno solo y siempre apretado: la caja no mide los
 * chips como el listado, y así un género largo se recorta con puntos en vez de salirse.
 */
function renderSlot(values: string[], className: string, tone = false) {
  if (!values.length) return <span className="chip-none" aria-hidden="true">—</span>;
  const [first, ...rest] = values;
  return (
    <>
      <div className="chips">
        <span className={`chip ${className}`} style={tone ? categoryToneStyle(first) : undefined} data-text={first}>
          <span className="chip-text">{first}</span>
        </span>
      </div>
      {rest.length ? (
        <span className="chip chip-more" title={rest.join(', ')}>{UI_MESSAGES.table.moreCount(rest.length)}</span>
      ) : null}
    </>
  );
}
