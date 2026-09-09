// Señales LOCALES de los logros: lo poco que no deja rastro en la biblioteca y hay que registrar.
//
// Módulo propio y deliberadamente diminuto, por presupuesto de chunk: quien SELLA estas señales es la ruleta,
// y si el sello viviera en `viewmodel/useAchievements` —que importa el evaluador y el catálogo entero— abrir la
// ruleta arrastraría todo eso a su chunk sin pintar una sola medalla. Aquí solo hay dos accesos a
// `localStorage`, que es exactamente lo que ese punto necesita. Mismo criterio que separó `feedMovePreference`
// de `view/hooks/preferences`.
import { ACHIEVEMENTS_SOCIAL_KEY, ROULETTE_USED_KEY } from '../constants/storageKeys';

function read(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    // localStorage no disponible (modo privado estricto): la señal se pierde y el logro no salta. Es preferible
    // a que un acceso al almacenamiento tumbe el render de la pantalla que lo lee.
    return '';
  }
}

/** Sello (ms) de la primera vez que se usó la ruleta, o 0. */
export function rouletteUsedAt(): number {
  return Number(read(ROULETTE_USED_KEY)) || 0;
}

/**
 * Marca la ruleta como usada. Idempotente: solo escribe la PRIMERA vez, para que el sello sea el de cuando de
 * verdad se descubrió y no el de la última tirada.
 */
export function markRouletteUsed(now = Date.now()): void {
  if (read(ROULETTE_USED_KEY)) return;
  try {
    localStorage.setItem(ROULETTE_USED_KEY, String(now));
  } catch {
    // Sin persistencia: vale para la sesión en curso y no se recordará.
  }
}

/** Los cuatro contadores que solo conoce el hub, tal como se recordaron la última vez. */
export interface SocialCounters {
  friends: number;
  postWeeks: number;
  profileCreatedAt: number;
  hasSync: boolean;
}

const SIN_CONTADORES: SocialCounters = { friends: 0, postWeeks: 0, profileCreatedAt: 0, hasSync: false };

/**
 * Lo que se recordó del último paso por el hub. Todo a cero si nunca se ha entrado, que es exactamente el
 * comportamiento anterior: sin datos, esos logros no se conceden y no cuentan.
 */
export function socialCounters(): SocialCounters {
  try {
    const raw = read(ACHIEVEMENTS_SOCIAL_KEY);
    if (!raw) return SIN_CONTADORES;
    const value = JSON.parse(raw) as Partial<SocialCounters>;
    return {
      friends: Number(value.friends) || 0,
      postWeeks: Number(value.postWeeks) || 0,
      profileCreatedAt: Number(value.profileCreatedAt) || 0,
      hasSync: Boolean(value.hasSync),
    };
  } catch {
    // Un JSON corrupto no puede tumbar la pantalla de logros: se cuenta como que no hay nada recordado.
    return SIN_CONTADORES;
  }
}

/**
 * Recuerda los contadores del hub para que el panel cuente lo mismo.
 *
 * NUNCA A LA BAJA en lo que se acumula. El hub llama a esto según le van llegando las lecturas —el grafo de
 * amistades, el directorio, el perfil—, y en los primeros renders esos números son cero: guardarlos tal cual
 * borraría lo recordado y el panel volvería a contar de menos hasta la siguiente visita. Lo que sí puede bajar
 * es `hasSync`, que es un interruptor y no una cuenta.
 */
export function rememberSocialCounters(counters: SocialCounters): void {
  const previo = socialCounters();
  const fundido: SocialCounters = {
    friends: Math.max(previo.friends, counters.friends),
    postWeeks: Math.max(previo.postWeeks, counters.postWeeks),
    profileCreatedAt: counters.profileCreatedAt || previo.profileCreatedAt,
    hasSync: counters.hasSync,
  };
  if (
    fundido.friends === previo.friends
    && fundido.postWeeks === previo.postWeeks
    && fundido.profileCreatedAt === previo.profileCreatedAt
    && fundido.hasSync === previo.hasSync
  ) return;
  try {
    localStorage.setItem(ACHIEVEMENTS_SOCIAL_KEY, JSON.stringify(fundido));
  } catch {
    // Sin persistencia: el panel seguirá contando sin ellos, que es lo que hacía antes.
  }
}
