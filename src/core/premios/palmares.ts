/**
 * El palmarés como dato: de qué año es cada trofeo, si es de puesto o de participación, y en qué orden se enseña.
 *
 * EL AÑO ES LO QUE SEPARA LO ANTIGUO DE LO NUEVO. El histórico lleva ediciones de 2020 en adelante, importadas
 * todas a la vez: por fecha de concesión saldrían mezcladas, con 2020 delante de 2025 solo por haberse importado
 * después. Por eso la vitrina se ordena por el año de la EDICIÓN y la medalla lo lleva escrito.
 */
import type { PalmaresEntry } from '../../model/types/premios';
import { hasAward } from './awards';

/** El puesto que marca una entrada de PARTICIPACIÓN: votó y no entró en los cinco primeros. */
export const PALMARES_PARTICIPATION_RANK = 0;

/** ¿Es un trofeo por participar, y no por un puesto? */
export function isParticipation(entry: Pick<PalmaresEntry, 'rank'>): boolean {
  return Number(entry?.rank) === PALMARES_PARTICIPATION_RANK;
}

/**
 * A QUIÉN SE LE DA QUÉ al publicar: los cinco primeros PUESTOS, el trofeo de su puesto; el resto de quien votó,
 * el de participar. Una entrada por cuenta —la del puesto ya dice que participó—, y sin cuenta no hay perfil
 * donde ponerla.
 */
export function palmaresRecipientsFrom(
  leaderboard: Array<{ userId: string; rank: number }>,
): Array<{ uid: string; rank: number; place?: number }> {
  return leaderboard
    .filter((entry) => entry.userId)
    .map((entry) =>
      hasAward(entry.rank)
        ? { uid: entry.userId, rank: entry.rank }
        // La participación guarda además su puesto real: la medalla es la misma para todos, el puesto no.
        : { uid: entry.userId, rank: PALMARES_PARTICIPATION_RANK, ...(validPlace(entry.rank) ? { place: entry.rank } : {}) },
    );
}

/** Un puesto de clasificación con sentido: entero y positivo. */
export function validPlace(value: unknown): value is number {
  const place = Number(value);
  return Number.isInteger(place) && place > 0;
}

/**
 * EN QUÉ PUESTO QUEDÓ, sea cual sea su medalla: el del trofeo si lo hay y, si es una participación, el real de la
 * clasificación. `0` cuando no se sabe (participaciones concedidas antes de guardarlo y aún sin rellenar).
 */
export function palmaresPlace(entry: Pick<PalmaresEntry, 'rank' | 'place'>): number {
  if (!isParticipation(entry)) return Number(entry?.rank) || 0;
  return validPlace(entry?.place) ? Number(entry.place) : 0;
}

/** Un año con cuatro cifras razonable para una edición. */
function asYear(value: unknown): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2999 ? year : 0;
}

/**
 * El año de la edición de un trofeo.
 *
 * Los concedidos antes de guardar `season` no lo traen, así que se busca en el id y después en el nombre
 * («Game Awards 2025»). Sin nada de eso, `0`: la medalla se pinta sin año antes que con uno inventado.
 */
export function palmaresYear(entry: Pick<PalmaresEntry, 'season' | 'seasonId' | 'seasonName'>): number {
  const direct = asYear(entry?.season);
  if (direct) return direct;
  for (const text of [entry?.seasonId, entry?.seasonName]) {
    const match = String(text || '').match(/(?:^|\D)(2\d{3})(?:\D|$)/);
    if (match) return asYear(match[1]);
  }
  return 0;
}

/** El año corto de la píldora: 2021 → «’21». */
export function shortYear(year: number): string {
  return year ? `’${String(year).slice(-2)}` : '';
}

/**
 * La vitrina en orden: la edición más reciente primero y, dentro de una misma edición, el mejor puesto. La
 * participación va detrás de cualquier puesto (su `0` no puede ganarle al `1`).
 */
export function sortPalmares(entries: PalmaresEntry[]): PalmaresEntry[] {
  const puesto = (entry: PalmaresEntry) => (isParticipation(entry) ? 99 : Number(entry.rank) || 98);
  return [...entries]
    .filter((entry) => entry && entry.seasonId)
    .sort(
      (a, b) =>
        palmaresYear(b) - palmaresYear(a) ||
        puesto(a) - puesto(b) ||
        (b.awardedAt || 0) - (a.awardedAt || 0),
    );
}

/**
 * EL NOMBRE DE LA COMPETICIÓN, sin el año: «Game Awards 2025» → «Game Awards». El banderín del perfil pone el año
 * aparte, y con él dentro del nombre saldría dos veces.
 */
export function palmaresCompetition(entry: Pick<PalmaresEntry, 'seasonName' | 'seasonId'>): string {
  const nombre = String(entry?.seasonName || entry?.seasonId || '');
  return nombre.replace(/\s*(?:^|\b)(?:19|20)\d{2}\b\s*/g, ' ').replace(/\s+/g, ' ').trim() || nombre;
}
