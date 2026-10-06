import { memo, type CSSProperties } from 'react';
import { useStatsLabels } from './statsVoice';
import { StatTile } from './StatTile';
import { CountUp } from './CountUp';
import { Dumbbell } from './Dumbbell';
import { Icon } from '../Icon';
import { categoryToneStyle } from '../../../core/constants/categoryTone';
import type { WishKinSummary } from '../../../core/stats/wishKin';

/**
 * «Ya lo tienes en casa»: cada deseo frente a lo que ya espera en Próximos (`core/stats/wishKin`).
 *
 * Tres piezas, de la más directa a la más general: cuántos deseos tienen ya un pariente, cuáles son las parejas
 * y, por géneros, en qué se parecen y en qué no lo que deseas y lo que esperas. Sin parejas se queda la frase y
 * la comparación, que sigue diciendo algo: dónde un deseo cubriría un hueco.
 */
export const WishKinCard = memo(function WishKinCard({ kin }: { kin: WishKinSummary }) {
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
                // Los MISMOS chips que en los listados: el género con su tono, y la saga como los años (genérico).
                const why = pair.reason.kind === 'saga'
                  ? [{ tag: L.saga, className: 'chip-generic', tone: false }]
                  : pair.reason.shared.map((tag) => ({ tag, className: 'chip-genre', tone: true }));
                return (
                  <li
                    key={pair.wish.id}
                    className={`kin-pair${pair.reason.kind === 'saga' ? ' is-saga' : ''}`}
                    style={{ '--i': index } as CSSProperties}
                  >
                    {/* Texto de verdad y no un `aria-label`: la frase se lee entera porque los conectores que la
                        vista dice con la flecha y los chips («: … , por …») van ocultos solo a la vista. */}
                    <span className="kin-wish">{pair.wish.name}</span>
                    <span className="sr-only">: </span>
                    <span className="kin-have">
                      <Icon name="angle-right" className="kin-arrow" />
                      <span className="kin-have-label">{L.youHave}</span>{' '}
                      <span className="kin-have-name">{pair.kin.name}</span>
                    </span>
                    <span className="sr-only">{L.because}</span>
                    <span className="chips kin-why">
                      {why.map(({ tag, className, tone }, position) => (
                        <span key={tag} className={`chip ${className}`} style={tone ? categoryToneStyle(tag) : undefined}>
                          <span className="chip-text">{tag}</span>
                          {position < why.length - 1 ? <span className="sr-only">, </span> : null}
                        </span>
                      ))}
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
