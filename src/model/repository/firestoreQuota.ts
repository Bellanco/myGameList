// CUOTA DIARIA DE FIRESTORE AGOTADA (docs/plan-degradacion-servicios.md, fase 2).
//
// En el plan gratuito, pasadas 50.000 lecturas (o 20.000 escrituras) Firestore contesta `resource-exhausted` hasta
// la medianoche del Pacífico. Seguir preguntando no sirve de nada: cada lectura condenada es una espera más antes
// de caer a la copia guardada. Las lecturas del espacio social anotan aquí la primera que ven, y hasta el reinicio
// van directas a lo guardado sin tocar la red.
//
// Solo en memoria y por pestaña, a propósito: si el cálculo de la hora se equivocara, recargar lo arregla.

let exhaustedUntil = 0;

/** ¿Es el error de cuota agotada de Firestore? */
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: unknown }).code || '').replace(/^firestore\//, '');
  return code === 'resource-exhausted';
}

/**
 * Milisegundos hasta la próxima medianoche en `America/Los_Angeles`, que es cuando Firestore reinicia el cupo
 * diario. Con el horario de verano incluido, porque lo calcula `Intl`.
 */
export function msUntilPacificMidnight(now: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const elapsed = ((read('hour') * 60 + read('minute')) * 60 + read('second')) * 1000 + (now % 1000);
  return Math.max(60_000, 24 * 3_600_000 - elapsed);
}

/** Anota el error si es de cuota. Devuelve si lo era, para que el llamador decida igual que sin anotar. */
export function noteFirestoreError(error: unknown): boolean {
  if (!isFirestoreQuotaError(error)) return false;
  exhaustedUntil = Math.max(exhaustedUntil, Date.now() + msUntilPacificMidnight());
  return true;
}

/** ¿Se sabe que la cuota está agotada? Entonces se sirve lo guardado sin preguntar. */
export function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < exhaustedUntil;
}

/** El error que se lanza en lugar de preguntar: el mismo código que el de verdad, para que todo lo trate igual. */
export function firestoreQuotaError(): Error {
  return Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' });
}

/** Solo para las pruebas. */
export function resetFirestoreQuotaForTests(): void {
  exhaustedUntil = 0;
}
