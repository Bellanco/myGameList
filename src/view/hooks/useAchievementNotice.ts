import { useEffect, useRef } from 'react';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import type { StatusNotice } from '../../model/types/game';
import type { TabData } from '../../model/types/game';

/**
 * EL INSTANTE DEL DESBLOQUEO. Ver docs/plan-logros.md §7.4.
 *
 * Es lo que de verdad sostiene un sistema de logros y lo que la derivación pierde con una facilidad alarmante:
 * marcas un juego como terminado, la app guarda, y el logro número 150 aparece callado tres días después cuando
 * se te ocurre entrar en el panel. Técnicamente correcto y emocionalmente nulo.
 *
 * LA REGLA: se reevalúa después de cada escritura de la biblioteca, y si un nivel ha subido EN ESA escritura, se
 * dice ahí mismo. No hace falta inventar nada para decirlo — va por el mismo sitio que «Juego guardado»
 * (`StatusBanner`, que ya tiene su región viva montada y su `role="status"` de cortesía). Un aviso más de los que
 * ya existen, no una capa nueva.
 *
 * CUATRO CONDICIONES para que no se vuelva molesto:
 *  - **Solo lo que sube en ESTA escritura**, comparando contra el estado inmediatamente anterior. Nunca el
 *    arrastre de retroactividad: quien importa una biblioteca entera no recibe veinte avisos.
 *  - **Uno por escritura.** Si una edición sube tres logros, el aviso es «3 logros conseguidos».
 *  - **Nunca bloquea.** Es el banner de siempre, con `role="status"` y no `alert`.
 *  - **La primera evaluación del dispositivo siembra y calla.**
 *
 * Y EL EVALUADOR ENTRA POR `import()` DINÁMICO, que no es un capricho: este hook lo usa `App.tsx`, que es el
 * arranque, y el catálogo con sus 38 métricas y sus textos no puede viajar ahí. El presupuesto son 215 kB
 * comprimidos y lo vigila `ci-validate`. Así el coste se paga la primera vez que se guarda algo, no al abrir.
 */
export function useAchievementNotice(
  games: TabData,
  notify: (kind: StatusNotice['kind'], message: string) => void,
): void {
  // La foto anterior, para saber qué ha subido EN ESTA escritura. Un `ref` y no un estado: compararse consigo
  // mismo no debe provocar un render más.
  const previous = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS) return;
    let cancelled = false;

    void Promise.all([
      import('../../core/achievements/evaluate'),
      import('../../core/achievements/deviceSignals'),
      import('../../core/constants/achievementLabels'),
      import('../../core/achievements/catalog'),
      import('../../core/constants/storageKeys'),
    ]).then(([evaluate, signals, labels, catalog, keys]) => {
      if (cancelled) return;

      let peak = '';
      try {
        peak = localStorage.getItem(keys.ACHIEVEMENTS_PEAK_KEY) || '';
      } catch {
        // Sin persistencia: la marca de agua vale para la sesión en curso.
      }

      const states = evaluate.evaluateAchievements(
        {
          games,
          // Los contadores sociales no están a mano fuera del hub y llegan a cero. La marca de agua es justo lo
          // que impide que eso RETIRE lo ya conseguido, así que no hace falta ir a buscarlos.
          social: { friends: 0, postWeeks: 0, profileCreatedAt: 0 },
          device: { hasSync: false, rouletteUsedAt: signals.rouletteUsedAt(), themeChanged: false },
          now: Date.now(),
        },
        peak,
      );

      const levels = new Map(states.map((state) => [state.id, state.level]));
      const before = previous.current;
      previous.current = levels;

      // La marca de agua se guarda siempre que sube y nunca baja.
      const grown = evaluate.nextPeak(states, peak);
      if (grown !== peak) {
        try {
          localStorage.setItem(keys.ACHIEVEMENTS_PEAK_KEY, grown);
        } catch {
          // ídem
        }
      }

      // Sembrar y callar: sin foto previa no hay «cambio», hay una foto inicial.
      if (!before) return;

      const risen = states.filter((state) => state.level > (before.get(state.id) ?? 0));
      if (risen.length === 0) return;

      if (risen.length === 1) {
        // El nombre YA trae su grado desde el catálogo («Créditos finales III»): componerlo otra vez aquí hacía
        // que el aviso lo dijera dos veces seguidas.
        const def = catalog.ACHIEVEMENTS_BY_ID.get(risen[0].id);
        const name = def ? def.labels.name : '';
        if (name) notify('ok', labels.ACHIEVEMENTS_UI.unlockedOne(name));
        return;
      }
      notify('ok', labels.ACHIEVEMENTS_UI.unlockedMany(risen.length));
    });

    return () => {
      cancelled = true;
    };
  }, [games, notify]);
}
