import { memo, useCallback, useMemo, useState } from 'react';
import { ADMIN_ACHIEVEMENTS_UI } from '../../core/constants/adminLabels';
import { ACHIEVEMENT_RARITY_LABELS } from '../../core/constants/achievementLabels';
import { ACHIEVEMENTS_BY_LADDER, LADDERS, SCORING_ACHIEVEMENTS } from '../../core/achievements/catalog';
import { MIRROR_ORDER, measureRarity } from '../../core/achievements/pack';
import { RARITY_POINTS } from '../../core/achievements/types';
import { copyText } from '../../core/utils/clipboard';
import type { AchievementDef, AchievementLadder } from '../../core/achievements/types';
import { isHidden, type HiddenOverrides, type OpenFrontier } from '../../core/achievements/visibility';
import { AchievementMedal } from './stats/AchievementMedal';
import { AchievementSprite } from './AchievementSprite';
import { HubBackButton } from './socialhub/HubBackButton';

const A = ADMIN_ACHIEVEMENTS_UI;

interface Group {
  ladder: AchievementLadder;
  steps: readonly AchievementDef[];
}

/**
 * LOS ESCALONES QUE HOY NO TIENE NADIE DELANTE. Devuelve los `id` que, con la muestra que hay, no le aparecen en
 * pantalla a ninguna persona del censo.
 *
 * ES EL REVERSO DE LA APERTURA: lo que `openThrough` deja fuera. Un escalón abierto se le enseña a todo el mundo
 * y uno cerrado no se le enseña a nadie, ni al que va en cabeza.
 *
 * NO ES «NADIE HA LLEGADO», y la diferencia es justo lo que esta pantalla tenía que poder decir. Un escalón al
 * que no ha llegado nadie SÍ está abierto —es el reto de quien tiene el anterior—, y son los de MÁS ARRIBA los
 * que no ve nadie, porque para que un escalón se abra tiene que haber llegado alguien al de debajo.
 *
 * Ejemplo, con «Un verano entero» (1, 3, 5, 10, 15, 25, 40, 60, 75) y 43 espejos en los que el que más lejos ha
 * llegado tiene el 15:
 *
 *     15 → 2/43   lo tienen dos                          ·  se ve
 *     25 → 0/43   nadie ha llegado, pero es SU siguiente ·  se ve  ← la frontera
 *     40 → 0/43   nadie tiene el 25                      ·  NO LO VE NADIE
 *     60 → 0/43                                          ·  NO LO VE NADIE
 *     75 → 0/43                                          ·  NO LO VE NADIE
 *
 * En cuanto alguien alcance el 25, el 40 pasa a verse y la línea sube sola.
 *
 * TRES REGLAS, las mismas que aplica `listForScreen` (`viewmodel/useAchievements`), que es de donde tienen que
 * salir para que la pantalla no invente una visibilidad propia:
 *
 *  1. lo CONSEGUIDO se ve siempre, así que cualquier escalón con gente detrás se ve;
 *  2. de lo que falta se enseña UNO: el primero que se le resiste a cada quien. Por eso basta con mirar si el
 *     escalón ofrecido anterior tiene a alguien —y por eso el primero de la escalera lo ve todo el mundo;
 *  3. un RETIRADO no se ofrece y tampoco gasta ese turno: no se lo enseña a nadie y el siguiente ocupa su sitio.
 *
 * Y con la escalera OCULTA no hay zanahoria que valga: `withoutHidden` se lleva por delante todo lo que no esté
 * conseguido, así que ahí no se ve nada que no tenga ya alguien. Es la consecuencia del interruptor, dibujada.
 */
export function unseenSteps(
  steps: readonly AchievementDef[],
  holdersOf: (def: AchievementDef) => number,
  hidden: boolean,
): ReadonlySet<string> {
  const unseen = new Set<string>();
  // Cuánta gente tiene el último escalón OFRECIDO que va por delante de este. `null` = ninguno todavía, es decir,
  // este es el primero que se ofrece: la zanahoria de quien no tiene nada de esta escalera.
  let previousOffered: number | null = null;
  for (const def of steps) {
    const holders = holdersOf(def);
    const offered = !def.retired;
    const seen = holders > 0
      || (offered && !hidden && (previousOffered === null || previousOffered > 0));
    if (!seen) unseen.add(def.id);
    if (offered) previousOffered = holders;
  }
  return unseen;
}

