import { memo, useCallback, useMemo, useState } from 'react';
import { ADMIN_ACHIEVEMENTS_UI } from '../../core/constants/adminLabels';
import { ACHIEVEMENTS_UI, ACHIEVEMENT_RARITY_LABELS } from '../../core/constants/achievementLabels';
import { ACHIEVEMENTS_BY_LADDER, LADDERS, SCORING_ACHIEVEMENTS } from '../../core/achievements/catalog';
import { MIRROR_ORDER, measureRarity } from '../../core/achievements/pack';
import { RARITY_POINTS } from '../../core/achievements/types';
import { copyText } from '../../core/utils/clipboard';
import type { AchievementDef, AchievementLadder } from '../../core/achievements/types';
import { AchievementMedal } from './stats/AchievementMedal';
import { AchievementSprite } from './AchievementSprite';
import { HubBackButton } from './socialhub/HubBackButton';

const A = ADMIN_ACHIEVEMENTS_UI;

interface Group {
  ladder: AchievementLadder;
  steps: readonly AchievementDef[];
}

/**
 * EL UMBRAL QUE VA EN EL HUECO: la media GEOMÉTRICA de los dos vecinos, redondeada a una cifra redonda.
 *
 * Geométrica y no aritmética porque estas escaleras son multiplicativas: entre 10 y 100, la media aritmética
 * (55) deja el primer tramo diez veces más corto que el segundo, y la geométrica (32) parte el camino por la
 * mitad de verdad. Se redondea al múltiplo de 5, 10, 25 o 50 según la magnitud —un catálogo no pide «llega a 32
 * juegos»— y se recorta a los vecinos, que es lo que impide devolver un umbral que ya existe.
 */
export function suggestStep(previous: number, next: number): number {
  // Sin sitio para un entero en medio no hay escalón que proponer: pasa en las escaleras que empiezan en 1, 2,
  // 3…, donde el salto es ×2 y aun así no cabe nada. Devuelve 0 y el botón no se ofrece.
  if (next - previous < 2) return 0;
  const raw = Math.sqrt(previous * next);
  const grain = raw < 50 ? 5 : raw < 200 ? 10 : raw < 500 ? 25 : 50;
  const rounded = Math.round(raw / grain) * grain;
  return Math.min(next - 1, Math.max(previous + 1, rounded));
}

/** Todo lo que se puede buscar de una escalera: su nombre, su clave y los textos de todos sus escalones. */
function haystack(group: Group): string {
  const parts = [group.ladder.key, group.ladder.labels.name, group.ladder.labels.condition];
  for (const def of group.steps) parts.push(def.labels.name, def.labels.condition, def.labels.done);
  return parts.join(' ').toLowerCase();
}

/**
 * CATÁLOGO DE LOGROS · la pantalla de revisión del panel de administración.
 *
 * PARA QUÉ EXISTE. El catálogo son 50 escaleras y 261 escalones, y cada escalón lleva DOS textos —la meta en
 * imperativo y el hecho en pasado—. Repartidos por la app no se pueden comparar: el listado enseña uno o otro
 * según lo tengas, el aviso solo el del desbloqueo, y las condiciones de una misma escalera no salen juntas en
 * ninguna pantalla. Aquí salen las dos, una al lado de la otra y agrupadas por escalera, que es la única forma de
 * ver que la undécima dice «Termina 500 juegos» cuando las diez anteriores tuteaban.
 *
 * SOLO LECTURA, y no por prudencia: el catálogo es CÓDIGO. Cada escalera lleva su métrica —una función sobre la
 * biblioteca— y sus `id` son contrato que no se renombra jamás (§6.4), así que no hay nada aquí que se pueda
 * guardar en una base de datos. Lo que esta pantalla aporta es la lectura de corrido.
 *
 * NO REPITE LAS CIFRAS DE NADIE. El porcentaje de gente que tiene cada logro ya vive en «Logros globales» del hub
 * social, medido sobre el directorio; traerlo aquí sería el mismo dato en dos sitios con dos formas de calcularlo.
 *
 * MONTA EL SPRITE, como las otras dos pantallas que pintan medallas: los símbolos no entran nunca en el arranque
 * (`AchievementSprite`), y esta vive en el chunk perezoso del panel de administración.
 */
