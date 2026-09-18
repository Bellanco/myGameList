import { useEffect, useRef, useState } from 'react';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import { emitMoment } from '../../core/effects/moments';
import type { AchievementFlash } from '../components/stats/AchievementToast';
import type { AchievementDef } from '../../core/achievements/types';
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
 *    ver el bloque de `if (!antes)`, que es donde se separa «primera vez aquí» de «he vuelto y hay logros
 *    nuevos». La avalancha de una ampliación se cuenta en UNA cápsula, no en docenas de avisos.
 *
 * Y UNA QUINTA, QUE ES LA QUE FALTABA: **lo que ya se ha contado no se vuelve a contar NUNCA**, venga de donde
 * venga. Eso lo recuerda `ACHIEVEMENTS_TOLD_KEY`, y no la marca de agua.
 *
 * ⚑ EL FALLO QUE CIERRA (medallas viejas repitiéndose). «Nuevo» se decidía comparando SOLO con la foto en
 * memoria de la evaluación anterior, tratando como recién conseguido todo escalón que no estuviera en ella
 * (`?? 0`). Y la foto envejece sin que nadie la toque, porque **el catálogo crece a mitad de sesión**: al abrir
 * el hub o `/logros` llega `appConfig/achievements` y `applyExtraSteps()` lo reconstruye con los umbrales del
 * panel (§6.4bis). A partir de ahí, la siguiente escritura de la biblioteca veía esos escalones por primera vez
 * en `states` y los anunciaba como desbloqueos —con su medalla y su `achievement-unlocked`— aunque fueran de
 * hace meses y la marca de agua los conociera de sobra. Y como la foto se toma otra vez en cada arranque con el
 * catálogo del código, **volvía a pasar en cada sesión**.
 *
 * Ahora la comparación tiene tres guardas y ninguna depende de que la foto esté al día:
 *  - lo que ya figura en `ACHIEVEMENTS_TOLD_KEY` no se anuncia, y punto;
 *  - dos fotos de CATÁLOGOS distintos (`catalogEpoch`) no son comparables: lo que apareció en medio se cuenta
 *    como ampliación (una cápsula `catalog`, sin celebración) y no como desbloqueo;
 *  - una foto tomada con la biblioteca VACÍA tampoco lo es: cuando los juegos llegan de IndexedDB un momento
 *    después, el progreso salta de 0 a lo que sea y eso no lo ha hecho nadie. Antes salía un «87 % completado»
 *    en cada arranque que se hidratara así.
 *
 * LOS HITOS (§7.4bis). Además del desbloqueo, se avisa al CRUZAR la mitad y la recta final de una escalera en
 * marcha. Se cruzan, no se «están»: hace falta que el porcentaje anterior estuviera por debajo, y esa comparación
 * sale de la misma foto que ya se guardaba para los desbloqueos, sin persistir nada. Manda el desbloqueo: si una
 * escritura sube un logro Y cruza un hito, se cuenta el logro y el hito se calla.
 *
 * Y EL EVALUADOR ENTRA POR `import()` DINÁMICO, que no es un capricho: este hook lo usa `App.tsx`, que es el
 * arranque, y el catálogo con sus 64 métricas y sus textos no puede viajar ahí. Hay un presupuesto crítico
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

/**
 * La foto ENTERA de una evaluación: los escalones y las dos cosas que dicen si la siguiente se puede comparar
 * con ella. Sin ellas, dos evaluaciones hechas sobre catálogos —o sobre bibliotecas— distintas se restan como si
 * fueran la misma, y la diferencia se lee como mérito recién hecho.
 */
interface Toma {
  escalones: Map<string, Foto>;
  /** `catalogEpoch()`: sube cada vez que el catálogo se reconstruye con los umbrales del panel. */
  epoca: number;
  /** Juegos en la biblioteca. Distingue «acaban de llegar» de «he guardado uno». */
  juegos: number;
}

/** Lo que hay que enseñar: la cápsula y el texto que el banner le dice a un lector de pantalla. */
interface Aviso {
  flash: AchievementFlash;
  texto: string;
}

function leer(clave: string): string {
  try {
    return localStorage.getItem(clave) || '';
  } catch {
    // Sin persistencia: la memoria vale para la sesión en curso y no se recordará.
    return '';
  }
}

function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // ídem
  }
}

