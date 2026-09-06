/**
 * SIEMBRA DE DESARROLLO de los logros. Solo existe con `import.meta.env.DEV`: el empaquetador se lleva por
 * delante lo que cuelga de un `DEV` falso, así que ni una línea de esto entra en producción.
 *
 * PARA QUÉ EXISTE, y no es para inventarse los logros propios. El evaluador es real y corre sobre la biblioteca
 * de verdad, así que **tus** logros no son un mock: salen de tus juegos. Lo que aquí se fabrica es lo que hoy no
 * puede existir todavía:
 *
 *  1. **Espejos de otras personas.** Mientras `ENABLE_ACHIEVEMENTS_PUBLISH` esté apagado nadie publica nada, así
 *     que la tira de la ficha, el listado ajeno, el porcentaje comparado y el feed no tendrían con qué pintarse.
 *  2. **Una muestra para el porcentaje.** El corte del §6.6bis es de veinte espejos: por debajo no se pinta
 *     nada, y sin siembra no hay veinte.
 *  3. **Casos que una biblioteca real no da.** Los seis logros que arrancan dormidos, los ocultos sin conseguir
 *     y un nivel al tope, para poder mirar los cinco estados de la medalla en la misma pantalla.
 *
 * CÓMO SE USA: se instala sola en desarrollo y expone `window.logros` en la consola.
 *
 *     logros.espejos()      → cuántos espejos falsos hay y con qué forma
 *     logros.mios()         → tus logros REALES, tal y como los ve el evaluador
 *     logros.marca()        → la marca de agua guardada
 *     logros.olvidar()      → borra marca de agua y sello de ruleta (vuelve al estado de recién instalado)
 *
 * QUÉ SE BORRA AL TERMINAR: este fichero entero y la llamada de `main.tsx`. Nada más — el evaluador, el catálogo,
 * el empaquetado y las pantallas son código de verdad y se quedan.
 */
import { ACHIEVEMENTS, LADDERS, ACHIEVEMENTS_BY_LADDER } from '../core/achievements/catalog';
import { measureRarity, packAchievements, parseMirror } from '../core/achievements/pack';
import type { AchievementState } from '../core/achievements/types';
import { ACHIEVEMENTS_PEAK_KEY, ROULETTE_USED_KEY } from '../core/constants/storageKeys';

/** Cuántos perfiles falsos se fabrican. Por encima del corte de 20 del §6.6bis, para que el porcentaje se vea. */
const FAKE_PROFILES = 43;

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = Date.UTC(2020, 0, 1);

/**
 * Generador determinista. La misma semilla da siempre los mismos espejos, y eso importa más de lo que parece:
 * un porcentaje que baila en cada recarga hace imposible juzgar si la cifra se lee bien.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Un espejo falso, empaquetado por `packAchievements` de verdad.
 *
 * Se pasa por el empaquetador real y no se escribe la cadena a mano a propósito: así el parser defensivo que
 * corre en pantalla es el que tendrá que tragarse los espejos reales, y cualquier fallo suyo se ve ahora.
 *
 * Y se rellena POR ESCALERA, no escalón suelto: quien tiene «Créditos finales V» tiene los cuatro de debajo. Un
 * espejo con huecos no lo produce nunca el evaluador, y sembrarlo así escondería los fallos de la vitrina.
 */
function fakeMirror(seed: number, now: number): string {
  const random = rng(seed);
  const states: AchievementState[] = [];
  const featured: string[] = [];

  for (const ladder of LADDERS) {
    if (ladder.family === 'onboarding' || ladder.retired) continue;
    // Los comunes los tiene casi todo el mundo y los excepcionales casi nadie: es lo que hace que el porcentaje
    // medido diga algo al mirarlo, en vez de salir todo al 50 %.
    const odds = { comun: 0.82, infrecuente: 0.55, raro: 0.3, excepcional: 0.08 }[ladder.rarity];
    if (random() > odds) continue;

    const steps = ACHIEVEMENTS_BY_LADDER.get(ladder.key) || [];
    const reached = 1 + Math.floor(random() * steps.length * 0.8);
    for (const def of steps.slice(0, Math.min(reached, steps.length))) {
      // Fecha dentro de los últimos dos años, para que el listado tenga días distintos que enseñar.
      const day = Math.floor((now - EPOCH) / DAY_MS) - Math.floor(random() * 730);
      states.push({ id: def.id, level: 1, value: def.step, next: null, unlockedAt: EPOCH + day * DAY_MS });
    }
    const top = steps[Math.min(reached, steps.length) - 1];
    if (top && featured.length < 3 && random() > 0.88) featured.push(top.id);
  }

  return packAchievements(states, featured);
}

