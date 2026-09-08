import { useEffect, useRef, useState } from 'react';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import type { AchievementFlash } from '../components/stats/AchievementToast';
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
 * dice ahí mismo.
 *
 * ⚑ LO DICE LA TARJETA, Y LO ANUNCIA EL BANNER. Al principio esto llamaba a `notify()` y ahí acababa: el logro
 * salía como una línea de texto en el banner de «Juego guardado», con el rótulo «Correcto» delante y sin la
 * medalla, que es la cosa. Ahora el hook DEVUELVE lo que ha pasado —`AchievementFlash`— y quien lo pinta es
 * `AchievementToast`; el banner sigue recibiendo el texto porque su región viva es la que lo anuncia a un lector
 * de pantalla, y eso no se toca.
 *
 * CUATRO CONDICIONES para que no se vuelva molesto:
 *  - **Solo lo que sube en ESTA escritura**, comparando contra el estado inmediatamente anterior. Nunca el
 *    arrastre de retroactividad: quien importa una biblioteca entera no recibe veinte avisos.
 *  - **Uno por escritura.** Si una edición sube tres logros, es UNA tarjeta con tres medallas.
 *  - **Nunca bloquea.** Ni modal, ni foco robado, ni botón de cerrar: se va sola a los cinco segundos.
 *  - **La primera evaluación del dispositivo siembra y calla**… salvo lo que haya caído desde la última vez:
 *    ver el bloque de `if (!before)`, que es donde se separa «primera vez aquí» de «he vuelto y hay logros
 *    nuevos». La avalancha de una ampliación se cuenta en UNA cápsula, no en docenas de avisos.
 *
 * LOS HITOS (§7.4bis). Además del desbloqueo, se avisa al CRUZAR la mitad y la recta final de una escalera en
 * marcha. Se cruzan, no se «están»: hace falta que el porcentaje anterior estuviera por debajo, y esa comparación
 * sale de la misma foto que ya se guardaba para los desbloqueos, sin persistir nada. Manda el desbloqueo: si una
 * escritura sube un logro Y cruza un hito, se cuenta el logro y el hito se calla.
 *
 * Y EL EVALUADOR ENTRA POR `import()` DINÁMICO, que no es un capricho: este hook lo usa `App.tsx`, que es el
 * arranque, y el catálogo con sus 64 métricas y sus textos no puede viajar ahí. El presupuesto son 215 kB
 * comprimidos y lo vigila `ci-validate`. Así el coste se paga la primera vez que se guarda algo, no al abrir.
 */

/** La mitad de una escalera y su recta final, en tanto por uno del umbral del siguiente escalón. */
const MILESTONES = [0.5, 0.85] as const;

/** Lo que se guarda de cada escalón entre escrituras: si lo tenías y cuánto llevabas. */
interface Foto {
  level: number;
  /** Progreso hacia ESTE escalón, en tanto por uno. 0 si el escalón ya estaba conseguido. */
  ratio: number;
}

