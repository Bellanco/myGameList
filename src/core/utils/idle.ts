/**
 * Ejecuta trabajo NO crítico cuando el navegador esté ocioso, con `setTimeout(0)` de reserva donde
 * `requestIdleCallback` no exista (Safari < 17). Devuelve una función para cancelar si el trabajo deja de
 * hacer falta (p. ej. el componente se desmonta antes de que llegue el turno).
 *
 * Existe para que "después del primer pintado" sea una sola decisión y no una copia del mismo `typeof
 * requestIdleCallback === 'function' ? … : setTimeout(…)` en cada sitio que lo necesita.
 */
export function runWhenIdle(task: () => void): () => void {
  const scope = globalThis as unknown as {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof scope.requestIdleCallback === 'function') {
    const handle = scope.requestIdleCallback(task);
    return () => scope.cancelIdleCallback?.(handle);
  }

  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}