export const AdminAchievements = memo(function AdminAchievements({
  onBack,
  mirrors = [],
}: {
  onBack: () => void;
  /**
   * Los espejos publicados que el censo ya se ha bajado. Vacío = sin muestra, y entonces la columna de
   * «alcanzado» se calla en vez de pintar un 0 % que parecería un dato.
   */
  mirrors?: readonly string[];
}) {
  const [query, setQuery] = useState('');
  // Los ocultos se enseñan TAPADOS por defecto —así se revisa lo que la gente ve de verdad— y este interruptor
  // los destapa SOLO en esta pantalla: no cambia el catálogo ni lo que ve nadie.
  const [reveal, setReveal] = useState(false);
  // El escalón que se está preparando: la escalera y el umbral propuesto. `null` = ninguno abierto.
  const [draft, setDraft] = useState<{ key: string; step: number } | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * EL REPARTO, con `minSample: 1`. En el hub el mínimo son 20 personas —debajo de eso, «el 14 %» es una persona
   * y enseñarlo es peor que callarlo—, pero esto es una herramienta de trabajo y aquí la cifra va SIEMPRE con su
   * denominador («4 % · 1/25»), que es lo que impide leerla como una afirmación global.
   */
  const measured = useMemo(() => measureRarity(mirrors, 1), [mirrors]);

  const groups = useMemo<Group[]>(
    () => LADDERS.map((ladder) => ({ ladder, steps: ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [] })),
    [],
  );

  const totals = useMemo(() => {
    const steps = groups.reduce((sum, group) => sum + group.steps.length, 0);
    const hidden = groups.filter((group) => group.ladder.hidden).length;
    const retired = groups.filter((group) => group.ladder.retired).length;
    // Los DORMIDOS solo se pueden contar con muestra; sin ella, la casilla se calla (`null`) en vez de decir que
    // están dormidos todos, que es lo que saldría de contar ceros.
    const asleep = measured
      ? groups.reduce(
        (sum, group) => sum + group.steps.filter((def) => (measured.percent.get(def.id) ?? 0) === 0).length,
        0,
      )
      : null;
    return { ladders: groups.length, steps, hidden, retired, asleep };
  }, [groups, measured]);

  /**
   * LO QUE HAY QUE ESCRIBIR para insertar un escalón, con las cifras de HOY y las de después.
   *
   * Se calculan aquí y no se copian de los tests a mano por el motivo de siempre: dos sitios con el mismo número
   * divergen. El total y el techo salen de `SCORING_ACHIEVEMENTS` —lo que puntúa: fuera primeros pasos y
   * retirados— y los bits, de la longitud del orden congelado.
   */
  const plan = useMemo(() => {
    if (!draft) return null;
    const ladder = LADDERS.find((entry) => entry.key === draft.key);
    if (!ladder) return null;
    const steps = [...ladder.steps, draft.step].sort((a, b) => a - b);
    const index = steps.indexOf(draft.step);
    const total = SCORING_ACHIEVEMENTS.length;
    const points = SCORING_ACHIEVEMENTS.reduce((sum, def) => sum + RARITY_POINTS[def.rarity], 0);
    // El escalón nuevo puntúa salvo que su escalera esté retirada o sea de primeros pasos.
    const scores = ladder.family !== 'onboarding' && !ladder.retired;
    const bits = MIRROR_ORDER.length;
    const publishes = ladder.family !== 'onboarding';
    // El primero que se renumera: el que hoy ocupa la posición del nuevo.
    const renamed = (ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [])[index];
    return {
      id: `${ladder.key}-${draft.step}`,
      steps: steps.join(', '),
      total: [total, scores ? total + 1 : total] as [number, number],
      points: [points, scores ? points + RARITY_POINTS[ladder.rarity] : points] as [number, number],
      bits: [bits, publishes ? bits + 1 : bits] as [number, number],
      renamed: renamed?.labels.name || '',
    };
  }, [draft]);

  const copyPlan = useCallback(() => {
    if (!plan || !draft) return;
    void copyText([
      A.prepareTitle(draft.key, draft.step),
      A.prepareCatalog(plan.steps),
      A.prepareMirror(plan.id),
      A.prepareTests(plan.total, plan.points, plan.bits),
    ].join('\n')).then((ok) => setCopied(ok));
  }, [plan, draft]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) => haystack(group).includes(needle));
  }, [groups, query]);

  return (
    <section className="admin-hub" aria-label={A.sectionAria}>
      <AchievementSprite />

      <p className="admin-ach-back">
        <HubBackButton onBack={onBack} label={A.back} />
      </p>

      <div className="admin-card">
        <h2>{A.title}</h2>
        <p className="admin-card-sub">{A.subtitle}</p>
        <p className="admin-card-note">{A.note}</p>

        <dl className="admin-totals" aria-label={A.totals.aria}>
          <div><dt>{A.totals.ladders}</dt><dd>{totals.ladders}</dd></div>
          <div><dt>{A.totals.steps}</dt><dd>{totals.steps}</dd></div>
          <div><dt>{A.totals.hidden}</dt><dd>{totals.hidden}</dd></div>
          <div><dt>{A.totals.retired}</dt><dd>{totals.retired}</dd></div>
          <div className={totals.asleep ? 'admin-total-flagged' : undefined}>
            <dt>{A.asleepTotal}</dt><dd>{totals.asleep === null ? '—' : totals.asleep}</dd>
          </div>
        </dl>

        <p className="admin-card-note">{measured ? A.sampleNote(measured.sample) : A.noSample}</p>

        <div className="admin-ach-tools">
          <label className="admin-ach-filter">
            {A.filterLabel}
            <input
              type="search"
              value={query}
              placeholder={A.filterPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p className="admin-card-note">{A.matches(shown.length, groups.length)}</p>
          <button
            type="button"
            className={`btn btn-secondary ${reveal ? 'is-active' : ''}`.trim()}
            aria-pressed={reveal}
            onClick={() => setReveal((value) => !value)}
          >
            {reveal ? A.hideHidden : A.revealHidden}
          </button>
        </div>

        {/* EL ESQUEMA, plegado. La pantalla enseña nueve datos por fila y tres de ellos son señales que no se
            adivinan; plegado no estorba a quien ya los conoce y está a un clic para quien no. */}
        <details className="admin-ach-legend">
          <summary>{A.legendTitle}</summary>
          <dl>
            {A.legend.map(([term, description]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      {plan && draft ? (
        <div className="admin-card admin-ach-plan">
          <h3>{A.prepareTitle(draft.key, draft.step)}</h3>
          <ol>
            <li><code>{A.prepareCatalog(plan.steps)}</code></li>
            <li><code>{A.prepareMirror(plan.id)}</code></li>
            <li><code>{A.prepareTests(plan.total, plan.points, plan.bits)}</code></li>
          </ol>
          {plan.renamed ? <p className="admin-ach-warn-soft">{A.prepareRename(plan.renamed)}</p> : null}
          <p className="admin-card-actions">
            <button type="button" className="btn" onClick={copyPlan}>{A.prepareCopy}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{A.prepareClose}</button>
            {copied ? <span className="admin-ach-copied">{A.prepareCopied}</span> : null}
          </p>
        </div>
      ) : null}

      {shown.length === 0 ? <p className="admin-card-note">{A.filterEmpty}</p> : null}

      {shown.map(({ ladder, steps }) => {
        // TAPADO = es oculto y el interruptor está apagado. Lo que se enseña entonces es literalmente lo que ve
        // la gente que aún no lo tiene: el «?» de la medalla, «Logro oculto» y «Se revela al conseguirlo».
        const masked = Boolean(ladder.hidden) && !reveal;
        return (
        <div className="admin-card admin-ach-ladder" key={ladder.key}>
          <header className="admin-ach-head">
            {/* La medalla del ÚLTIMO escalón: es la que lleva el temple más alto, así que de un vistazo se ve
                el dibujo y hasta dónde llega la escalera. Bloqueada da igual — aquí no se mide a nadie. */}
            {steps.length > 0 ? (
              <AchievementMedal def={steps[steps.length - 1]} level={1} size="md" masked={masked} />
            ) : null}
            <div className="admin-ach-head-body">
              <h3>{masked ? ACHIEVEMENTS_UI.hiddenName : ladder.labels.name}</h3>
              <p className="admin-ach-meta">
                <span>{A.families[ladder.family]}</span>
                <span>{ACHIEVEMENT_RARITY_LABELS[ladder.rarity]}</span>
                <code>{A.ladderKey(ladder.key)}</code>
                <span>{A.ladderIcon(ladder.icon)}</span>
                {ladder.descending ? <span className="admin-ach-flag">{A.descending}</span> : null}
                {ladder.hidden ? <span className="admin-ach-flag">{A.hidden}</span> : null}
                {ladder.retired ? <span className="admin-ach-flag">{A.retired}</span> : null}
              </p>
              <p className="admin-ach-condition">
                <small>{A.ladderCondition}</small>
                {masked ? ACHIEVEMENTS_UI.hiddenCondition : ladder.labels.condition}
              </p>
              <p className="admin-card-note">{A.ladderSteps(ladder.steps)}</p>
            </div>
          </header>

          <table className="admin-ach-table">
            <thead>
              <tr>
                <th scope="col">{A.colStep}</th>
                <th scope="col">{A.colName}</th>
                <th scope="col">{A.colOffered}</th>
                <th scope="col">{A.colReached}</th>
                <th scope="col">{A.colGoal}</th>
                <th scope="col">{A.colDone}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((def, index) => {
                // OFRECIDO es del catálogo: un retirado sigue pintándose a quien lo tenga, pero ya no se propone.
                const offered = !def.retired;
                const percent = measured?.percent.get(def.id) ?? 0;
                const holders = measured ? Math.round((percent / 100) * measured.sample) : 0;
                const previous = index > 0 ? steps[index - 1] : null;
                // LA FRONTERA: el PRIMER escalón de la escalera al que no ha llegado nadie. Es el que está en
                // juego, y el único que merece la marca: los de más arriba también están a cero y repetir
                // «Dormido» nueve veces tapaba justo la línea que se busca.
                const frontier = Boolean(measured)
                  && percent === 0
                  && (!previous || (measured?.percent.get(previous.id) ?? 0) > 0);
                // EL HUECO sale de los umbrales, así que se ve SIN muestra: es lo que dice «entre el 100 y el 200
                // hay un trayecto largo sin ninguna medalla». Solo hacia arriba: en una escalera descendente el
                // cociente no significa lo mismo.
                const factor = previous && !def.descending && previous.step > 0 ? def.step / previous.step : 0;
                const gap = factor >= 2 ? factor.toFixed(factor % 1 === 0 ? 0 : 1) : '';
                // LA CAÍDA necesita muestra: del escalón anterior a este se pierde a casi todo el mundo, que es
                // el mismo síntoma medido en gente en vez de en umbrales.
                const previousPercent = previous && measured ? (measured.percent.get(previous.id) ?? 0) : 0;
                const cliff = Boolean(measured) && previousPercent >= 10 && percent * 4 <= previousPercent;
                return (
                <tr key={def.id}>
                  <td className="admin-ach-step">{def.step}</td>
                  <td>{masked ? ACHIEVEMENTS_UI.hiddenName : def.labels.name}</td>
                  <td className="admin-ach-offered">{offered ? A.offeredYes : A.offeredNo}</td>
                  <td className="admin-ach-reached">
                    {measured ? (
                      <>
                        <span className={percent === 0 ? 'admin-ach-warn-soft' : undefined}>
                          {A.reached(percent, holders, measured.sample)}
                        </span>
                        {frontier ? <small className="admin-ach-warn-soft">{A.asleep}</small> : null}
                        {percent >= 90 ? <small className="admin-ach-warn-soft">{A.gift}</small> : null}
                        {cliff ? <small className="admin-ach-warn">{A.cliff}</small> : null}
                      </>
                    ) : <span className="admin-ach-nodata">—</span>}
                    {/* El hueco va aquí aunque no dependa de la muestra: es la misma pregunta —«¿falta un
                        escalón entre estos dos?»— y separarlo en otra columna la partía en dos. */}
                    {gap ? <small className="admin-ach-gap">{A.gap(gap)}</small> : null}
                    {/* EL PANEL NO AÑADE EL ESCALÓN: deja el cambio escrito. El `id` tiene que llegar al código
                        para que el logro se publique en el espejo, así que lo útil aquí es no olvidarse de
                        ninguno de los tres pasos, y eso es lo que da el botón. Solo donde hay hueco. */}
                    {gap && previous && !masked && suggestStep(previous.step, def.step) > 0 ? (
                      <button
                        type="button"
                        className="admin-ach-prepare"
                        onClick={() => {
                          setCopied(false);
                          setDraft({ key: ladder.key, step: suggestStep(previous.step, def.step) });
                        }}
                      >
                        {A.prepare(suggestStep(previous.step, def.step))}
                      </button>
                    ) : null}
                  </td>
                  <td>{masked ? ACHIEVEMENTS_UI.hiddenCondition : def.labels.condition}</td>
                  <td>
                    {masked ? ACHIEVEMENTS_UI.hiddenCondition : def.labels.done}
                    {/* Si el hecho y la meta son la misma frase, la escalera no escribió su `done` y el
                        respaldo la copió: se dice aquí porque en la app se lee como una tarea pendiente
                        debajo de una medalla ya ganada, y eso no salta en ningún test. */}
                    {!masked && def.labels.done === def.labels.condition ? (
                      <small className="admin-ach-warn">{A.sameText}</small>
                    ) : null}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })}
    </section>
  );
});
