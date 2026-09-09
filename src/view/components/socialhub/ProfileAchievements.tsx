import { memo, useMemo } from 'react';
import { AchievementStrip, type StripItem } from '../stats/AchievementStrip';
import { AchievementsScreen, formatUnlockDate } from '../stats/AchievementsScreen';
import { AchievementSprite } from '../AchievementSprite';
import { measureRarity, parseMirror, sortMirror } from '../../../core/achievements/pack';
import { summarize, summarizeMirror } from '../../../core/achievements/summary';
import { ACHIEVEMENTS_BY_ID, SCORING_ACHIEVEMENTS } from '../../../core/achievements/catalog';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import { withoutHidden } from '../../../core/achievements/visibility';
import { compareEarned, listForScreen } from '../../../viewmodel/useAchievements';
import { useAchievementsConfig } from '../../hooks/useAchievementsConfig';
import type { AchievementItem, AchievementState } from '../../../core/achievements/types';

/**
 * LA TIRA DE LA FICHA: debajo del nombre, y ahí **solo la imagen**.
 *
 * Es una lectura del espejo que el directorio YA se ha descargado: cero peticiones nuevas y cero bytes más de
 * canal. Si esa persona no publica logros —opt-out, o cliente antiguo—, **la tira no se pinta**: ni marco vacío
 * ni «este usuario no tiene logros», porque no hay nada que decir.
 *
 * SIN DESTACADOS, el orden lo pone la RAREZA y luego el nivel. El orden por familia —que era el anterior— tenía
 * un defecto silencioso: producía la misma vitrina para todo el mundo, siempre encabezada por el mismo logro,
 * porque el catálogo se recorre igual para todos. Con la mayoría de la gente sin tocar nunca los destacados, el
 * orden por defecto ES la vitrina y tiene que decir algo.
 */
export const ProfileAchievementStrip = memo(function ProfileAchievementStrip({
  mirror,
  onOpen,
}: {
  mirror: string;
  onOpen: () => void;
}) {
  const items = useMemo<StripItem[]>(() => {
    const mirrored = sortMirror(parseMirror(mirror));
    // EL MISMO SUELO QUE EL LISTADO, y por el mismo motivo: la medalla dice su fecha en el rótulo, y dos
    // versiones del mismo dato —fechada en la lista, muda en la tira— es peor que cualquiera de las dos.
    let floor = 0;
    for (const item of mirrored) {
      if (item.unlockedAt > 0 && (floor === 0 || item.unlockedAt < floor)) floor = item.unlockedAt;
    }
    return mirrored.map((item) => ({
      id: item.id,
      level: item.level,
      date: formatUnlockDate(item.unlockedAt || floor),
    }));
  }, [mirror]);

  if (items.length === 0) return null;

  return (
    <div className="hub-profile-achievements">
      <AchievementSprite />
      {/* Con tope: aquí la tira comparte cabecera con el avatar y el rango, y no puede crecer sin empujarlos.
          Lo que no cabe se cuenta en la baldosa final, que es a la vez el acceso al listado. */}
      <AchievementStrip items={items} limit={11} size="md" onOpen={onOpen} onSeeAll={onOpen} />
    </div>
  );
});

/**
 * EL LISTADO DE UNA FICHA, y son DOS listas con la misma forma:
 *
 *  - LA TUYA es el catálogo: lo conseguido y lo que falta, con su «7 de 10» y su barra. Sale del evaluador y es
 *    exactamente la de `/logros` —misma función, `listForScreen`—, porque son la misma pregunta hecha desde dos
 *    sitios y dos listas distintas para ella solo servirían para separarse con el tiempo.
 *  - LA DE OTRA PERSONA es su VITRINA: solo lo conseguido, leído de su espejo. Lo que le falta no se enseña
 *    porque no se sabe —el espejo lleva los logros conseguidos y nada más— y porque una barra a medias diría
 *    cuántas reseñas lleva o cuántas horas anota por una puerta lateral (§3).
 *
 * ORDENADAS POR FECHA, de lo más reciente a lo más antiguo, y lo que no tiene sello deducible al final. Es el
 * orden de `compareEarned`, el mismo con el que el feed cuenta una jornada.
 *
 * SIN EL PORCENTAJE COMPARADO. Esa cifra —«lo tiene el 67 % · 2 de 3»— es la respuesta a otra pregunta («cómo de
 * raro es esto»), tiene su pantalla entera y su botón para llegar a ella. Aquí competía con el sello, que es lo
 * que se viene a mirar: cuándo cayó cada medalla. La rareza DECLARADA se queda, que es del catálogo y no de la
 * gente.
 */
