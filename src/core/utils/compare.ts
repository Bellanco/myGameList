import { APP_LOCALE } from '../constants/locale';
import { tagKey } from './tags';

/** Orden alfabético de textos visibles (etiquetas, nombres de juego), con las reglas del idioma de la app. */
export function compareText(a: string | number, b: string | number): number {
  return String(a).localeCompare(String(b), APP_LOCALE);
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