/** Los espejos falsos de la sesión. Estables mientras dure la pestaña. */
let mirrors: string[] | null = null;

/**
 * Espejos falsos para la parte social. `count` sale del número de perfiles que el directorio traería.
 *
 * Devuelve SIEMPRE la misma lista dentro de una sesión: el porcentaje comparado tiene que quedarse quieto para
 * poder juzgarlo.
 */
export function seededMirrors(now = Date.now()): string[] {
  if (!mirrors) {
    mirrors = Array.from({ length: FAKE_PROFILES }, (_unused, index) => fakeMirror(index * 7919 + 13, now));
  }
  return mirrors;
}

/**
 * Un espejo concreto para una persona, elegido de forma estable a partir de su identificador.
 *
 * Estable por `profileId` y no al azar: la ficha de alguien tiene que enseñar las mismas medallas al entrar dos
 * veces, o no hay forma de mirar si la tira se lee bien.
 */
export function seededMirrorFor(profileId: string, now = Date.now()): string {
  const list = seededMirrors(now);
  let hash = 0;
  for (let index = 0; index < profileId.length; index += 1) {
    hash = (hash * 31 + profileId.charCodeAt(index)) >>> 0;
  }
  return list[hash % list.length] || '';
}

/** Instala las herramientas de consola. Idempotente. */
export function installAchievementTools(): void {
  const tools = {
    espejos: () => {
      const list = seededMirrors();
      const medida = measureRarity(list);
      // eslint-disable-next-line no-console
      console.table(
        list.slice(0, 8).map((mirror, index) => ({
          perfil: `falso-${index}`,
          bytes: mirror.length,
          logros: parseMirror(mirror).length,
        })),
      );
      // eslint-disable-next-line no-console
      console.log(`${list.length} espejos falsos · muestra para el porcentaje: ${medida ? medida.sample : 'insuficiente'}`);
      return medida?.percent;
    },
    mios: () => {
      // eslint-disable-next-line no-console
      console.log('Abre /logros: son los REALES, calculados sobre tu biblioteca. Esto solo lista el catálogo.');
      // eslint-disable-next-line no-console
      console.table(
        ACHIEVEMENTS.map((def) => ({
          id: def.id,
          nombre: def.labels.name,
          familia: def.family,
          rareza: def.rarity,
          oculto: Boolean(def.hidden),
          escalera: def.ladder,
          grado: `${def.grade}/${def.grades}`,
          umbral: def.descending ? `≤ ${def.step}` : def.step,
        })),
      );
    },
    marca: () => {
      try {
        return localStorage.getItem(ACHIEVEMENTS_PEAK_KEY) || '(vacía)';
      } catch {
        return '(sin localStorage)';
      }
    },
    olvidar: () => {
      try {
        localStorage.removeItem(ACHIEVEMENTS_PEAK_KEY);
        localStorage.removeItem(ROULETTE_USED_KEY);
      } catch {
        // sin persistencia: no hay nada que olvidar
      }
      // eslint-disable-next-line no-console
      console.log('Marca de agua y sello de ruleta borrados. Recarga para verlo como recién instalado.');
    },
  };

  (window as unknown as { logros?: typeof tools }).logros = tools;
  // eslint-disable-next-line no-console
  console.info('[logros] Siembra de desarrollo lista. Escribe `logros` en la consola para las herramientas.');
}
