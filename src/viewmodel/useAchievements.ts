import { useMemo, useRef } from 'react';
import { evaluateAchievements, levelUps, nextPeak } from '../core/achievements/evaluate';
import { summarize } from '../core/achievements/summary';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_LADDER } from '../core/achievements/catalog';
import { ACHIEVEMENTS_PEAK_KEY } from '../core/constants/storageKeys';
import { rouletteUsedAt } from '../core/achievements/deviceSignals';
import { DEFAULT_PALETTE } from '../core/constants/palettes';
import { palettePreference } from '../view/hooks/preferences';
import type { AchievementDef, AchievementItem, AchievementState, AchievementSummary } from '../core/achievements/types';
import type { TabData } from '../model/types/game';

export interface AchievementsViewModel {
  states: readonly AchievementState[];
  byId: ReadonlyMap<string, AchievementState>;
  summary: AchievementSummary;
  /** Conseguidos, ordenados del más reciente al más antiguo. Es lo que alimenta la tira. */
  earned: ReadonlyArray<{ def: AchievementDef; state: AchievementState }>;
  /** Los que acaban de subir de nivel en la ÚLTIMA evaluación, para el aviso del instante (§7.4). */
  justUnlocked: readonly AchievementState[];
}

/** Lee una clave de localStorage sin que un navegador en modo privado estricto tumbe el render. */
function read(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin persistencia: la marca de agua vale para la sesión en curso y no se recordará.
  }
}

export interface AchievementsInput {
  games: TabData;
  friends?: number;
  postWeeks?: number;
  profileCreatedAt?: number;
  hasSync?: boolean;
}

/**
 * Evalúa los logros del DUEÑO sobre su biblioteca.
 *
 * Se memoiza contra `games`, que es la misma referencia que ya memoiza el panel: una pasada sobre 2.000 juegos
 * son unos pocos milisegundos, así que no hace falta diferirlo ni sacarlo a un worker.
 *
 * LOS CONTADORES SOCIALES PUEDEN FALTAR Y NO PASA NADA. Al evaluar fuera del hub, el grafo de amistades puede no
 * estar cargado: esos contadores llegan a cero y sus logros evalúan a cero. La marca de agua es justo lo que
 * impide que eso RETIRE lo ya conseguido, así que no hace falta bloquear nada ni ir a buscar datos que no están a
 * mano — se ponen al día en la próxima apertura del hub.
 */
export function useAchievements({
  games,
  friends = 0,
  postWeeks = 0,
  profileCreatedAt = 0,
  hasSync = false,
}: AchievementsInput): AchievementsViewModel {
  // El estado inmediatamente anterior, para saber qué ha subido EN ESTA evaluación. Un `ref` y no un estado:
  // compararse consigo mismo no debe provocar un render más.
  const previous = useRef<AchievementState[]>([]);

  return useMemo(() => {
    const peak = read(ACHIEVEMENTS_PEAK_KEY);
    const states = evaluateAchievements(
      {
        games,
        social: { friends, postWeeks, profileCreatedAt },
        device: {
          hasSync,
          rouletteUsedAt: rouletteUsedAt(),
          themeChanged: palettePreference.get() !== DEFAULT_PALETTE,
        },
        now: Date.now(),
      },
      peak,
    );

    // La marca de agua se guarda SIEMPRE que sube, y nunca baja: `nextPeak` toma el máximo con lo que había.
    const grown = nextPeak(states, peak);
    if (grown !== peak) write(ACHIEVEMENTS_PEAK_KEY, grown);

    // Solo lo que sube EN ESTA evaluación, nunca el arrastre de retroactividad: quien importa una biblioteca
    // entera no recibe veinte avisos. La primera evaluación del dispositivo siembra y calla.
    const justUnlocked = previous.current.length > 0 ? levelUps(previous.current, states) : [];
    previous.current = states;

    const byId = new Map(states.map((state) => [state.id, state]));
    const earned = ACHIEVEMENTS
      .map((def) => ({ def, state: byId.get(def.id) }))
      .filter((entry): entry is { def: AchievementDef; state: AchievementState } =>
        Boolean(entry.state && entry.state.level >= 1))
      .sort((a, b) => b.state.unlockedAt - a.state.unlockedAt);

    return { states, byId, summary: summarize(states), earned, justUnlocked };
  }, [games, friends, postWeeks, profileCreatedAt, hasSync]);
}

