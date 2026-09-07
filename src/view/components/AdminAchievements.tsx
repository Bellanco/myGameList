import { memo, useMemo, useState } from 'react';
import { ADMIN_ACHIEVEMENTS_UI } from '../../core/constants/adminLabels';
import { ACHIEVEMENT_RARITY_LABELS } from '../../core/constants/achievementLabels';
import { ACHIEVEMENTS_BY_LADDER, LADDERS } from '../../core/achievements/catalog';
import type { AchievementDef, AchievementLadder } from '../../core/achievements/types';
import { AchievementMedal } from './stats/AchievementMedal';
import { AchievementSprite } from './AchievementSprite';
import { HubBackButton } from './socialhub/HubBackButton';

const A = ADMIN_ACHIEVEMENTS_UI;

interface Group {
  ladder: AchievementLadder;
  steps: readonly AchievementDef[];
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
export const AdminAchievements = memo(function AdminAchievements({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');

  const groups = useMemo<Group[]>(
    () => LADDERS.map((ladder) => ({ ladder, steps: ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [] })),
    [],
  );

  const totals = useMemo(() => {
    const steps = groups.reduce((sum, group) => sum + group.steps.length, 0);
    const hidden = groups.filter((group) => group.ladder.hidden).length;
    const retired = groups.filter((group) => group.ladder.retired).length;
    return { ladders: groups.length, steps, hidden, retired };
  }, [groups]);

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
        </dl>

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
        </div>
      </div>

      {shown.length === 0 ? <p className="admin-card-note">{A.filterEmpty}</p> : null}

      {shown.map(({ ladder, steps }) => (
        <div className="admin-card admin-ach-ladder" key={ladder.key}>
          <header className="admin-ach-head">
            {/* La medalla del ÚLTIMO escalón: es la que lleva el temple más alto, así que de un vistazo se ve
                el dibujo y hasta dónde llega la escalera. Bloqueada da igual — aquí no se mide a nadie. */}
            {steps.length > 0 ? (
              <AchievementMedal def={steps[steps.length - 1]} level={1} size="md" />
            ) : null}
            <div className="admin-ach-head-body">
              <h3>{ladder.labels.name}</h3>
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
                {ladder.labels.condition}
              </p>
              <p className="admin-card-note">{A.ladderSteps(ladder.steps)}</p>
            </div>
          </header>

          <table className="admin-ach-table">
            <thead>
              <tr>
                <th scope="col">{A.colStep}</th>
                <th scope="col">{A.colName}</th>
                <th scope="col">{A.colGoal}</th>
                <th scope="col">{A.colDone}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((def) => (
                <tr key={def.id}>
                  <td className="admin-ach-step">{def.step}</td>
                  <td>{def.labels.name}</td>
                  <td>{def.labels.condition}</td>
                  <td>
                    {def.labels.done}
                    {/* Si el hecho y la meta son la misma frase, la escalera no escribió su `done` y el
                        respaldo la copió: se dice aquí porque en la app se lee como una tarea pendiente
                        debajo de una medalla ya ganada, y eso no salta en ningún test. */}
                    {def.labels.done === def.labels.condition ? (
                      <small className="admin-ach-warn">{A.sameText}</small>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
});