function tamañoDe(games: TabData): number {
  return games.c.length + games.v.length + games.e.length + games.p.length;
}

export function useAchievementNotice(
  games: TabData,
  notify: (kind: StatusNotice['kind'], message: string) => void,
): { flash: AchievementFlash | null; clear: () => void } {
  // La foto anterior, para saber qué ha subido EN ESTA escritura. Un `ref` y no un estado: compararse consigo
  // mismo no debe provocar un render más.
  const previous = useRef<Toma | null>(null);
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

      const peak = leer(keys.ACHIEVEMENTS_PEAK_KEY);
      /**
       * LO YA CONTADO, que NO es la marca de agua (ver `ACHIEVEMENTS_TOLD_KEY`). La marca dice qué tienes y la
       * escriben también el hub y el panel; esta dice qué se te ha anunciado y la escribe solo este hook.
       *
       * Se siembra de la marca de agua mientras no exista: lo conseguido antes de que esta clave naciera se da
       * por contado, que es lo que evita soltarle el historial entero a quien lleva meses usando la app.
       */
      const contadoRaw = leer(keys.ACHIEVEMENTS_TOLD_KEY) || peak;
      const contado = evaluate.parsePeak(contadoRaw);

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

      const toma: Toma = {
        escalones: new Map<string, Foto>(states.map((state) => [
          state.id,
          // El progreso solo tiene sentido hacia lo que AÚN NO TIENES: `next` es el umbral que falta, y en un
          // escalón ya conseguido es `null`. Una escalera descendente no tiene «porcentaje de camino» —el valor
          // baja hacia el umbral— así que se queda en 0 y no genera hitos.
          { level: state.level, ratio: state.next && state.next > 0 ? state.value / state.next : 0 },
        ])),
        epoca: catalog.catalogEpoch(),
        juegos: tamañoDe(games),
      };
      const antes = previous.current;
      previous.current = toma;

      // La marca de agua se guarda siempre que sube y nunca baja.
      const grown = evaluate.nextPeak(states, peak);
      if (grown !== peak) guardar(keys.ACHIEVEMENTS_PEAK_KEY, grown);

      /** Lo conseguido que todavía no se ha anunciado. Los «primeros pasos» no entran: su sitio es el arranque. */
      const sinContar = (): AchievementDef[] => states
        .filter((state) => state.level >= 1 && !contado.has(state.id))
        .map((state) => catalog.ACHIEVEMENTS_BY_ID.get(state.id))
        .filter((def): def is AchievementDef => Boolean(def) && def?.family !== 'onboarding');

      const capsula = (defs: readonly AchievementDef[], kind: 'unlock' | 'catalog'): Aviso => ({
        flash: { kind, defs },
        // El texto sigue yendo al banner: es su región viva la que lo anuncia (A11y-4). El nombre YA trae su
        // grado desde el catálogo, así que componerlo otra vez lo diría dos veces.
        texto: defs.length === 1
          ? labels.ACHIEVEMENTS_UI.unlockedOne(defs[0].labels.name)
          : labels.ACHIEVEMENTS_UI.unlockedMany(defs.length),
      });

      function decidir(): Aviso | null {
        /**
         * SEMBRAR Y CALLAR… SALVO LO QUE HAYA CAÍDO DESDE LA ÚLTIMA VEZ.
         *
         * Sin foto previa no hay «cambio», hay una foto inicial, y por eso la primera evaluación de la sesión no
         * anuncia lo que ya estaba. Pero eso trataba igual dos cosas muy distintas:
         *
         *  - **la primera vez en este aparato** —no hay nada contado— donde de verdad no hay noticia que dar;
         *  - y **volver a abrir la app y encontrarse logros nuevos**, que sí la hay. Pasa al desplegar una
         *    ampliación del catálogo (noventa y ocho escalones nuevos concedidos de golpe a quien ya tenía
         *    biblioteca) y pasa también al sincronizar: lo que se cerró en el móvil se concede aquí al abrir.
         */
        if (!antes) {
          if (!contadoRaw) return null;
          const estreno = sinContar();
          return estreno.length > 0 ? capsula(estreno, 'catalog') : null;
        }

        /**
         * LA BIBLIOTECA ACABA DE LLEGAR, que no es lo mismo que haber hecho algo. El estado de arranque sale de
         * `localStorage` de forma síncrona, pero `loadLocalStateAsync` puede hidratar desde IndexedDB un momento
         * después, y entonces la foto de referencia se tomó con cero juegos: todo lo que la biblioteca sostiene
         * aparece «recién subido» y las escaleras a medias cruzan sus hitos de golpe.
         *
         * De cero a UN juego sí se anuncia: ese es el primer juego de verdad de alguien, y el que enciende los
         * primeros pasos. Lo que se descarta es el salto en bloque, que además es el de una importación — y esa,
         * por la misma regla de siempre, no reparte veinte avisos.
         */
        if (antes.juegos === 0 && toma.juegos > 1) return null;

        /**
         * EL CATÁLOGO HA CRECIDO ENTRE LAS DOS FOTOS. No son comparables: los escalones que el panel acaba de
         * añadir no estaban en la anterior y restarlos diría que se han conseguido ahora. Lo que de verdad es
         * nuevo —lo que nadie ha contado todavía— se cuenta como ampliación, en una sola cápsula y sin
         * celebración; el resto se calla.
         */
        if (antes.epoca !== toma.epoca) {
          const estreno = sinContar();
          return estreno.length > 0 ? capsula(estreno, 'catalog') : null;
        }

        // LO QUE SUBE EN ESTA ESCRITURA. `contado` es el cinturón de seguridad: un escalón ya anunciado no vuelve
        // a serlo aunque la foto anterior no lo tuviera por el motivo que sea.
        const risen = states.filter((state) =>
          state.level > (antes.escalones.get(state.id)?.level ?? 0) && !contado.has(state.id));

        if (risen.length > 0) {
          const defs = risen
            .map((state) => catalog.ACHIEVEMENTS_BY_ID.get(state.id))
            .filter((def): def is AchievementDef => Boolean(def));
          return defs.length > 0 ? capsula(defs, 'unlock') : null;
        }

        // EL HITO, y solo si se CRUZA en esta escritura. De los que se cruzan a la vez gana el más avanzado: es el
        // que está más cerca de convertirse en medalla, y anunciar dos hitos de golpe en una sola cápsula no dice
        // nada («vas por la mitad de dos cosas»).
        let mejor: { id: string; ratio: number; umbral: number } | null = null;
        for (const state of states) {
          if (state.level >= 1 || !state.next || state.next <= 0) continue;
          const previo = antes.escalones.get(state.id);
          if (!previo || previo.level >= 1) continue;
          const ratio = state.value / state.next;
          for (const umbral of MILESTONES) {
            if (previo.ratio < umbral && ratio >= umbral && (!mejor || ratio > mejor.ratio)) {
              mejor = { id: state.id, ratio, umbral };
            }
          }
        }
        if (!mejor) return null;
        const def = catalog.ACHIEVEMENTS_BY_ID.get(mejor.id);
        const state = states.find((item) => item.id === mejor.id);
        if (!def || !state || !state.next) return null;
        return {
          flash: { kind: 'milestone', def, value: state.value, step: state.next },
          texto: labels.ACHIEVEMENTS_UI.milestoneAria(def.labels.name, Math.round(mejor.ratio * 100)),
        };
      }

      const aviso = decidir();

      /**
       * Y SE APUNTA LO CONTADO, se haya anunciado o no. Las dos mitades son necesarias: lo que se acaba de
       * enseñar no puede repetirse, y lo que se ha callado a propósito —la siembra, la biblioteca que llega, la
       * retroactividad de una ampliación— tampoco puede salir tres minutos después como si fuera nuevo. Un solo
       * sitio, al final, para que ningún camino de salida se lo deje.
       */
      const siguiente = evaluate.nextPeak(states, contadoRaw);
      if (siguiente !== contadoRaw) guardar(keys.ACHIEVEMENTS_TOLD_KEY, siguiente);

      if (!aviso) return;
      setFlash(aviso.flash);
      // El momento que puede celebrar cada tema (ver `core/effects/moments`). Solo el DESBLOQUEO: el sembrado
      // de una ampliación del catálogo y los hitos a mitad de escalera no son un logro conseguido ahora.
      if (aviso.flash.kind === 'unlock') emitMoment('achievement-unlocked');
      notify('ok', aviso.texto);
    });

    return () => {
      cancelled = true;
    };
  }, [games, notify]);

  return { flash, clear: () => setFlash(null) };
}
