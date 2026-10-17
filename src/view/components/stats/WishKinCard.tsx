import { memo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useStatsLabels } from './statsVoice';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { Dumbbell } from './Dumbbell';
import { Icon } from '../Icon';
import { categoryToneStyle } from '../../../core/constants/categoryTone';
import { TAB_ROUTE } from '../../../core/constants/labels';
import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import type { WishKinSummary } from '../../../core/stats/wishKin';

/**
 * «Ya lo tienes en casa»: cada deseo frente a lo que ya espera en Próximos (`core/stats/wishKin`).
 *
 * Tres piezas, de la más directa a la más general: cuántos deseos tienen ya un pariente, cuáles son las parejas
 * (una por género mientras los haya; el juego y el género llevan a Próximos) y, por géneros, en qué se parecen y en qué no lo que deseas y lo que esperas. Sin parejas se queda la frase y
 * la comparación, que sigue diciendo algo: dónde un deseo cubriría un hueco.
 *
 * Con `onOpenGame`, el juego que ya tienes abre su ficha encima del panel en vez de llevar a Próximos.
 */
export const WishKinCard = memo(function WishKinCard({ kin, onOpenGame }: {
  kin: WishKinSummary;
  onOpenGame?: (name: string) => void;
}) {
  const L = useStatsLabels().kin;
  const hidden = kin.withKin - kin.pairs.length;

  return (
    <>
      <div className="stats-tiles">
        <StatTile
          label={L.tile}
          value={<CountUp value={kin.withKin} />}
          unit={L.tileUnit(kin.wishes)}
          hint={L.tileHint}
          progress={kin.wishes ? (kin.withKin / kin.wishes) * 100 : 0}
        />
      </div>

      <section>
        <h3>{L.pairs}</h3>
        {kin.pairs.length ? (
          <>
            <ol className="kin-pairs">
              {kin.pairs.map((pair, index) => {
                const saga = pair.reason.kind === 'saga';
                return (
                  <li
                    key={pair.wish.id}
                    className="kin-pair"
                    style={{ '--i': index } as CSSProperties}
                  >
                    {/* Texto de verdad y no un `aria-label`: la frase se lee entera porque los conectores que la
                        vista dice con la flecha y los chips («: … , por …») van ocultos solo a la vista. */}
                    <span className="kin-wish">{pair.wish.name}</span>
                    <span className="sr-only">: </span>
                    <span className="kin-have">
                      <Icon name="angle-right" className="kin-arrow" />
                      <span className="kin-have-label">{L.youHave}</span>{' '}
                      {/* Su ficha, sin salir del panel; sin ella, al juego en su lista, como lo abre el buscador:
                          Próximos con su nombre en el filtro. */}
                      {onOpenGame ? (
                        <button
                          type="button"
                          className="kin-have-name"
                          title={GAME_SHEET_UI.openSheetAria(pair.kin.name)}
                          onClick={() => onOpenGame(pair.kin.name)}
                        >
                          {pair.kin.name}
                        </button>
                      ) : (
                        <Link
                          to={`${TAB_ROUTE.p}?q=${encodeURIComponent(pair.kin.name)}`}
                          className="kin-have-name"
                          title={L.gameLink(pair.kin.name)}
                        >
                          {pair.kin.name}
                        </Link>
                      )}
                    </span>
                    <span className="sr-only">{L.because}</span>
                    {/* Los MISMOS chips que en los listados: la saga como los años (genérico) y el género con su tono,
                        que lleva a tus Próximos de ese género igual que el nombre lleva al juego. */}
                    <span className="chips kin-why">
                      {saga ? (
                        <span className="chip chip-generic">
                          <span className="chip-text">{L.saga}</span>
                          {pair.genre ? <span className="sr-only">, </span> : null}
                        </span>
                      ) : null}
                      {pair.genre ? (
                        <Link
                          to={`${TAB_ROUTE.p}?genre=${encodeURIComponent(pair.genre)}`}
                          className="chip chip-genre kin-chip-link"
                          style={categoryToneStyle(pair.genre)}
                          title={L.genreLink(pair.genre)}
                        >
                          <span className="chip-text">{pair.genre}</span>
                        </Link>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            {hidden > 0 ? <p className="stats-note">{L.more(hidden)}</p> : null}
          </>
        ) : (
          <p className="stats-empty">{L.noPairs}</p>
        )}
      </section>

      {kin.genres.length ? (
        <section>
          <h3>{L.genres}</h3>
          <Dumbbell
            rows={kin.genres.map((row) => ({ tag: row.tag, first: row.waiting, second: row.wished }))}
            series={[
              { label: L.legendWaiting, list: 'p' },
              { label: L.legendWished, list: 'd' },
            ]}
          />
        </section>
      ) : null}

      {kin.gaps.length ? (
        <section>
          <h3>{L.gaps}</h3>
          {/* El MISMO chip de género que en los listados, con su tono. El peso de cada hueco lo dice el orden: van
              de más a menos deseos (`core/stats/wishKin`). */}
          <ul className="chips kin-gaps">
            {kin.gaps.map((gap) => (
              <li key={gap.tag} className="chip chip-genre" style={categoryToneStyle(gap.tag)}>
                <span className="chip-text">{gap.tag}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
});
