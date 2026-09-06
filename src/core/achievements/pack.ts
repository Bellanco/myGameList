// EL ESPEJO: empaquetado y lectura defensiva de `profiles/{uid}.achievements`. Ver docs/plan-logros.md §5.3 y §9.3.
//
// UN MAPA DE BITS, y es la decisión que trajo «cada nivel es un logro». Con 32 logros, la gramática antigua
// —`id.nivel.día`— ocupaba 608 bytes en el peor caso y cabía de sobra en el kilobyte que valida la regla de
// Firestore. Con 250 escalones no cabe ni la mitad: solo los `id` ya son más de tres kilobytes. El bitmap dice lo
// mismo en **44 caracteres**, porque un escalón solo puede estar conseguido o no.
//
// GRAMÁTICA (versión 2):
//
//     2:<bits>[~<idx>.<día>[!],<idx>.<día>…]
//
//  - `bits` — base64url del mapa de bits, un bit por entrada de `MIRROR_ORDER`, el primero en el bit más alto del
//    primer byte. Conseguido = 1.
//  - la cola tras `~` lleva SOLO lo que el bitmap no puede decir: la fecha (días desde 2020-01-01, en base 36) y
//    el `!` de destacado. Va por prioridad —destacados, luego lo más raro— y se corta al llegar al tope, así que
//    un espejo lleno pierde fechas antes que perder logros.
//
// EL ORDEN DE `MIRROR_ORDER` ES CONTRATO. Cada bit significa lo que significa por su posición: reordenar el
// catálogo reescribe la vitrina de todo el mundo. Por eso incluye también los RETIRADOS —retirar un logro no
// puede correr los índices de los que van detrás— y por eso los escalones nuevos se añaden al final de su
// escalera y las escaleras nuevas al final de su familia (ver la cabecera de `catalog.ts`).
//
// GRANULARIDAD DE DÍA, NO DE INSTANTE, y es deliberado: un sello al minuto diría a qué horas usas la app, que es
// justo el dato que `applyProfileVisibility` borra de los listados que baja una amistad.
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from './catalog';
import { RARITY_POINTS } from './types';
import type { AchievementState } from './types';

/** Origen de la cuenta de días. Fijo para siempre: cambiarlo movería la fecha de todos los logros publicados. */
const EPOCH = Date.UTC(2020, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tope de la cadena, en caracteres. Es el mismo número que valida la regla de Firestore. */
export const ACHIEVEMENTS_LIST_MAX = 1024;

/** Tope de destacados. El que LEE lo aplica aunque lleguen más: es una preferencia ajena, no una instrucción. */
export const FEATURED_MAX = 3;

/** Versión del formato de empaquetado. La 1 —una entrada de texto por logro— ya no se escribe ni se lee. */
export const MIRROR_VERSION = 2;

/**
 * EL ORDEN DE LOS BITS. Todo lo publicable, retirados incluidos, en el orden del catálogo.
 *
 * Los «primeros pasos» no entran porque no se publican jamás (§5.3): la vitrina de alguien con quinientos juegos
 * no puede empezar por «escribió su primera reseña».
 */
export const MIRROR_ORDER: readonly string[] = ACHIEVEMENTS
  .filter((def) => def.family !== 'onboarding')
  .map((def) => def.id);

export interface AchievementMirror {
  v: number;
  at: number;
  list: string;
}

/** Un logro tal y como llega del espejo de otra persona. */
export interface MirroredAchievement {
  id: string;
  /** Siempre 1: un escalón se tiene o no se tiene. Se mantiene el campo porque lo leen el feed y la vitrina. */
  level: number;
  /** Instante (ms) del día del desbloqueo, o 0 si no vino fecha o si la que vino no era creíble. */
  unlockedAt: number;
  featured: boolean;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url sin relleno, escrita a mano: `btoa` no existe en todos los entornos donde corren los tests. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    const size = Math.min(3, bytes.length - i);
    out += B64[(chunk >> 18) & 63] + B64[(chunk >> 12) & 63];
    if (size > 1) out += B64[(chunk >> 6) & 63];
    if (size > 2) out += B64[chunk & 63];
  }
  return out;
}