export function useAchievementNotice(
  games: TabData,
  notify: (kind: StatusNotice['kind'], message: string) => void,
): { flash: AchievementFlash | null; clear: () => void } {
  // La foto anterior, para saber qué ha subido EN ESTA escritura. Un `ref` y no un estado: compararse consigo
  // mismo no debe provocar un render más.
  const previous = useRef<Map<string, Foto> | null>(null);
  const [flash, setFlash] = useState<AchievementFlash | null>(null);

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

      const foto = new Map<string, Foto>(states.map((state) => [
        state.id,
        // El progreso solo tiene sentido hacia lo que AÚN NO TIENES: `next` es el umbral que falta, y en un
        // escalón ya conseguido es `null`. Una escalera descendente no tiene «porcentaje de camino» —el valor
        // baja hacia el umbral— así que se queda en 0 y no genera hitos.
        { level: state.level, ratio: state.next && state.next > 0 ? state.value / state.next : 0 },
      ]));
      const before = previous.current;
      previous.current = foto;

      // La marca de agua se guarda siempre que sube y nunca baja.
      const grown = evaluate.nextPeak(states, peak);
      if (grown !== peak) {
        try {
          localStorage.setItem(keys.ACHIEVEMENTS_PEAK_KEY, grown);
        } catch {
          // ídem
        }
      }

      /**
       * SEMBRAR Y CALLAR… SALVO LO QUE HAYA CAÍDO DESDE LA ÚLTIMA VEZ.
       *
       * Sin foto previa no hay «cambio», hay una foto inicial, y por eso la primera evaluación de la sesión no
       * anuncia lo que ya estaba. Pero eso trataba igual dos cosas muy distintas:
       *
       *  - **la primera vez en este aparato** —no hay marca de agua— donde de verdad no hay noticia que dar;
       *  - y **volver a abrir la app y encontrarse logros nuevos**, que sí la hay. Pasa al desplegar una
       *    ampliación del catálogo (noventa y ocho escalones nuevos concedidos de golpe a quien ya tenía
       *    biblioteca) y pasa también al sincronizar: lo que se cerró en el móvil se concede aquí al abrir.
       *
       * La MARCA DE AGUA distingue los dos casos sin guardar nada nuevo: si existe, este aparato ya había
       * evaluado, y lo que ahora está conseguido y NO figura en ella es exactamente lo que ha caído desde
       * entonces. Se anuncia una vez —la marca se guarda a continuación— y nunca se repite.
       *
       * Los «primeros pasos» quedan fuera: no se publican, no puntúan y su sitio es el de arranque, no un
       * resumen de lo que te esperaba.
       */
      if (!before) {
        if (!peak) return;
        const conocidos = evaluate.parsePeak(peak);
        const estreno = states
          .filter((state) => state.level >= 1 && !conocidos.has(state.id))
          .map((state) => catalog.ACHIEVEMENTS_BY_ID.get(state.id))
          .filter((def) => Boolean(def) && def?.family !== 'onboarding')
          .map((def) => def!);
        if (estreno.length === 0) return;
        setFlash({ kind: 'catalog', defs: estreno });
        notify('ok', estreno.length === 1
          ? labels.ACHIEVEMENTS_UI.unlockedOne(estreno[0].labels.name)
          : labels.ACHIEVEMENTS_UI.unlockedMany(estreno.length));
        return;
      }

      const risen = states.filter((state) => state.level > (before.get(state.id)?.level ?? 0));

      if (risen.length > 0) {
        const defs = risen
          .map((state) => catalog.ACHIEVEMENTS_BY_ID.get(state.id))
          .filter((def): def is NonNullable<typeof def> => Boolean(def));
        if (defs.length === 0) return;
        setFlash({ kind: 'unlock', defs });
        // El texto sigue yendo al banner: es su región viva la que lo anuncia (A11y-4). El nombre YA trae su
        // grado desde el catálogo, así que componerlo otra vez lo diría dos veces.
        notify('ok', defs.length === 1
          ? labels.ACHIEVEMENTS_UI.unlockedOne(defs[0].labels.name)
          : labels.ACHIEVEMENTS_UI.unlockedMany(defs.length));
        return;
      }

      // EL HITO, y solo si se CRUZA en esta escritura. De los que se cruzan a la vez gana el más avanzado: es el
      // que está más cerca de convertirse en medalla, y anunciar dos hitos de golpe en una sola cápsula no dice
      // nada («vas por la mitad de dos cosas»).
      let mejor: { id: string; ratio: number; umbral: number } | null = null;
      for (const state of states) {
        if (state.level >= 1 || !state.next || state.next <= 0) continue;
        const antes = before.get(state.id);
        if (!antes || antes.level >= 1) continue;
        const ratio = state.value / state.next;
        for (const umbral of MILESTONES) {
          if (antes.ratio < umbral && ratio >= umbral && (!mejor || ratio > mejor.ratio)) {
            mejor = { id: state.id, ratio, umbral };
          }
        }
      }
      if (!mejor) return;
      const def = catalog.ACHIEVEMENTS_BY_ID.get(mejor.id);
      const state = states.find((item) => item.id === mejor.id);
      if (!def || !state || !state.next) return;
      setFlash({ kind: 'milestone', def, value: state.value, step: state.next });
      notify('ok', labels.ACHIEVEMENTS_UI.milestoneAria(def.labels.name, Math.round(mejor.ratio * 100)));
    });

    return () => {
      cancelled = true;
    };
  }, [games, notify]);

  return { flash, clear: () => setFlash(null) };
}
