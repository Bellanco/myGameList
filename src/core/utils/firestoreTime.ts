/**
 * Un sello de fecha de Firestore en milisegundos: un `Timestamp` (lo que escribe `serverTimestamp()`) o un número,
 * que es como lo guardaban los clientes antiguos. 0 si no hay o no es válido. Sin dependencias de Firebase: basta con
 * que el valor sepa dar `toMillis()`.
 *
 * Una sola copia: estaba escrita igual en el directorio social y en el panel de administración.
 */
export function toMillis(value: { toMillis?: () => number } | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const millis = value?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
}
