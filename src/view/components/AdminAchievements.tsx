import { memo, useCallback, useMemo, useState } from 'react';
import { ADMIN_ACHIEVEMENTS_UI } from '../../core/constants/adminLabels';
import { ACHIEVEMENT_RARITY_LABELS } from '../../core/constants/achievementLabels';
import { ACHIEVEMENTS_BY_LADDER, LADDERS, LADDERS_BY_KEY, SCORING_ACHIEVEMENTS, expandLadder } from '../../core/achievements/catalog';
import { MIRROR_ORDER, measureRarity } from '../../core/achievements/pack';
import { RARITY_POINTS } from '../../core/achievements/types';
import { copyText } from '../../core/utils/clipboard';
import type { AchievementDef, AchievementLadder, ExtraSteps } from '../../core/achievements/types';
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
 * Una fila de la tabla de una escalera. `nueva` y `antes` solo llegan con algo dentro mientras se PREPARA un
 * escalón en esa escalera: la fila que todavía no existe y las que el escalón nuevo les corre el romano.
 *
 * Existe el tipo —y no dos tablas— porque la tabla es la misma: lo que cambia es de qué lista sale.
 */
interface StepRow {
  def: AchievementDef;
  nueva: boolean;
  antes: string;
}

/** Las filas de siempre: los escalones del catálogo, sin nada que previsualizar. */
const plainRows = (steps: readonly AchievementDef[]): StepRow[] =>
  steps.map((def) => ({ def, nueva: false, antes: '' }));

/**
 * El escalón anterior CON GENTE QUE MEDIR, saltándose la fila que se está previsualizando.
 *
 * Hace falta porque las dos señales de la columna de alcance se leen contra el escalón de debajo —la frontera y
 * la caída— y la fila nueva no tiene a nadie: dejarla de vecina apagaba las dos en la fila siguiente, así que
 * insertar un escalón cambiaba de sitio unas marcas que hablan de personas y no de umbrales.
 */
function previousMeasured(rows: readonly StepRow[], index: number): AchievementDef | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!rows[i].nueva) return rows[i].def;
  }
  return null;
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

/**
 * Lo que hay que escribir para llevar al código los escalones PENDIENTES de una escalera.
 *
 * Sale de los pendientes y no del campo: el campo solo sirve para añadir uno más, y el plan es el trabajo
 * acumulado —dos umbrales pendientes son una sola línea `steps: [...]` y dos `id`, no dos viajes—.
 */
