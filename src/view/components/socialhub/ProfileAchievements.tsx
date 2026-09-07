import { memo, useMemo } from 'react';
import { AchievementStrip, type StripItem } from '../stats/AchievementStrip';
import { AchievementsScreen, formatUnlockDate } from '../stats/AchievementsScreen';
import { AchievementSprite } from '../AchievementSprite';
import { measureRarity, parseMirror, sortMirror } from '../../../core/achievements/pack';
import { summarizeMirror } from '../../../core/achievements/summary';
import { ACHIEVEMENTS_BY_ID, SCORING_ACHIEVEMENTS } from '../../../core/achievements/catalog';
import { ACHIEVEMENTS_UI } from '../../../core/constants/achievementLabels';
import { withoutHidden } from '../../../core/achievements/visibility';
import { useHiddenAchievements } from '../../hooks/useHiddenAchievements';
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
  const items = useMemo<StripItem[]>(
    () =>
      sortMirror(parseMirror(mirror)).map((item) => ({
        id: item.id,
        level: item.level,
        date: formatUnlockDate(item.unlockedAt),
      })),
    [mirror],
  );

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
 * EL LISTADO DE ESA PERSONA. La misma pantalla que la tuya, leyendo el espejo en vez del evaluador — que es el
 * patrón que ya usan `StatsReviews` y `ProfileReviewsList`: una lista, dos fuentes.
 *
 * SOLO LO CONSEGUIDO. El progreso hacia lo que no tiene no se ve, y ese es el corte: una barra a medias diría
 * cuántas reseñas lleva o cuántas horas anota por una puerta lateral, y un logro conseguido solo dice el orden de
 * magnitud que ya declara al publicarlo.
 */
export const ProfileAchievementsScreen = memo(function ProfileAchievementsScreen({
  mirror,
  directoryMirrors,
  owner,
  onBack,
  onToggleGlobals,
  globalsBackLabel,
}: {
  mirror: string;
  /** Los espejos que el directorio ya trajo. Es la muestra del porcentaje comparado y no cuesta una petición. */
  directoryMirrors: readonly string[];
  owner: string;
  onBack: () => void;
  /** Ir a los logros globales. El botón vive DENTRO de la pantalla, no en la barra de la ficha. */
  onToggleGlobals?: () => void;
  globalsBackLabel?: string;
}) {
  const { entries, summary, rarity } = useMemo(() => {
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
      .filter((entry): entry is AchievementItem => entry !== null);

    return {
      entries,
      summary: summarizeMirror(levels),
      rarity: measureRarity(directoryMirrors),
    };
  }, [mirror, directoryMirrors]);

  return (
    <AchievementsScreen
      items={entries}
      summary={summary}
      rarity={rarity}
      owner={owner}
      backLabel={ACHIEVEMENTS_UI.backToProfile}
      onBack={onBack}
      onToggleGlobals={onToggleGlobals}
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
  // La ficha de una amistad lista SOLO lo conseguido, así que no hay nada que esconder ahí; esta vista, en
  // cambio, recorre el catálogo entero, y es donde un oculto sin conseguir se asomaría.
  const hiddenAchievements = useHiddenAchievements();

  const { entries, rarity, summary } = useMemo(() => {
    const measured = measureRarity(directoryMirrors);
    // El resumen se calcula SIEMPRE, incluso sin muestra: la cifra de la cabecera («113/251 · 45 %») no depende del
    // porcentaje global, solo de lo que este perfil tiene. Antes se pasaba un resumen vacío porque la cifra
    // estaba oculta en esta vista, y ese vacío se habría quedado ahí al destaparla.
    const levels = ownStates
      ? new Map([...ownStates].filter(([, state]) => state.level >= 1).map(([id, state]) => [id, state.level]))
      : new Map(parseMirror(mirror).map((item) => [item.id, item.level]));
    const summary = summarizeMirror(levels);
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
          percent: measured.percent.get(def.id) ?? 0,
        };
      })
      // De mayor a menor porcentaje. A igualdad, el nombre: un orden estable evita que la lista baile entre
      // aperturas cuando dos logros empatan, que es lo que hace imposible acordarse de dónde estaba uno.
      .sort((a, b) => (b.percent - a.percent) || a.def.labels.name.localeCompare(b.def.labels.name, 'es'))
      .map(({ def, state }) => ({ def, state }));

    return { entries: withoutHidden(items, hiddenAchievements), rarity: measured, summary };
  }, [mirror, directoryMirrors, ownStates, hiddenAchievements]);

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
