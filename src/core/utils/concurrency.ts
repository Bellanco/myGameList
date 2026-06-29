// Utilidad pura de control de concurrencia. GitHub aplica "secondary rate limits" a ráfagas de peticiones
// concurrentes (separados del límite por hora): disparar decenas de GET a la vez puede provocar 403 temporales.
// `mapWithConcurrency` ejecuta `mapper` sobre `items` con un número máximo de tareas en vuelo, preservando el
// ORDEN del resultado (results[i] ↔ items[i]). No atrapa errores: si `mapper` rechaza, la llamada rechaza —
// los llamadores que quieran tolerancia deben manejar el error DENTRO del mapper (como hace el feed social).
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