/**
 * EL CATÁLOGO EN UNA SOLA LISTA: primero lo conseguido, luego lo que no. Como en Steam.
 *
 * LA ZANAHORIA (§6.3bis). De cada escalera se enseñan los escalones conseguidos **y uno más**: el siguiente, con
 * su barra. Los posteriores no se pintan. Es lo que hace que un catálogo de 251 entradas siga siendo una pantalla
 * y no un inventario — enseñar los once escalones de «Créditos finales» a quien lleva diez juegos no le dice
 * cuánto le falta, le dice que no va a llegar—, y es la diferencia entre una meta y una lista de la compra.
 *
 * Los ocultos siguen tapados por su cuenta (§6.7), y los RETIRADOS solo aparecen si ya se tenían: dejan de
 * ofrecerse, pero a quien los consiguió no se le borra la medalla (§6.4).
 *
 * Sin agrupar por familia. La pregunta que se hace uno al abrir esto es «qué tengo y qué me falta», y esa se
 * responde con un solo corte. La familia sigue en el catálogo, donde hace su trabajo: el filtro del feed y el
 * denominador.
 */
export function listForScreen(byId: ReadonlyMap<string, AchievementState>): AchievementItem[] {
  const stateOf = (def: AchievementDef): AchievementState =>
    byId.get(def.id) || { id: def.id, level: 0, value: 0, next: def.step, unlockedAt: 0 };

  // Qué escalones se enseñan: los conseguidos de cada escalera y el primero que falte.
  const visible = new Set<string>();
  for (const steps of ACHIEVEMENTS_BY_LADDER.values()) {
    for (const def of steps) {
      const earned = stateOf(def).level >= 1;
      if (def.retired && !earned) break;
      visible.add(def.id);
      if (!earned) break;
    }
  }

  const items: AchievementItem[] = ACHIEVEMENTS
    .filter((def) => visible.has(def.id))
    .map((def) => ({ def, state: stateOf(def) }));

  // LOS PRIMEROS PASOS SE APAGAN SOLOS: conseguidos todos, desaparecen y no vuelven. No es una categoría
  // permanente que quede a medias para siempre en la cuenta.
  const onboarding = items.filter((entry) => entry.def.family === 'onboarding');
  const hideOnboarding = onboarding.length > 0 && onboarding.every((entry) => entry.state.level >= 1);

  return items
    .filter((entry) => !(hideOnboarding && entry.def.family === 'onboarding'))
    .sort((a, b) => {
      const aEarned = a.state.level >= 1;
      const bEarned = b.state.level >= 1;
      if (aEarned !== bEarned) return aEarned ? -1 : 1;
      // Lo conseguido, por fecha: lo último primero. Lo que falta, por lo cerca que está de caer —así lo que
      // está a punto queda arriba, que es la información útil de esa mitad— y a igualdad, por nombre.
      if (aEarned) return b.state.unlockedAt - a.state.unlockedAt;
      return progressOf(b) - progressOf(a) || a.def.labels.name.localeCompare(b.def.labels.name, 'es');
    });
}

/**
 * Qué parte del umbral llevas, 0–1. Sin umbral (o sin nada hecho), cero.
 *
 * En una escalera DESCENDENTE el progreso va al revés —bajar de 64 a 30 con el listón en 25 es ir bien— y la
 * división directa daría más de uno justo cuando más lejos estás.
 */
function progressOf(entry: AchievementItem): number {
  const { value, next } = entry.state;
  if (!next || next <= 0) return 0;
  if (entry.def.descending) return value <= next ? 1 : Math.min(1, next / value);
  return Math.min(1, value / next);
}