export const ProfileAchievementsScreen = memo(function ProfileAchievementsScreen({
  mirror,
  directoryMirrors,
  owner,
  ownStates,
  since = 0,
  onBack,
  onToggleGlobals,
  globalsBackLabel,
}: {
  mirror: string;
  /** Los espejos que el directorio ya trajo. Solo deciden si hay puerta a los globales; aquí no se pintan. */
  directoryMirrors: readonly string[];
  owner: string;
  /**
   * TUS estados reales, del evaluador. Solo llegan en tu propia ficha, y son los que convierten esta pantalla en
   * el catálogo: sin ellos no hay ni progreso ni logros por conseguir que enseñar.
   */
  ownStates?: ReadonlyMap<string, AchievementState>;
  /**
   * EL DÍA EN QUE EMPIEZA TU BIBLIOTECA, para fechar lo conseguido antes de que hubiera con qué fecharlo. Solo
   * en tu ficha: de otra persona no llega ese dato, y ahí el suelo sale de su propia vitrina (abajo).
   */
  since?: number;
  onBack: () => void;
  /** Ir a los logros globales. El botón vive DENTRO de la pantalla, no en la barra de la ficha. */
  onToggleGlobals?: () => void;
  globalsBackLabel?: string;
}) {
  // La APERTURA COMUNITARIA es la que hace que esta cifra sea la misma que esa persona ve en su aparato: el
  // denominador cuenta lo que hoy está abierto para todos, no lo que cada cual tenga hecho (ver `summarizeMirror`).
  // Y la OCULTACIÓN recorta tu catálogo, que es la única de las dos listas que recorre lo no conseguido.
  const config = useAchievementsConfig();

  const { entries, summary, rarity, floor } = useMemo(() => {
    const rarity = measureRarity(directoryMirrors);

    /**
     * EL SUELO DE LAS FECHAS. En tu ficha lo trae la biblioteca —el primer juego que entró, y nada tuyo puede
     * ser anterior—. En la de otra persona ese dato no viaja: su espejo lleva el sello de cada logro y los que
     * no tienen van en cero, así que el suelo es su logro fechado más viejo. No es el día en que empezó, pero
     * sí uno del que hay constancia, y deja su lista sin huecos igual que la tuya.
     */
    const floorOf = (items: readonly AchievementItem[]): number => {
      if (since > 0) return since;
      let best = 0;
      for (const { state } of items) {
        if (state.unlockedAt > 0 && (best === 0 || state.unlockedAt < best)) best = state.unlockedAt;
      }
      return best;
    };

    // TU FICHA: el catálogo entero, tal cual lo monta `/logros`.
    if (ownStates) {
      const entries = listForScreen(ownStates, config);
      return {
        entries,
        summary: summarize([...ownStates.values()], config.open),
        rarity,
        floor: floorOf(entries),
      };
    }

    const items = sortMirror(parseMirror(mirror));
    const levels = new Map(items.map((item) => [item.id, item.level]));

    const entries = items
      .map((item) => {
        const def = ACHIEVEMENTS_BY_ID.get(item.id);
        if (!def) return null; // `id` desconocido: se ignora en silencio, nunca es un error de parseo
        const state: AchievementState = {
          id: item.id,
          level: item.level,
          value: 0,
          // Sin `next`: el progreso de otra persona hacia algo que no tiene no es asunto de nadie.
          next: null,
          unlockedAt: item.unlockedAt,
        };
        return { def, state };
      })
      .filter((entry): entry is AchievementItem => entry !== null)
      // Por fecha, de lo más reciente a lo más antiguo. `sortMirror` ordenaba por rareza declarada porque es el
      // orden de la VITRINA —once medallas para enseñar—, y en una lista larga eso deja el sello, que es la
      // columna que se lee, saltando de un año a otro sin orden aparente. Lo que no trae fecha cae al final.
      .sort(compareEarned);

    return {
      entries,
      summary: summarizeMirror(levels, config.open),
      rarity,
      floor: floorOf(entries),
    };
  }, [mirror, directoryMirrors, ownStates, since, config]);

  return (
    <AchievementsScreen
      items={entries}
      summary={summary}
      // El porcentaje comparado NO se pinta aquí, aunque se mida: la medición sigue haciendo falta para saber si
      // hay algo detrás del botón de los globales, que es donde esa cifra sí es el asunto de la pantalla.
      rarity={null}
      owner={owner}
      since={floor}
      backLabel={ACHIEVEMENTS_UI.backToProfile}
      onBack={onBack}
      /* LA PUERTA A LOS GLOBALES SE OFRECE SI HAY ALGO DETRÁS, y `rarity` es exactamente esa pregunta: es la
         misma medición que hace la vista global, así que aquí no se puede colar un umbral distinto del suyo.

         Sin muestra —por debajo de los 20 espejos del §6.6bis— esa vista no puede pintar ninguna lista: se
         declara sin muestra y ya está. Mientras el botón se enseñaba igualmente, pulsarlo llevaba a una pantalla
         con una excusa y nada más, que es un callejón sin salida. Y no era un caso raro de desarrollo: el día
         del estreno nadie ha publicado su espejo todavía, así que le pasaría a todo el mundo. Se cura solo
         según la gente publica, y hasta entonces la puerta no está. */
      onToggleGlobals={rarity ? onToggleGlobals : undefined}
      globalsBackLabel={globalsBackLabel}
    />
  );
});