/**
 * LA FRONTERA QUE SE PUBLICA: por escalera, el `id` del escalón más alto al que ha llegado alguien del censo.
 *
 * Es el ÚNICO dato que ningún cliente puede calcular por su cuenta —haría falta leerse los espejos de todos— y
 * es lo que abre la escalera para todo el mundo. Sale de la misma medición que ya pinta esta pantalla, así que
 * lo que se publica es exactamente lo que se está viendo.
 *
 * Una escalera sin nadie no entra en el mapa: «no se sabe de nadie» y «alguien llegó al primero» no son lo
 * mismo, y meterla con un valor vacío obligaría a distinguirlo al leer.
 */
export function measuredFrontier(
  groups: readonly Group[],
  holdersOf: (def: AchievementDef) => number,
): Record<string, string> {
  const frontier: Record<string, string> = {};
  for (const { ladder, steps } of groups) {
    let furthest = '';
    for (const def of steps) {
      if (holdersOf(def) > 0) furthest = def.id;
    }
    if (furthest) frontier[ladder.key] = furthest;
  }
  return frontier;
}

/** Lo que hay que escribir para insertar un escalón. Con `error`, lo demás va vacío y no se pinta. */
interface Plan {
  error: string;
  id: string;
  steps: string;
  total: [number, number];
  points: [number, number];
  bits: [number, number];
  renamed: string;
}

const NO_PLAN = (error: string): Plan =>
  ({ error, id: '', steps: '', total: [0, 0], points: [0, 0], bits: [0, 0], renamed: '' });

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
 * CÓMO SE ORDENA LO QUE SE VE, que es lo que la hace legible siendo tan larga:
 *
 *   · una BARRA PEGADA ARRIBA con la salida, el buscador y el recuento — lo único que se usa desde cualquier
 *     punto de una pantalla de cincuenta fichas;
 *   · una CABECERA de tres líneas: título, cifras del catálogo en una sola fila y la nota de la muestra. Lo que
 *     explica la pantalla (el esquema de términos y el «esto es solo lectura») va plegado debajo;
 *   · el listado PARTIDO POR FAMILIAS, con su encabezado. El orden ya venía agrupado —así se declara el
 *     catálogo— pero nada lo decía, y de paso la familia deja de repetirse en cada ficha;
 *   · y una tabla de CINCO columnas por escalera. Eran seis: «Ofrecido» decía «Sí» en 259 de 261 escalones, así
 *     que la excepción pasó a ser una marca junto al nombre y la columna se fue.
 *
 * DOS EJES QUE NO SE PUEDEN MEZCLAR, y mezclarlos era el fallo que se llevaba la pantalla por delante:
 *
 *   · **QUÉ ESCALONES ESTÁN ABIERTOS** — y están abiertos PARA TODOS o para nadie: en cuanto un usuario ve un
 *     escalón, se le enseña a todo el mundo. La línea es el primer escalón al que no ha llegado nadie —ese se
 *     ofrece, es el reto del que va delante— y de ahí para arriba no se enseña nada. Lo que distingue a dos
 *     personas es lo que llevan CONSEGUIDO, no la lista. Encima manda el interruptor de ocultación: oculta, la
 *     escalera desaparece ENTERA para quien no tiene ningún escalón suyo —y con ella ese reto—, mientras que a
 *     quien ya tiene uno no se le quita nunca.
 *   · **CUÁNTA GENTE HA LLEGADO** — sale de los espejos publicados del censo. Alimenta la línea de arriba (es de
 *     donde sale la apertura que publica esta pantalla), pero las señales de la columna miden PERSONAS y no
 *     visibilidad: a un escalón al que no ha llegado nadie se le sigue ofreciendo.
 *
 * Los nombres viejos los confundían: «Dormido» describía un escalón al que no ha llegado NADIE, y se leía como
 * «apagado, no se enseña». Por eso las tres señales de la muestra hablan ahora de gente («Nadie ha llegado»,
 * «Casi todos lo tienen», «Aquí se cae la gente») y la visibilidad se escribe entera en la línea de estado de
 * cada escalera, con su consecuencia incluida.
 *
 * MONTA EL SPRITE, como las otras dos pantallas que pintan medallas: los símbolos no entran nunca en el arranque
 * (`AchievementSprite`), y esta vive en el chunk perezoso del panel de administración.
 */
