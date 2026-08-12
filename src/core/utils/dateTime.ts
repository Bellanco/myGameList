// Día y mes en el CALENDARIO DEL DISPOSITIVO, no en UTC.
//
// El instante se guarda siempre como epoch en milisegundos (`_ts`, `updatedAt`, `createdAt`, `reviewedAt`,
// `listedAt`, `ts`): un punto absoluto en la línea del tiempo, referido a UTC y sin zona. Ese formato no se toca —
// es el reloj que compara el merge CRDT (`syncRepository`) y el que ordena el feed, y cualquier aritmética de
// ventanas (TTL de caché, los 30 días de inactividad, la tolerancia de ±1 h) es una resta de milisegundos.
//
// Lo que NO es absoluto es el DÍA al que pertenece ese instante: eso depende de quién mira. Una reseña escrita a
// las 00:06 del 12 en Madrid (UTC+2) es `2026-08-11T22:06Z`, así que `toISOString().slice(0, 10)` la archivaba en
// el día 11 mientras su propia tarjeta —formateada con `toLocaleDateString`— decía 12. El feed se contradecía
// consigo mismo en la franja de después de medianoche, y el desfase crecía con el huso: en UTC+14 son 14 horas
// de cada día las que caían en la cabecera del día anterior.
//
// La regla del proyecto ya estaba escrita en `statsSnapshotRepository.monthKey` ("el usuario piensa en meses de su
// calendario") y en `computeStats.monthOf`; el feed social era la única excepción. Aquí se hace la cuenta una vez
// para que no vuelva a divergir según el archivo.

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** `AAAA-MM-DD` sobre el que se validan las claves de día que entran como texto (fecha ancla del AdminHub). */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Día `AAAA-MM-DD` al que pertenece el instante EN LA ZONA DEL DISPOSITIVO.
 *
 * Sustituye a `new Date(ms).toISOString().slice(0, 10)`, que responde a otra pregunta: en qué día caía en
 * Greenwich. Devuelve `''` si el instante no es una fecha válida (timestamp corrupto o en micro/nanosegundos),
 * para que quien agrupa pueda descartar la entrada en vez de crear un grupo `NaN-NaN-NaN`.
 */
export function localDayKey(value: number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Medianoche LOCAL del día `AAAA-MM-DD`, para titular el grupo.
 *
 * El atajo `new Date('2026-08-12')` no vale: la especificación parsea la forma corta como medianoche UTC, y al
 * leerla luego con `getDate()`/`getMonth()` —lo que hace la cabecera— el titular baja un día en todo el
 * hemisferio occidental. Construyéndola por componentes, el día que se lee es el día que se pidió.
 *
 * Devuelve una fecha inválida si la clave no tiene el formato esperado; el llamante ya comprueba `getTime()`.
 */
export function startOfLocalDay(dayKey: string): Date {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    return new Date(NaN);
  }
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Mediodía LOCAL del día `AAAA-MM-DD`, en milisegundos.
 *
 * Para SELLAR una fecha en un día concreto (la fecha ancla con la que el AdminHub recoloca el histórico de
 * reseñas sin fecha real). Se elige el mediodía y no la medianoche porque deja doce horas de margen a cada lado:
 * la entrada sigue cayendo en el día pedido aunque se lea desde otro huso, y sobrevive a un cambio de horario de
 * verano. Devuelve `NaN` si la clave no es válida.
 */
export function noonOfLocalDay(dayKey: string): number {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    return NaN;
  }
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

/**
 * Mes `AAAA-MM` al que pertenece el instante en la zona del dispositivo.
 *
 * Misma razón que `localDayKey`, un escalón más arriba: en UTC, una instantánea del 31 a las 23:00 en Madrid
 * caería en el mes siguiente y desplazaría el punto entero de la serie del backlog.
 */
export function localMonthKey(value: number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}