interface Plan {
  /** Los `id` nuevos, ya escritos como se pegan: `'completados-125', 'completados-250',`. */
  ids: string;
  steps: string;
  total: [number, number];
  points: [number, number];
  bits: [number, number];
  renamed: string;
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
 * PARA QUÉ EXISTE. El catálogo son 64 escaleras y 400 escalones, y cada escalón lleva DOS textos —la meta en
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
  extraSteps = {},
  onSetExtraSteps,
  onResetAll,
  censusSize = 0,
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
  /**
   * Los escalones que el panel ha añadido a una escalera sin desplegar (§6.4bis). SON catálogo: al leerlos se
   * reconstruye (`applyExtraSteps`), así que esta tabla los enseña puestos porque lo están de verdad.
   */
  extraSteps?: ExtraSteps;
  /** Guarda la lista entera de añadidos de una escalera. La escribe el hub, como los otros dos. */
  onSetExtraSteps?: (ladderKey: string, steps: readonly number[]) => Promise<void>;
  /**
   * Borra el espejo de TODO el censo y la apertura publicada. Lo ejecuta el hub, como el resto: esta pantalla
   * pide y cuenta, no habla con la base de datos. Devuelve cuántos espejos se borraron.
   */
  onResetAll?: () => Promise<number>;
  /** Cuántos perfiles hay en el censo, para que la confirmación diga a cuántos afecta. */
  censusSize?: number;
}) {
  const [query, setQuery] = useState('');
  /**
   * La ficha de «preparar» abierta: en qué escalera y lo que hay escrito en su campo. `null` = ninguna abierta.
   *
   * EL TEXTO EN CRUDO y no un número, porque el campo empieza VACÍO y vacío no es cero: con un número había que
   * proponer uno, y proponerlo era meterlo. Se convierte al validar.
   */
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  /**
   * EL AÑADIDO QUE SE ESTÁ CORRIGIENDO: en qué escalera, qué umbral tenía y el texto del campo. `null` = ninguno.
   *
   * `step` es la identidad de la fila —no hay dos iguales en una escalera— y `text` va en crudo por lo mismo que
   * el del campo de añadir: mientras se escribe puede estar vacío, y vacío no es cero.
   */
  const [editing, setEditing] = useState<{ key: string; step: number; text: string } | null>(null);
  /** Cómo fue el último guardado de añadidos de cada escalera. Se dice en su ficha, como el de la ocultación. */
  const [extraState, setExtraState] = useState<Record<string, 'saving' | 'ok' | 'error'>>({});
  const [copied, setCopied] = useState(false);
  // Cómo fue el último guardado de cada escalera. Se dice en su ficha, no en un aviso global: cuando fallan las
  // reglas hay que saber CUÁL no se guardó.
  const [saved, setSaved] = useState<Record<string, 'saving' | 'ok' | 'error'>>({});
  // Cómo fue la última publicación de la apertura. `null` = no se ha tocado en esta visita.
  const [publishing, setPublishing] = useState<'saving' | 'ok' | 'error' | null>(null);
  // El borrado total: `null` = no se ha pedido, `confirm` = esperando el sí, y luego cómo fue.
  const [resetting, setResetting] = useState<'confirm' | 'working' | 'error' | null>(null);
  const [resetDone, setResetDone] = useState<number | null>(null);

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
    // Del conteo de la medición, no deshaciendo su porcentaje: con censos grandes el redondeo devolvía «99» a
    // un escalón que tienen 100 personas, y esta pantalla decide umbrales con esa cifra.
    (def: AchievementDef): number => measured?.holders.get(def.id) ?? 0,
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
   * LOS AÑADIDOS DE UNA ESCALERA QUE NO ESTÁN EN EL CÓDIGO. Los que ya llegaron a él se quedan fuera de todo lo
   * de abajo: su escalón ya está declarado, y lo que queda es retirar la entrada de la configuración.
   */
  const añadidosFuera = useCallback(
    (ladder: AchievementLadder): number[] =>
      (extraSteps[ladder.key] || []).filter((step) => !ladder.steps.includes(step)).slice().sort((a, b) => a - b),
    [extraSteps],
  );

  /**
   * LO QUE HAY QUE ESCRIBIR para consolidar en el código los añadidos de la escalera abierta, con las cifras de HOY y
   * las de después.
   *
   * Se calculan aquí y no se copian de los tests a mano por el motivo de siempre: dos sitios con el mismo número
   * divergen. El total y el techo salen de `SCORING_ACHIEVEMENTS` —lo que puntúa: fuera primeros pasos y
   * retirados— y los bits, de la longitud del orden congelado.
   */
  const plan = useMemo<Plan | null>(() => {
    if (!draft) return null;
    const ladder = LADDERS.find((entry) => entry.key === draft.key);
    if (!ladder) return null;
    const nuevos = añadidosFuera(ladder);
    if (nuevos.length === 0) return null;
    // Y SE RECOLOCA: la lista se ordena, así que da igual por dónde entren los umbrales nuevos.
    const steps = [...ladder.steps, ...nuevos].sort((a, b) => a - b);
    const total = SCORING_ACHIEVEMENTS.length;
    const points = SCORING_ACHIEVEMENTS.reduce((sum, def) => sum + RARITY_POINTS[def.rarity], 0);
    // Los escalones nuevos puntúan salvo que su escalera esté retirada o sea de primeros pasos.
    const scores = ladder.family !== 'onboarding' && !ladder.retired;
    const bits = MIRROR_ORDER.length;
    const publishes = ladder.family !== 'onboarding';
    const cuantos = nuevos.length;
    // El primero que se renumera: el que hoy ocupa la posición del pendiente MÁS BAJO. Alargando por arriba no
    // se renumera nadie y el aviso no sale.
    const renamed = (ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [])[steps.indexOf(nuevos[0])];
    return {
      ids: nuevos.map((step) => `'${ladder.key}-${step}',`).join(' '),
      steps: steps.join(', '),
      total: [total, scores ? total + cuantos : total] as [number, number],
      points: [points, scores ? points + cuantos * RARITY_POINTS[ladder.rarity] : points] as [number, number],
      bits: [bits, publishes ? bits + cuantos : bits] as [number, number],
      renamed: renamed?.labels.name || '',
    };
  }, [draft, añadidosFuera]);

  /**
   * LAS ESCALERAS CON PENDIENTES, tal y como quedarían: por cada una, sus filas con los umbrales pendientes
   * puestos EN SU SITIO.
   *
   * Las produce `expandLadder`, que es LA MISMA función que produce el catálogo: los romanos corridos, el `id`
   * nuevo y los textos del escalón salen de ahí y no de una segunda copia de esas reglas, así que la tabla no
   * puede decir una cosa y el código otra.
   */
  const previewRows = useMemo<ReadonlyMap<string, StepRow[]>>(() => {
    const byLadder = new Map<string, StepRow[]>();
    for (const key of Object.keys(extraSteps)) {
      const ladder = LADDERS_BY_KEY.get(key);
      if (!ladder) continue;
      const nuevos = añadidosFuera(ladder);
      if (nuevos.length === 0) continue;
      const antes = new Map((ACHIEVEMENTS_BY_LADDER.get(key) || []).map((def) => [def.id, def.labels.name]));
      const steps = [...ladder.steps, ...nuevos].sort((a, b) => a - b);
      byLadder.set(key, expandLadder({ ...ladder, steps }).map((def) => {
        const previo = antes.get(def.id) || '';
        return {
          def,
          // Sin nombre previo, el escalón no existía: es uno de los pendientes.
          nueva: !previo,
          // Y solo se dice el nombre viejo cuando de verdad cambia: la mitad de la escalera no se mueve.
          antes: previo && previo !== def.labels.name ? previo : '',
        };
      }));
    }
    return byLadder;
  }, [extraSteps, añadidosFuera]);

  /**
   * QUÉ LE PASA AL UMBRAL ESCRITO. Cadena vacía = se puede añadir; con el campo en blanco tampoco hay error —no
   * has escrito nada todavía, que no es lo mismo que haberlo escrito mal—.
   */
  const addError = useMemo(() => {
    if (!draft) return '';
    const raw = draft.text.trim();
    if (!raw) return '';
    const step = Number(raw);
    if (!Number.isInteger(step) || step <= 0) return A.prepareInvalid;
    const ladder = LADDERS.find((entry) => entry.key === draft.key);
    if (!ladder) return '';
    // Las dos formas de repetirse, y se distinguen: en el código ya está puesto y aquí solo está apuntado.
    if (ladder.steps.includes(step)) return A.prepareTaken(step);
    if ((extraSteps[draft.key] || []).includes(step)) return A.extraTaken(step);
    return '';
  }, [draft, extraSteps]);

  const canAdd = Boolean(draft && draft.text.trim() && !addError && onSetExtraSteps);

  /** Guarda la lista entera de esa escalera, que es la forma que tiene el escritor: añadir y quitar es lo mismo. */
  const saveExtra = useCallback(async (key: string, steps: readonly number[]) => {
    if (!onSetExtraSteps) return false;
    setExtraState((prev) => ({ ...prev, [key]: 'saving' }));
    try {
      await onSetExtraSteps(key, steps);
      setExtraState((prev) => ({ ...prev, [key]: 'ok' }));
      return true;
    } catch {
      // El admin tiene que enterarse: se dice en la ficha de esa escalera y no en un aviso global.
      setExtraState((prev) => ({ ...prev, [key]: 'error' }));
      return false;
    }
  }, [onSetExtraSteps]);

  const addExtra = useCallback(async () => {
    if (!draft || !canAdd) return;
    const step = Number(draft.text.trim());
    const key = draft.key;
    setCopied(false);
    if (await saveExtra(key, [...(extraSteps[key] || []), step])) {
      // El campo se vacía al guardar: lo normal después de añadir uno es añadir otro, no reescribir el mismo.
      setDraft({ key, text: '' });
    }
  }, [draft, canAdd, extraSteps, saveExtra]);

  const removeExtra = useCallback((key: string, step: number) => {
    setCopied(false);
    void saveExtra(key, (extraSteps[key] || []).filter((entry) => entry !== step));
  }, [extraSteps, saveExtra]);

  /**
   * QUÉ LE PASA AL UMBRAL CORREGIDO. Las mismas tres reglas que al añadir —entero positivo y sin repetirse, ni
   * con el código ni con otro añadido— con una sola diferencia: **el suyo propio no cuenta como repetido**, o
   * abrir el campo con su valor dentro sería ya un error.
   */
  const editError = useMemo(() => {
    if (!editing) return '';
    const raw = editing.text.trim();
    if (!raw) return '';
    const step = Number(raw);
    if (!Number.isInteger(step) || step <= 0) return A.prepareInvalid;
    if (step === editing.step) return '';
    const ladder = LADDERS.find((entry) => entry.key === editing.key);
    if (!ladder) return '';
    if (ladder.steps.includes(step)) return A.prepareTaken(step);
    if ((extraSteps[editing.key] || []).includes(step)) return A.extraTaken(step);
    return '';
  }, [editing, extraSteps]);

  /** Sin cambio no hay nada que guardar: el mismo número es cerrar la fila, no una escritura. */
  const canSaveEdit = Boolean(
    editing && editing.text.trim() && !editError && Number(editing.text.trim()) !== editing.step && onSetExtraSteps,
  );

  /**
   * ESTABLE A PROPÓSITO: un callback inline se vuelve a llamar en cada render —React lo suelta y lo vuelve a
   * atar—, así que enfocaría otra vez en cada tecla. Con `useCallback` solo corre al montar el campo.
   */
  const focusOnMount = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  /**
   * CORREGIRLO ES UN SOLO GUARDADO, y esa es la razón de que exista: `setExtraSteps` escribe la LISTA ENTERA de
   * la escalera, así que quitar el umbral viejo y poner el nuevo llega junto. Hacerlo a mano en dos viajes dejaba
   * el catálogo de todo el mundo un rato con el umbral equivocado dentro —o sin ninguno de los dos, si el segundo
   * fallaba—.
   */
  const applyEdit = useCallback(async () => {
    if (!editing || !canSaveEdit) return;
    const step = Number(editing.text.trim());
    const { key } = editing;
    setCopied(false);
    const next = (extraSteps[key] || []).map((entry) => (entry === editing.step ? step : entry));
    if (await saveExtra(key, next)) setEditing(null);
  }, [editing, canSaveEdit, extraSteps, saveExtra]);

  const copyPlan = useCallback(() => {
    if (!plan || !draft) return;
    void copyText([
      A.prepareTitleOf(draft.key),
      A.prepareCatalog(plan.steps),
      A.prepareMirror(plan.ids),
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
        {onPublishFrontier || onResetAll ? (
          <div className="admin-ach-frontier">
            <h3>{A.frontierTitle}</h3>
            {onPublishFrontier ? (
              <p className="admin-card-note">
                {!frontier
                  ? A.frontierNone
                  : frontier.same
                    ? A.frontierSame(frontier.ladders)
                    : A.frontierStale(frontier.ladders)}
              </p>
            ) : null}
            {onPublishFrontier && frontier && !frontier.same ? (
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

            {/* EL BORRADO TOTAL, dentro de la misma ficha porque es la otra cara de lo mismo: aquí se decide qué
                hay publicado para todo el mundo. Va en DOS PASOS y no con un `confirm()` del navegador: es la
                acción más destructiva de la pantalla y el aviso tiene que poder leerse entero, incluido que nadie
                pierde un logro y que cada dispositivo volverá a publicar el suyo. */}
            {onResetAll ? (
              resetting === 'confirm' ? (
                <div className="admin-ach-danger">
                  <p className="admin-ach-warn">{A.resetAllConfirm(censusSize)}</p>
                  <p className="admin-card-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setResetting('working');
                        void onResetAll()
                          .then((cleared) => { setResetDone(cleared); setResetting(null); })
                          .catch(() => setResetting('error'));
                      }}
                    >
                      {A.resetAll}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setResetting(null)}>
                      {A.prepareClose}
                    </button>
                  </p>
                </div>
              ) : (
                <p className="admin-card-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={resetting === 'working'}
                    onClick={() => { setResetDone(null); setResetting('confirm'); }}
                  >
                    {resetting === 'working' ? A.resetAllWorking : A.resetAll}
                  </button>
                </p>
              )
            ) : null}
            {resetDone !== null ? <p className="admin-ach-copied">{A.resetAllDone(resetDone)}</p> : null}
            {resetting === 'error' ? <p className="admin-ach-warn">{A.resetAllFailed}</p> : null}
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
            // DE QUÉ LISTA SALE LA TABLA: la del catálogo, o la de cómo quedaría si se está preparando un
            // escalón en ESTA escalera. Una tabla, dos fuentes — el mismo patrón que usan las pantallas de
            // logros de la app.
            const filas = previewRows.get(ladder.key) || plainRows(steps);
            const preparando = draft?.key === ladder.key;
            const añadidos = extraSteps[ladder.key] || [];
            const guardando = extraState[ladder.key];
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
                {/* LOS ROLES VAN ESCRITOS, y no es redundancia: en móvil esta tabla se lee como fichas y para eso
                    la fila pasa a `display: grid` y la celda a `block` (ver `admin.scss`). Cambiar el `display`
                    de un `tr`/`td` le QUITA su papel en el árbol de accesibilidad —deja de ser fila y celda, y
                    la tabla deja de tener estructura que anunciar—, así que declarados a mano sobreviven al
                    cambio de forma. Es el precio de una tabla que se reordena, y se paga aquí.

                    En `thead` y `tbody` NO se escriben: su `display` no cambia —el de la cabecera es `none`, que
                    es lo que se quiere— así que ahí el papel implícito aguanta y declararlo sería la redundancia
                    que `jsx-a11y/no-redundant-roles` prohíbe. */}
                <table className="admin-ach-table" role="table">
                  <thead>
                    <tr role="row">
                      <th scope="col" role="columnheader">{A.colStep}</th>
                      <th scope="col" role="columnheader">{A.colName}</th>
                      <th scope="col" role="columnheader">{A.colReached}</th>
                      <th scope="col" role="columnheader">{A.colGoal}</th>
                      <th scope="col" role="columnheader">{A.colDone}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ def, nueva, antes }, index) => {
                      // La fila que se previsualiza no tiene a nadie: no hay gente que medir en un escalón que
                      // todavía no existe, así que su columna de alcance se calla en vez de pintar un 0 %.
                      const percent = nueva ? 0 : (measured?.percent.get(def.id) ?? 0);
                      const holders = nueva ? 0 : holdersOf(def);
                      const previous = previousMeasured(filas, index);
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
                      <tr key={def.id} role="row" className={nueva ? 'is-preview' : (nobodySees ? 'is-unseen' : undefined)}>
                        <td role="cell" className="admin-ach-step">{def.step}</td>
                        <td role="cell" className="admin-ach-name">
                          {def.labels.name}
                          {/* LA FILA NUEVA SE DICE, no solo se colorea: el color la separa de un vistazo y el
                              rótulo es lo que la deja clara con lector de pantalla y en monocromo. */}
                          {nueva ? <small className="admin-ach-preview-flag">{A.extraFlag}</small> : null}
                          {/* Y A QUIEN LE CORRE EL ROMANO, su nombre de antes. Es el único efecto que insertar un
                              escalón no puede evitar, y aquí se ve escalón por escalón en vez de en un aviso. */}
                          {antes ? <small className="admin-ach-warn-soft">{A.previewMoved(antes)}</small> : null}
                          {/* OFRECIDO ERA UNA COLUMNA y ahora es esta marca: de 261 escalones, 259 decían «Sí».
                              Se señala la excepción donde pasa y la regla se calla, que es lo que hace que la
                              excepción se vea. */}
                          {def.retired ? <small className="admin-ach-flag">{A.notOffered}</small> : null}
                        </td>
                        <td role="cell" className="admin-ach-reached">
                          {measured && !nueva ? (
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
                        {/* Los dos textos llevan su rótulo en un `data-col`: en móvil la tabla se lee como fichas
                            —cinco columnas no caben— y es de ahí de donde sale la etiqueta de cada línea, porque
                            la cabecera de la tabla no está (ver `admin.scss`). */}
                        <td role="cell" data-col={A.colGoalShort}>{def.labels.condition}</td>
                        <td role="cell" data-col={A.colDoneShort}>
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
                  cómo se alarga una escalera— y va al PIE: es lo que se hace cuando ya se ha leído entera.

                  ALTERNA, porque la ficha se abre AQUÍ MISMO: con la ficha arriba de la pantalla el botón solo
                  podía abrir, y cerrarla obligaba a buscarla. */}
              <p className="admin-ach-foot">
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-expanded={preparando}
                  onClick={() => {
                    setCopied(false);
                    // ALTERNA, y abre con el campo VACÍO: proponer un umbral era meterlo en la tabla sin que
                    // nadie lo hubiera pedido.
                    setDraft(preparando ? null : { key: ladder.key, text: '' });
                    // Y la corrección a medias no sobrevive a cerrar la ficha donde se estaba haciendo.
                    setEditing(null);
                  }}
                >
                  {A.prepareAny}
                </button>
              </p>

              {/* LA FICHA, DENTRO DE LA ESCALERA Y DEBAJO DEL BOTÓN. Vivía arriba de la pantalla, suelta: se
                  pulsaba «preparar» al pie de una escalera y el cambio aparecía a diez pantallas de allí, así que
                  escribir un umbral no se veía desde donde estabas —parecía que el campo no hacía nada— y no
                  había forma de comparar lo que ibas a añadir con lo que hay.

                  Y ABRE VACÍA: proponía el doble del último escalón, y proponerlo era meterlo. Nada se toca hasta
                  que se pulsa «Añadir»; entonces el escalón se GUARDA como pendiente y la tabla de arriba lo
                  enseña en su sitio. */}
              {preparando && draft ? (
                <div className="admin-ach-plan">
                  <h4>{A.prepareTitleOf(ladder.key)}</h4>

                  <label className="admin-ach-plan-field">
                    {A.prepareField}
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={draft.text}
                      onChange={(event) => {
                        setCopied(false);
                        setDraft({ key: draft.key, text: event.target.value });
                      }}
                      onKeyDown={(event) => {
                        // Enter añade, que es lo que se espera de un campo con un solo botón al lado; y no envía
                        // ningún formulario porque no hay ninguno alrededor.
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void addExtra();
                      }}
                    />
                    <small>{A.prepareHelp}</small>
                  </label>

                  {addError ? <p className="admin-ach-warn">{addError}</p> : null}

                  <p className="admin-card-actions">
                    <button type="button" className="btn" onClick={() => void addExtra()} disabled={!canAdd}>
                      {A.prepareAdd}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setDraft(null);
                        setEditing(null);
                      }}
                    >
                      {A.prepareClose}
                    </button>
                    {guardando === 'saving' ? <span className="admin-ach-copied">{A.extraSaving}</span> : null}
                    {guardando === 'error' ? <span className="admin-ach-warn">{A.extraFailed}</span> : null}
                  </p>

                  {/* LO QUE HA AÑADIDO EL PANEL en esta escalera, y debajo lo que hay que escribir para
                      consolidarlo en el código —que es opcional: le da su bit en el espejo—. Va después del campo
                      porque es la consecuencia de haber añadido, y cada uno se quita por separado: añadir dos
                      umbrales de una escalera es un solo viaje, y quitar uno no debe llevarse el otro. */}
                  {añadidos.length > 0 ? (
                    <div className="admin-ach-pending">
                      <h5>{A.extraTitle}</h5>
                      <ul>
                        {añadidos.map((step) => {
                          // Ya declarado en el código: el escalón existe por partida doble y el catálogo se queda
                          // con el del código (`applyExtraSteps` descarta el repetido), así que esta entrada ya
                          // no hace nada y se puede retirar sin consecuencias. Se dice en su línea en vez de
                          // borrarla sola, que sería hacerlo a espaldas de quien mira.
                          const enElCodigo = ladder.steps.includes(step);
                          // QUITARLO A QUIEN YA LO TIENE ES RETIRARLE LA MEDALLA (§6.4). Con muestra, se sabe
                          // quién lo tiene; sin muestra no hay espejos publicados, así que no lo tiene nadie.
                          const suyoDeAlguien = !enElCodigo
                            && Boolean(measured)
                            && (measured?.percent.get(`${ladder.key}-${step}`) ?? 0) > 0;
                          const corrigiendo = editing?.key === ladder.key && editing.step === step;
                          return (
                            <li key={step}>
                              <code>{`${ladder.key}-${step}`}</code>
                              {enElCodigo ? <small className="admin-ach-warn-soft">{A.extraInCode}</small> : null}
                              {/* CORREGIR ES QUITAR Y AÑADIR, así que pide lo mismo que quitar: mientras nadie lo
                                  tenga. Con alguien detrás no hay ninguno de los dos botones, solo el porqué. */}
                              {suyoDeAlguien ? (
                                <small className="admin-ach-warn">{A.extraLocked}</small>
                              ) : corrigiendo && editing ? (
                                <>
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="admin-ach-edit-field"
                                    aria-label={A.extraEditLabel(`${ladder.key}-${step}`)}
                                    // EL FOCO SE VA CON EL BOTÓN QUE ACABAS DE PULSAR: «Corregir» desaparece al
                                    // abrir la fila, así que sin esto el foco cae al `body` y quien navega con
                                    // teclado se queda sin sitio. Se mueve al campo que lo sustituye, que es lo
                                    // que se venía a hacer.
                                    ref={focusOnMount}
                                    value={editing.text}
                                    onChange={(event) => {
                                      setCopied(false);
                                      setEditing({ key: ladder.key, step, text: event.target.value });
                                    }}
                                    onKeyDown={(event) => {
                                      // Enter guarda y Escape se sale: en una fila que se edita en su sitio, ir a
                                      // buscar el botón con el ratón para confirmar un número es el camino largo.
                                      if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void applyEdit();
                                      } else if (event.key === 'Escape') {
                                        event.preventDefault();
                                        setEditing(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => void applyEdit()}
                                    disabled={!canSaveEdit || guardando === 'saving'}
                                  >
                                    {A.extraEditSave}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setEditing(null)}
                                  >
                                    {A.extraEditCancel}
                                  </button>
                                  {editError ? <small className="admin-ach-warn">{editError}</small> : null}
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    // ABRE CON SU VALOR DENTRO, al revés que el campo de añadir: aquí no se
                                    // propone nada, se enseña lo que hay para cambiarle un dígito.
                                    onClick={() => {
                                      setCopied(false);
                                      setEditing({ key: ladder.key, step, text: String(step) });
                                    }}
                                    disabled={guardando === 'saving'}
                                  >
                                    {A.extraEdit(step)}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => removeExtra(ladder.key, step)}
                                    disabled={guardando === 'saving'}
                                  >
                                    {A.extraRemove(step)}
                                  </button>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="admin-card-note">{A.extraNote}</p>
                      <p className="admin-card-note">{A.extraEditNote}</p>
                      {plan ? (
                        <>
                          <h5>{A.codeTitle}</h5>
                          <ol>
                            <li><code>{A.prepareCatalog(plan.steps)}</code></li>
                            <li><code>{A.prepareMirror(plan.ids)}</code></li>
                            <li><code>{A.prepareTests(plan.total, plan.points, plan.bits)}</code></li>
                          </ol>
                          {plan.renamed ? <p className="admin-ach-warn-soft">{A.prepareRename(plan.renamed)}</p> : null}
                          <p className="admin-card-actions">
                            <button type="button" className="btn" onClick={copyPlan}>{A.prepareCopy}</button>
                            {copied ? <span className="admin-ach-copied">{A.prepareCopied}</span> : null}
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

            </article>
            );
          })}
        </div>
      ))}
    </section>
  );
});