function fromBase64(text: string): Uint8Array {
  const clean = String(text || '').replace(/[^A-Za-z0-9\-_]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let at = 0;
  for (const char of clean) {
    const value = B64.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (buffer >> bits) & 0xff;
      at += 1;
    }
  }
  return bytes.subarray(0, at);
}

function dayNumber(ms: number): number {
  if (!ms || ms <= 0) return 0;
  // Se cuenta sobre el DÍA LOCAL del dueño, no sobre UTC: es su calendario el que se está contando.
  const date = new Date(ms);
  const localMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.floor((localMidnight - EPOCH) / DAY_MS);
  return days > 0 ? days : 0;
}

function msFromDay(day: number): number {
  // Mediodía, para que ningún cambio de horario de verano mueva el día al pintarlo.
  return EPOCH + day * DAY_MS + 12 * 60 * 60 * 1000;
}

/**
 * Empaqueta los logros CONSEGUIDOS. El progreso hacia lo que no se tiene no sale del aparato (§3).
 *
 * QUÉ SE RECORTA CUANDO NO CABE: el bitmap NUNCA — va entero y es lo que sostiene la vitrina y el porcentaje.
 * Lo que se corta es la cola de fechas, y por el final: primero lo destacado, luego lo más raro. Si algo se
 * pierde, que sea la fecha de lo que menos dice de esa persona; el logro sigue estando.
 */
export function packAchievements(states: readonly AchievementState[], featured: readonly string[] = []): string {
  const featuredSet = new Set(featured.slice(0, FEATURED_MAX));
  const byId = new Map(states.map((state) => [state.id, state]));

  const bits = new Uint8Array(Math.ceil(MIRROR_ORDER.length / 8));
  const tail: Array<{ id: string; index: number; day: number; featured: boolean; weight: number }> = [];

  MIRROR_ORDER.forEach((id, index) => {
    const state = byId.get(id);
    if (!state || state.level < 1) return;
    bits[index >> 3] |= 0x80 >> (index & 7);
    const def = ACHIEVEMENTS_BY_ID.get(id);
    const day = dayNumber(state.unlockedAt);
    const isFeatured = featuredSet.has(id);
    if (day > 0 || isFeatured) {
      tail.push({ id, index, day, featured: isFeatured, weight: def ? RARITY_POINTS[def.rarity] : 0 });
    }
  });

  tail.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return b.day - a.day;
  });

  let out = `${MIRROR_VERSION}:${toBase64(bits)}`;
  let separator = '~';
  for (const entry of tail) {
    const piece = `${entry.index.toString(36)}${entry.day > 0 ? `.${entry.day.toString(36)}` : ''}${entry.featured ? '!' : ''}`;
    if (out.length + separator.length + piece.length > ACHIEVEMENTS_LIST_MAX) break;
    out += separator + piece;
    separator = ',';
  }
  return out;
}

/**
 * El documento completo, listo para el `merge` de `profiles/{uid}`.
 *
 * TODAVÍA NO LA LLAMA NADIE, y es a propósito: la escritura del espejo va detrás de
 * `ENABLE_ACHIEVEMENTS_PUBLISH` y ese interruptor sigue apagado. Vive aquí —y no en el repositorio que
 * escribirá— porque la FORMA del documento es asunto de este módulo: quien empaqueta la cadena es quien sabe qué
 * versión de gramática lleva.
 */
export function buildMirror(list: string, now: number): AchievementMirror {
  return { v: MIRROR_VERSION, at: now, list };
}

/**
 * PARSER DEFENSIVO. El espejo de otra persona no pasa por Zod —igual que el gist de un amigo, Zod solo corre al
 * publicar lo propio—, así que esto es la única defensa:
 *
 *  - versión desconocida (o la 1, que ya no se escribe) → vitrina vacía, nunca una excepción;
 *  - bits de más → se ignoran los que caen fuera del catálogo de ESTE cliente. Es el caso normal cuando un amigo
 *    va una versión por delante: sus logros nuevos reaparecen en cuanto este cliente se actualiza;
 *  - índice, día o formato ilegible en la cola → el logro se pinta SIN FECHA, no se descarta;
 *  - día en el futuro → sin fecha, que es preferible a enseñar una mentira comprobable.
 */
