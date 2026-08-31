import { tagKey } from './tags';

export function sortEs(a: string | number, b: string | number): number {
  return String(a).localeCompare(String(b), 'es');
}

/**
 * Quita equivalentes conservando la primera grafía. La comparación es la de `tagKey`: además de las mayúsculas,
 * ignora las tildes, así que "Acción" y "accion" ya no conviven como dos etiquetas distintas.
 */
export function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = tagKey(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  return result;
}
