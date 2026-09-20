/**
 * Los instantes del calendario de la edición, fijados en la zona de la votación.
 *
 * Las fechas se eligen como un DÍA (`YYYY-MM-DD`) en el panel, pero lo que se guarda son INSTANTES, y el de
 * cierre lo comparan también las reglas de Firestore. Por eso no pueden depender del huso del navegador de quien
 * administra: con `new Date('YYYY-MM-DDT23:59:59')` —que se interpreta en hora local— administrar desde otro huso
 * desplazaba el cierre hasta doce horas.
 *
 * POR QUÉ NO SE USA `core/utils/dateTime`, que ya tiene bordes de día: aquel trabaja en la hora LOCAL de quien
 * mira, que es lo correcto para una biblioteca personal —tus días son los tuyos— y lo contrario de lo que hace
 * falta aquí. El plazo de una votación es el mismo para todo el mundo, así que se fija en Europe/Madrid y no se
 * mueve aunque el visitante esté en otro continente.
 *
 * Convenio de bordes: la apertura entra a las 00:00:00.000 del día elegido; el cierre se vive entero, hasta las
 * 23:59:59.999.
 */

/** Zona horaria de referencia de la votación. */
export const VOTING_TIME_ZONE = 'Europe/Madrid';

const tzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VOTING_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Desfase de la zona de votación respecto a UTC, en milisegundos, para un instante dado. */
function zoneOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(
    tzFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  // `hour` puede venir como 24 para la medianoche con `hour12: false`.
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );

  // `formatToParts` no da milisegundos, así que `asIfUtc` está truncado al segundo: hay que truncar también el
  // instante, o el desfase sale corto y la hora de cierre se desplaza casi un segundo.
  const truncatedToSecond = Math.floor(instant.getTime() / 1000) * 1000;

  return asIfUtc - truncatedToSecond;
}

/** Borde de un día (`YYYY-MM-DD`) en la zona de la votación, en epoch. `null` si el día no vale. */
export function dayInstantInVotingZone(
  day: string | null | undefined,
  boundary: 'start' | 'end' = 'end',
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;

  const [year, month, date] = (day as string).split('-').map(Number);
  const wallClock =
    boundary === 'start'
      ? Date.UTC(year, month - 1, date, 0, 0, 0, 0)
      : Date.UTC(year, month - 1, date, 23, 59, 59, 999);

  // Primera aproximación con el desfase de ese instante...
  let instant = wallClock - zoneOffsetMs(new Date(wallClock));
  // ...y segunda pasada, por si ese día hay cambio de hora y el desfase de la medianoche no es el del día.
  instant = wallClock - zoneOffsetMs(new Date(instant));

  return instant;
}

/** Final de un día en la zona de la votación: 23:59:59.999. */
export function endOfDayInVotingZone(day: string | null | undefined): number | null {
  return dayInstantInVotingZone(day, 'end');
}

/** Comienzo de un día en la zona de la votación: 00:00:00.000. */
export function startOfDayInVotingZone(day: string | null | undefined): number | null {
  return dayInstantInVotingZone(day, 'start');
}

/**
 * Día (`YYYY-MM-DD`) al que pertenece un instante, en la zona de la votación.
 *
 * Es la operación inversa que necesitan los campos de fecha del panel. Derivar el día con la hora local de quien
 * administra haría que un cierre a las 23:59 de Madrid se mostrara como el día siguiente desde otro huso.
 */
export function toVotingZoneDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';

  const parts = Object.fromEntries(
    tzFormatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Suma días a un día `YYYY-MM-DD`.
 *
 * Se opera en UTC a MEDIODÍA a propósito: a esa hora ningún cambio de hora del mundo puede desplazar la fecha al
 * día de al lado.
 */
export function addDaysToDay(day: string | null | undefined, amount: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  const [year, month, date] = (day as string).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount, 12));
  return shifted.toISOString().slice(0, 10);
}

/** Hoy, en la zona de la votación. */
export function todayInVotingZone(): string {
  return toVotingZoneDay(new Date().toISOString());
}

/** Los días del panel convertidos a los campos del calendario. */
export interface PremiosScheduleDays {
  opensDay?: string | null;
  closesDay?: string | null;
  resultsDay?: string | null;
}

export interface PremiosScheduleFields {
  opensAt: string | null;
  opensAtMillis: number | null;
  closesAt: string | null;
  closesAtMillis: number | null;
  resultsAt: string | null;
  resultsAtMillis: number | null;
}

/**
 * Construye los campos del calendario a partir de los días elegidos.
 *
 * Un día vacío o inválido deja SU PAR de campos a null, nunca a medias: dejar el epoch con valor mientras el ISO
 * es null mantendría vigente un plazo que el administrador cree haber borrado.
 */
export function buildScheduleFields({
  opensDay,
  closesDay,
  resultsDay,
}: PremiosScheduleDays = {}): PremiosScheduleFields {
  const pair = (day: string | null | undefined, boundary: 'start' | 'end'): [string | null, number | null] => {
    const millis = day ? dayInstantInVotingZone(day, boundary) : null;
    return millis === null ? [null, null] : [new Date(millis).toISOString(), millis];
  };

  const [opensAt, opensAtMillis] = pair(opensDay, 'start');
  const [closesAt, closesAtMillis] = pair(closesDay, 'end');
  const [resultsAt, resultsAtMillis] = pair(resultsDay, 'end');

  return { opensAt, opensAtMillis, closesAt, closesAtMillis, resultsAt, resultsAtMillis };
}