export function parseMirror(raw: unknown, now = Date.now()): MirroredAchievement[] {
  const list = typeof raw === 'string'
    ? raw
    : typeof (raw as AchievementMirror)?.list === 'string'
      ? (raw as AchievementMirror).list
      : '';
  if (!list) return [];

  const [head, tail] = list.slice(0, ACHIEVEMENTS_LIST_MAX).split('~');
  const [version, encoded] = String(head || '').split(':');
  if (Number(version) !== MIRROR_VERSION || !encoded) return [];

  const bits = fromBase64(encoded);
  const out: MirroredAchievement[] = [];
  const byIndex = new Map<number, MirroredAchievement>();

  MIRROR_ORDER.forEach((id, index) => {
    const byte = bits[index >> 3];
    if (byte === undefined || !(byte & (0x80 >> (index & 7)))) return;
    const item: MirroredAchievement = { id, level: 1, unlockedAt: 0, featured: false };
    byIndex.set(index, item);
    out.push(item);
  });

  let featuredLeft = FEATURED_MAX;
  for (const rawEntry of String(tail || '').split(',')) {
    const entry = rawEntry.trim();
    if (!entry) continue;
    const featured = entry.endsWith('!');
    const [rawIndex, rawDay] = (featured ? entry.slice(0, -1) : entry).split('.');
    const item = byIndex.get(parseInt(rawIndex, 36));
    if (!item) continue;

    const day = parseInt(rawDay || '', 36);
    if (Number.isFinite(day) && day > 0) {
      const candidate = msFromDay(day);
      if (candidate <= now) item.unlockedAt = candidate;
    }
    if (featured && featuredLeft > 0) {
      item.featured = true;
      featuredLeft -= 1;
    }
  }

  return out;
}

/**
 * Orden de la vitrina ajena: destacados primero y, sin ellos, **por rareza y luego por escalón**.
 *
 * El orden por familia —que era el anterior— producía LA MISMA VITRINA PARA TODO EL MUNDO, siempre encabezada por
 * el mismo logro, porque el catálogo se recorre igual para todos. Con la mayoría de la gente sin tocar nunca los
 * destacados, el orden por defecto ES la vitrina y tiene que decir algo.
 */
export function sortMirror(items: readonly MirroredAchievement[]): MirroredAchievement[] {
  return [...items].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    const defA = ACHIEVEMENTS_BY_ID.get(a.id);
    const defB = ACHIEVEMENTS_BY_ID.get(b.id);
    const weight = (defB ? RARITY_POINTS[defB.rarity] : 0) - (defA ? RARITY_POINTS[defA.rarity] : 0);
    if (weight !== 0) return weight;
    return (defB?.grade || 0) - (defA?.grade || 0);
  });
}

/**
 * Porcentaje de gente que tiene cada logro, medido sobre los espejos que el directorio YA se ha descargado
 * (§6.6bis). Cuesta cero: no hay petición nueva, no hay campo nuevo y las cadenas ya están en memoria.
 *
 * Devuelve `null` por debajo de `minSample`. Con siete personas, «el 14 %» es una persona: enseñarlo es peor que
 * callarlo. Y el llamante DEBE pintar el denominador junto al porcentaje —«14 % · 6 de 43»—: sin él, es lo único
 * de esa pantalla que se puede leer como una afirmación global, y no lo es.
 */
export function measureRarity(
  mirrors: readonly string[],
  minSample = 20,
): { percent: ReadonlyMap<string, number>; sample: number } | null {
  const sample = mirrors.filter((mirror) => typeof mirror === 'string' && mirror.length > 0);
  if (sample.length < minSample) return null;

  const holders = new Map<string, number>();
  for (const mirror of sample) {
    for (const item of parseMirror(mirror)) {
      holders.set(item.id, (holders.get(item.id) || 0) + 1);
    }
  }

  const percent = new Map<string, number>();
  for (const [id, count] of holders) percent.set(id, Math.round((count / sample.length) * 100));
  return { percent, sample: sample.length };
}