/**
 * LOGROS GLOBALES: el catálogo entero ordenado por lo común que es cada logro, **de mayor a menor porcentaje**,
 * con un recuadro en los que tiene el dueño de este perfil. Es la pantalla de estadísticas globales de Steam.
 *
 * De mayor a menor y no al revés, que es lo que parece más vistoso: arriba quedan los que casi todo el mundo
 * tiene, así que un hueco arriba se ve enseguida —«esto lo tienen todos y yo no»— y las rarezas de abajo se
 * leen como el premio que son. Ordenado por lo raro primero, la lista empieza con veinte casillas vacías.
 *
 * NO ES UN COMPONENTE NUEVO: reutiliza `AchievementsScreen` y `AchievementRow` con su modo `global`, que cambia
 * la fila (recuadro, sin barras, sin fecha) y la cabecera. Lo único propio de aquí es armar la lista.
 *
 * SI NO HAY MUESTRA, NO HAY PANTALLA. Por debajo de veinte espejos el porcentaje es ruido (§6.6bis) y una lista
 * ordenada por una cifra que no se puede pintar no está ordenada por nada: se dice y se acabó.
 */
export const ProfileGlobalAchievements = memo(function ProfileGlobalAchievements({
  mirror,
  directoryMirrors,
  owner,
  self,
  ownStates,
  onBack,
  onToggleGlobals,
  globalsBackLabel,
}: {
  mirror: string;
  directoryMirrors: readonly string[];
  owner: string;
  /** ¿Es tu propio perfil? Cambia la voz («Lo tienes») y habilita el progreso de lo que aún no tienes. */
  self: boolean;
  /**
   * TUS estados reales, del evaluador. Solo llegan en tu propio perfil, y son lo que permite pintar «4 de 10» en
   * lo que todavía no tienes: el espejo lleva los logros CONSEGUIDOS y nada más, así que de una amistad no hay
   * progreso que enseñar —ni debe haberlo (§3)—.
   */
  ownStates?: ReadonlyMap<string, AchievementState>;
  onBack: () => void;
  /** Volver al listado de logros de este perfil, que es de donde se llega. */
  onToggleGlobals?: () => void;
  globalsBackLabel?: string;
}) {
  // Las dos mitades de la configuración, en la misma lectura. La OCULTACIÓN recorta el catálogo de esta vista: la
  // ficha de una amistad lista solo lo conseguido, así que allí no hay nada que esconder, pero esta recorre el
  // catálogo entero y es donde un oculto sin conseguir se asomaría. Y la APERTURA COMUNITARIA es el denominador
  // de su cabecera, el mismo con el que cuentan las otras dos pantallas.
  const { hidden: hiddenAchievements, open } = useAchievementsConfig();

  const { entries, rarity, summary } = useMemo(() => {
    const measured = measureRarity(directoryMirrors);
    // El resumen se calcula SIEMPRE, incluso sin muestra: la cifra de la cabecera («113/251 · 45 %») no depende del
    // porcentaje global, solo de lo que este perfil tiene. Antes se pasaba un resumen vacío porque la cifra
    // estaba oculta en esta vista, y ese vacío se habría quedado ahí al destaparla.
    const levels = ownStates
      ? new Map([...ownStates].filter(([, state]) => state.level >= 1).map(([id, state]) => [id, state.level]))
      : new Map(parseMirror(mirror).map((item) => [item.id, item.level]));
    const summary = summarizeMirror(levels, open);
    if (!measured) return { entries: [] as AchievementItem[], rarity: null, summary };

    const owned = new Map(parseMirror(mirror).map((item) => [item.id, item.level]));

    const items = SCORING_ACHIEVEMENTS
      .map((def) => {
        // En tu perfil manda el evaluador —trae el progreso—; en el ajeno, el espejo, que solo trae el nivel.
        const own = ownStates?.get(def.id);
        return {
          def,
          state: own ?? ({
            id: def.id,
            level: owned.get(def.id) || 0,
            value: 0,
            next: null,
            unlockedAt: 0,
          } satisfies AchievementState),
          // SE ORDENA POR EL CONTEO, NO POR EL PORCENTAJE PINTADO. Es la misma cifra, pero el porcentaje viene
          // ya redondeado y eso empata lo que la muestra sí distingue: con 300 espejos, 33,4 % y 32,6 % son los
          // dos «33 %» y el orden entre ellos lo acababa decidiendo el nombre.
          holders: measured.holders.get(def.id) ?? 0,
        };
      })
      // De mayor a menor. A igualdad, un orden estable —que la lista no baile entre aperturas, que es lo que
      // hace imposible acordarse de dónde estaba uno—: dentro de una MISMA escalera manda el grado, porque el
      // nombre lleva números romanos y alfabéticamente el IX se cuela delante del V. La cola de la lista, donde
      // todo empata a cero, es justo la que más escalones altos junta.
      .sort((a, b) => (b.holders - a.holders)
        || (a.def.ladder === b.def.ladder
          ? a.def.grade - b.def.grade
          : a.def.labels.name.localeCompare(b.def.labels.name, 'es')))
      .map(({ def, state }) => ({ def, state }));

    return { entries: withoutHidden(items, hiddenAchievements), rarity: measured, summary };
  }, [mirror, directoryMirrors, ownStates, hiddenAchievements, open]);

  return (
    <AchievementsScreen
      items={entries}
      summary={summary}
      rarity={rarity}
      // Sin muestra suficiente no hay lista: una ordenada por una cifra que no se puede pintar no está ordenada
      // por nada. Se dice en el cuerpo de la MISMA pantalla, sin escribir otra a mano.
      lead={rarity ? undefined : ACHIEVEMENTS_UI.globalNoSample}
      global={{ self }}
      heading={self ? ACHIEVEMENTS_UI.globalTitleSelf : ACHIEVEMENTS_UI.globalTitleOf(owner)}
      backLabel={ACHIEVEMENTS_UI.backToProfile}
      onBack={onBack}
      onToggleGlobals={onToggleGlobals}
      globalsBackLabel={globalsBackLabel}
    />
  );
});