export const AdminAchievements = memo(function AdminAchievements({
  onBack,
  mirrors = [],
  hiddenOverrides = {},
  onToggleHidden,
  openFrontier,
  onPublishFrontier,
}: {
  onBack: () => void;
  /**
   * Los espejos publicados que el censo ya se ha bajado. Vacío = sin muestra, y entonces la columna de
   * «alcanzado» se calla en vez de pintar un 0 % que parecería un dato.
   */
  mirrors?: readonly string[];
  /** Lo que hoy dice la configuración: qué escaleras están ocultas para quien no las tiene. */
  hiddenOverrides?: HiddenOverrides;
  /**
   * Guarda el cambio. Lo hace el hub (que es quien habla con Firestore) y no esta pantalla: así se puede probar
   * sin emulador y la pantalla sigue sin saber que existe una base de datos.
   */
  onToggleHidden?: (ladderKey: string, hidden: boolean) => Promise<void>;
  /** La apertura que hay PUBLICADA hoy, para poder decir si la medición de ahora ya está en la calle. */
  openFrontier?: OpenFrontier;
  /**
   * Publica la apertura medida. La escribe el hub, como el interruptor de ocultación: esta pantalla no sabe que
   * existe una base de datos, y así se puede probar sin emulador.
   */
  onPublishFrontier?: (open: OpenFrontier) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  // El escalón que se está preparando: la escalera y el umbral propuesto. `null` = ninguno abierto.
  const [draft, setDraft] = useState<{ key: string; step: number } | null>(null);
  const [copied, setCopied] = useState(false);
  // Cómo fue el último guardado de cada escalera. Se dice en su ficha, no en un aviso global: cuando fallan las
  // reglas hay que saber CUÁL no se guardó.
  const [saved, setSaved] = useState<Record<string, 'saving' | 'ok' | 'error'>>({});
  // Cómo fue la última publicación de la apertura. `null` = no se ha tocado en esta visita.
  const [publishing, setPublishing] = useState<'saving' | 'ok' | 'error' | null>(null);

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

  /**
   * ¿ESTÁ OCULTA ESTA ESCALERA HOY? El interruptor guardado manda sobre lo que declara el catálogo, que es lo que
   * hace `isHidden`. Se resuelve UNA VEZ aquí y lo usan la cifra de cabecera, la marca de la ficha y la línea de
   * estado: mientras cada uno lo miraba por su cuenta, la cifra y la marca leían `ladder.hidden` —el catálogo— y
   * se quedaban clavadas al ocultar o revelar desde el panel, contradiciendo al botón de al lado.
   */
  const hiddenOf = useCallback(
    (group: Group): boolean => (group.steps.length > 0
      ? isHidden(group.steps[0], hiddenOverrides)
      : Boolean(group.ladder.hidden)),
    [hiddenOverrides],
  );

  /** Cuánta gente tiene cada escalón, en personas. Es la unidad en la que se decide todo lo de esta pantalla. */
  const holdersOf = useCallback(
    (def: AchievementDef): number => (measured
      ? Math.round(((measured.percent.get(def.id) ?? 0) / 100) * measured.sample)
      : 0),
    [measured],
  );

  /**
   * LA APERTURA QUE SALE DE LA MUESTRA DE AHORA, y si coincide con la publicada. Se compara el mapa entero
   * —cincuenta entradas— y no una marca de tiempo: lo que importa no es cuándo se publicó sino si lo que ve la
   * gente es lo que se está viendo aquí.
   */
  const frontier = useMemo(() => {
    if (!measured) return null;
    const next = measuredFrontier(groups, holdersOf);
    const keys = Object.keys(next);
    const published = openFrontier || {};
    const same = keys.length === Object.keys(published).length
      && keys.every((key) => published[key] === next[key]);
    return { next, ladders: keys.length, same };
  }, [measured, groups, holdersOf, openFrontier]);

  const totals = useMemo(() => {
    const steps = groups.reduce((sum, group) => sum + group.steps.length, 0);
    const hidden = groups.filter(hiddenOf).length;
    const retired = groups.filter((group) => group.ladder.retired).length;
    // Los escalones SIN NADIE solo se pueden contar con muestra; sin ella, la casilla se calla (`null`) en vez de
    // decir que no ha llegado nadie a ninguno, que es lo que saldría de contar ceros.
    const asleep = measured
      ? groups.reduce(
        (sum, group) => sum + group.steps.filter((def) => (measured.percent.get(def.id) ?? 0) === 0).length,
        0,
      )
      : null;
    return { ladders: groups.length, steps, hidden, retired, asleep };
  }, [groups, hiddenOf, measured]);

  /**
   * LO QUE HAY QUE ESCRIBIR para insertar un escalón, con las cifras de HOY y las de después.
   *
   * Se calculan aquí y no se copian de los tests a mano por el motivo de siempre: dos sitios con el mismo número
   * divergen. El total y el techo salen de `SCORING_ACHIEVEMENTS` —lo que puntúa: fuera primeros pasos y
   * retirados— y los bits, de la longitud del orden congelado.
   */
  const plan = useMemo<Plan | null>(() => {
    if (!draft) return null;
    const ladder = LADDERS.find((entry) => entry.key === draft.key);
    if (!ladder) return null;
    // EL NÚMERO LO ELIGE QUIEN MIRA, así que hay dos formas de equivocarse y las dos se dicen: un umbral que no
    // es un entero positivo y uno que ya existe (que daría dos escalones con el mismo `id`).
    if (!Number.isInteger(draft.step) || draft.step <= 0) return NO_PLAN(A.prepareInvalid);
    if (ladder.steps.includes(draft.step)) return NO_PLAN(A.prepareTaken(draft.step));
    // Y SE RECOLOCA: la lista se ordena, así que da igual por dónde entre el umbral nuevo.
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
      error: '',
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

  /**
   * EL LISTADO, PARTIDO POR FAMILIAS. Cincuenta fichas seguidas son un muro sin asideros, y el orden ya venía
   * agrupado —el catálogo se declara así— pero nada lo decía: el cambio de tramo había que reconocerlo por el
   * contenido. Con un encabezado por familia la pantalla se barre, y de paso la familia deja de repetirse en la
   * ficha de cada escalera (cincuenta veces la misma palabra).
   *
   * EL ORDEN DE LAS FAMILIAS SALE DEL CATÁLOGO, no de una lista escrita aquí: así una familia nueva aparece sola
   * y en el sitio en que se declaró, en vez de caerse del listado en silencio.
   */
  const sections = useMemo(() => {
    const order = [...new Set(LADDERS.map((ladder) => ladder.family))];
    return order
      .map((family) => ({ family, ladders: shown.filter((group) => group.ladder.family === family) }))
      .filter((section) => section.ladders.length > 0);
  }, [shown]);

  return (
    <section className="admin-hub admin-ach" aria-label={A.sectionAria}>
      <AchievementSprite />

      {/* LA BARRA, PEGADA ARRIBA. La salida y el buscador son lo único que se usa DESDE CUALQUIER PUNTO de una
          pantalla que mide cincuenta fichas: sueltos en la cabecera obligaban a subir del todo cada vez que se
          quería cambiar de escalera. El recuento va con ellos porque es el resultado de la búsqueda. */}
      <div className="admin-ach-bar">
        <HubBackButton onBack={onBack} label={A.back} />
        <label className="admin-ach-filter">
          {/* El rótulo va para lector de pantalla: el campo ya se explica con su marcador de posición y su
              icono de lupa, y escrito ocupaba una línea entera de la barra. */}
          <span className="sr-only">{A.filterLabel}</span>
          <input
            type="search"
            value={query}
            placeholder={A.filterPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p className="admin-ach-count">{A.matches(shown.length, groups.length)}</p>
      </div>

      <div className="admin-card admin-ach-intro">
        <h2>{A.title}</h2>
        <p className="admin-card-sub">{A.subtitle}</p>

        {/* LAS CIFRAS, EN UNA LÍNEA DE NÚMEROS y no en cinco cajas: son el titular de la pantalla, no su
            contenido, y en cajas ocupaban más alto que la primera escalera del listado. */}
        <dl className="admin-ach-figures" aria-label={A.totals.aria}>
          <div><dt>{A.totals.ladders}</dt><dd>{totals.ladders}</dd></div>
          <div><dt>{A.totals.steps}</dt><dd>{totals.steps}</dd></div>
          <div><dt>{A.totals.hidden}</dt><dd>{totals.hidden}</dd></div>
          <div><dt>{A.totals.retired}</dt><dd>{totals.retired}</dd></div>
          <div className={totals.asleep ? 'admin-ach-figure-flagged' : undefined}>
            <dt>{A.asleepTotal}</dt><dd>{totals.asleep === null ? '—' : totals.asleep}</dd>
          </div>
        </dl>

        <p className="admin-card-note">{measured ? A.sampleNote(measured.sample) : A.noSample}</p>

        {/* LA APERTURA COMUNITARIA. Va en la cabecera y no en cada escalera porque es UNA decisión para las
            cincuenta, y se publica A MANO: es la única escritura de esta pantalla que cambia el listado de todo
            el mundo sin que nadie toque un interruptor, y hacerla sola por el hecho de mirar sería justo lo que
            no debe pasar. */}
        {onPublishFrontier ? (
          <div className="admin-ach-frontier">
            <h3>{A.frontierTitle}</h3>
            <p className="admin-card-note">
              {!frontier
                ? A.frontierNone
                : frontier.same
                  ? A.frontierSame(frontier.ladders)
                  : A.frontierStale(frontier.ladders)}
            </p>
            {frontier && !frontier.same ? (
              <p className="admin-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={publishing === 'saving'}
                  onClick={() => {
                    setPublishing('saving');
                    void onPublishFrontier(frontier.next)
                      .then(() => setPublishing('ok'))
                      .catch(() => setPublishing('error'));
                  }}
                >
                  {publishing === 'saving' ? A.frontierPublishing : A.frontierPublish}
                </button>
              </p>
            ) : null}
            {publishing === 'ok' ? <p className="admin-ach-copied">{A.frontierPublished}</p> : null}
            {publishing === 'error' ? <p className="admin-ach-warn">{A.frontierFailed}</p> : null}
          </div>
        ) : null}

        {/* EL ESQUEMA, plegado, y con él la nota de «esto es solo lectura». Las dos explican la pantalla y
            ninguna se lee dos veces: juntas y a un clic estorban menos que sueltas en la cabecera. */}
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
          <p className="admin-card-note">{A.note}</p>
        </details>
      </div>

      {plan && draft ? (
        <div className="admin-card admin-ach-plan">
          <h3>{A.prepareTitle(draft.key, draft.step)}</h3>

          <label className="admin-ach-plan-field">
            {A.prepareField}
            <input
              type="number"
              min={1}
              step={1}
              value={draft.step}
              onChange={(event) => {
                setCopied(false);
                setDraft({ key: draft.key, step: Math.trunc(Number(event.target.value)) });
              }}
            />
            <small>{A.prepareHelp}</small>
          </label>

          {plan.error ? <p className="admin-ach-warn">{plan.error}</p> : null}
          {plan.error ? null : (
          <ol>
            <li><code>{A.prepareCatalog(plan.steps)}</code></li>
            <li><code>{A.prepareMirror(plan.id)}</code></li>
            <li><code>{A.prepareTests(plan.total, plan.points, plan.bits)}</code></li>
          </ol>
          )}
          {plan.renamed ? <p className="admin-ach-warn-soft">{A.prepareRename(plan.renamed)}</p> : null}
          <p className="admin-card-actions">
            <button type="button" className="btn" onClick={copyPlan} disabled={Boolean(plan.error)}>{A.prepareCopy}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{A.prepareClose}</button>
            {copied ? <span className="admin-ach-copied">{A.prepareCopied}</span> : null}
          </p>
        </div>
      ) : null}

      {shown.length === 0 ? <p className="admin-ach-empty">{A.filterEmpty}</p> : null}

      {sections.map(({ family, ladders }) => (
        <div className="admin-ach-family" key={family}>
          <h3 className="admin-ach-family-head">
            <span>{A.families[family]}</span>
            <small>{A.familyCount(ladders.length)}</small>
          </h3>

          {ladders.map(({ ladder, steps }) => {
            // AQUÍ NO SE TAPA NADA: es la pantalla donde hay que LEER los textos, y un «?» no se revisa. Lo que se
            // enseña es si la escalera está escondida para quien no la tiene, y el botón lo cambia para todo el
            // mundo. Estado EFECTIVO: el interruptor si lo hay, y si no, lo que declara el catálogo.
            const hidden = hiddenOf({ ladder, steps });
            const state = saved[ladder.key];
            // Una vez por escalera y no por fila: la regla mira al escalón anterior, así que se resuelve
            // recorriéndola entera. Sin muestra no se marca nada — no habría con qué saberlo.
            const unseen = measured ? unseenSteps(steps, holdersOf, hidden) : null;
            return (
            <article className="admin-card admin-ach-ladder" key={ladder.key}>
              <header className="admin-ach-head">
                {/* La medalla del ÚLTIMO escalón: es la que lleva el temple más alto, así que de un vistazo se ve
                    el dibujo y hasta dónde llega la escalera. Bloqueada da igual — aquí no se mide a nadie. */}
                {steps.length > 0 ? (
                  <AchievementMedal def={steps[steps.length - 1]} level={1} size="md" />
                ) : null}
                <div className="admin-ach-head-body">
                  <h4>{ladder.labels.name}</h4>
                  <p className="admin-ach-condition">
                    <small>{A.ladderCondition}</small>
                    {ladder.labels.condition}
                  </p>
                  {/* La ficha técnica, SIN la familia: la pone el encabezado del tramo, y repetirla en cada una
                      de las cincuenta fichas era la palabra que más veces salía en la pantalla. */}
                  <p className="admin-ach-meta">
                    <span className="admin-ach-rarity">{ACHIEVEMENT_RARITY_LABELS[ladder.rarity]}</span>
                    <code>{A.ladderKey(ladder.key)}</code>
                    <span>{A.ladderIcon(ladder.icon)}</span>
                    {ladder.descending ? <span className="admin-ach-flag">{A.descending}</span> : null}
                    {/* La marca sigue al estado EFECTIVO y no a `ladder.hidden`: con el interruptor del panel por
                        encima, la del catálogo mentía en cuanto se ocultaba o se revelaba una escalera. */}
                    {hidden ? <span className="admin-ach-flag">{A.hidden}</span> : null}
                    {ladder.retired ? <span className="admin-ach-flag">{A.retired}</span> : null}
                  </p>
                </div>

                {/* EL INTERRUPTOR, a la derecha de la cabecera. Es la única acción que cambia lo que ve la gente,
                    así que va donde se identifica la escalera y no perdido entre sus datos. */}
                {onToggleHidden ? (
                  <div className="admin-ach-visibility">
                    <span className={hidden ? 'admin-ach-warn-soft' : undefined}>
                      {hidden ? A.hiddenNow : A.visibleNow}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state === 'saving'}
                      onClick={() => {
                        setSaved((prev) => ({ ...prev, [ladder.key]: 'saving' }));
                        void onToggleHidden(ladder.key, !hidden)
                          .then(() => setSaved((prev) => ({ ...prev, [ladder.key]: 'ok' })))
                          .catch(() => setSaved((prev) => ({ ...prev, [ladder.key]: 'error' })));
                      }}
                    >
                      {hidden ? A.show : A.hide}
                    </button>
                    {state === 'saving' ? <small>{A.hiddenSaving}</small> : null}
                    {/* El guardado no es instantáneo para los usuarios y se dice: la app lee este ajuste al abrir
                        la pantalla de logros, no en vivo (`firestore/lite` no tiene listeners). */}
                    {state === 'ok' ? <small className="admin-ach-copied">{A.hiddenSaved}</small> : null}
                    {state === 'error' ? <small className="admin-ach-warn">{A.hiddenFailed}</small> : null}
                  </div>
                ) : null}
              </header>

              {/* La tabla no puede empujar el ancho de la página: se desplaza DENTRO de su envoltorio y no de la
                  tarjeta, para que la cabecera de la escalera no se vaya de viaje con ella. */}
              <div className="admin-ach-scroll">
                <table className="admin-ach-table">
                  <thead>
                    <tr>
                      <th scope="col">{A.colStep}</th>
                      <th scope="col">{A.colName}</th>
                      <th scope="col">{A.colReached}</th>
                      <th scope="col">{A.colGoal}</th>
                      <th scope="col">{A.colDone}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((def, index) => {
                      const percent = measured?.percent.get(def.id) ?? 0;
                      const holders = measured ? Math.round((percent / 100) * measured.sample) : 0;
                      const previous = index > 0 ? steps[index - 1] : null;
                      // LA FRONTERA: el PRIMER escalón de la escalera al que no ha llegado nadie. Es el que está en
                      // juego, y el único que merece la marca: los de más arriba también están a cero y repetir
                      // «Dormido» nueve veces tapaba justo la línea que se busca.
                      const frontier = Boolean(measured)
                        && percent === 0
                        && (!previous || (measured?.percent.get(previous.id) ?? 0) > 0);
                      // LA CAÍDA: del escalón anterior a este se pierde a casi todo el mundo. Es la única señal de
                      // «aquí cabe un intermedio» que queda, y se mide en GENTE. La que salía de los umbrales
                      // («Salto ×2.5») se retiró: decía lo mismo dos veces y en una columna que habla de personas.
                      const previousPercent = previous && measured ? (measured.percent.get(previous.id) ?? 0) : 0;
                      const cliff = Boolean(measured) && previousPercent >= 10 && percent * 4 <= previousPercent;
                      // NADIE LO TIENE DELANTE: ni conseguido ni ofrecido como siguiente reto a una sola persona
                      // del censo. Es el tramo muerto de la escalera, y se marca en la fila entera porque siempre
                      // son los de arriba: de un vistazo se ve dónde deja de tirar de alguien.
                      const nobodySees = Boolean(unseen?.has(def.id));
                      // EL RÓTULO, UNA VEZ: en la primera del tramo. El raíl del canto ya une el bloque entero, y
                      // repetir «hoy no lo ve nadie» en cada fila tapaba justo la línea que se busca —dónde deja
                      // de verse la escalera— con cuatro copias de lo mismo. Es el criterio de la frontera.
                      const opensUnseen = nobodySees && !(previous && unseen?.has(previous.id));
                      return (
                      <tr key={def.id} className={nobodySees ? 'is-unseen' : undefined}>
                        <td className="admin-ach-step">{def.step}</td>
                        <td className="admin-ach-name">
                          {def.labels.name}
                          {/* OFRECIDO ERA UNA COLUMNA y ahora es esta marca: de 261 escalones, 259 decían «Sí».
                              Se señala la excepción donde pasa y la regla se calla, que es lo que hace que la
                              excepción se vea. */}
                          {def.retired ? <small className="admin-ach-flag">{A.notOffered}</small> : null}
                        </td>
                        <td className="admin-ach-reached">
                          {measured ? (
                            <>
                              <span className={percent === 0 ? 'admin-ach-warn-soft' : undefined}>
                                {A.reached(percent, holders, measured.sample)}
                              </span>
                              {/* LA MISMA CIFRA, DIBUJADA. La pregunta que se hace uno bajando por una escalera
                                  es dónde se queda la gente, y once porcentajes en columna hay que leerlos de uno
                                  en uno para verlo; las barras lo enseñan de un vistazo, que es justo lo que se
                                  viene a decidir aquí. Va `aria-hidden`: repite el texto que tiene encima, y a
                                  quien no la ve no le aporta nada leerlo dos veces. */}
                              <span className="admin-ach-meter" aria-hidden="true">
                                <span className="admin-ach-meter-fill" style={{ width: `${percent}%` }} />
                              </span>
                              {frontier ? <small className="admin-ach-warn-soft">{A.asleep}</small> : null}
                              {percent >= 90 ? <small className="admin-ach-warn-soft">{A.gift}</small> : null}
                              {cliff ? <small className="admin-ach-warn">{A.cliff}</small> : null}
                              {opensUnseen ? <small className="admin-ach-unseen">{A.unseen}</small> : null}
                            </>
                          ) : <span className="admin-ach-nodata">—</span>}
                        </td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* LA ÚNICA ACCIÓN DE LA FICHA, y por eso tiene la forma de las demás de la app (`.btn`) y no la de
                  un enlace de puntitos: era la herencia de cuando cada fila llevaba su propio «preparar escalón
                  15» y convenía que no compitieran. Retirados aquellos, este se queda solo y se anuncia como lo
                  que es. Abre la ficha para escribir el umbral que sea —también por encima del último, que es
                  cómo se alarga una escalera— y va al PIE: es lo que se hace cuando ya se ha leído entera. */}
              <p className="admin-ach-foot">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCopied(false);
                    const last = ladder.steps[ladder.steps.length - 1] || 1;
                    setDraft({ key: ladder.key, step: ladder.descending ? Math.max(1, last - 1) : last * 2 });
                  }}
                >
                  {A.prepareAny}
                </button>
              </p>
            </article>
            );
          })}
        </div>
      ))}
    </section>
  );
});
