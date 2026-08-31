import { normalizeTag } from '../security/sanitize';

/**
 * Separadores admitidos al teclear o pegar etiquetas: coma, punto y coma, tabulador y salto de línea. La barra
 * (`/`) se queda FUERA a propósito: hay etiquetas legítimas que la usan ("Acción/Aventura", "Hack'n'slash / RPG").
 */
export const TAG_SEPARATOR = /[,;\t\r\n]/;

/** Trocea lo escrito o pegado en etiquetas sueltas, ya recortadas y sin dobles espacios. Descarta las vacías. */
export function splitTagInput(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,;\t\r\n]+/)
    .map((value) => normalizeTag(value))
    .filter(Boolean);
}

/**
 * Clave con la que se comparan dos etiquetas: minúsculas, sin tildes y con los espacios colapsados. Así "Acción",
 * "accion" y "ACCIÓN" son la MISMA etiqueta y no se duplican en las listas ni en los filtros.
 *
 * La eñe y la cedilla se conservan: `NFD` las descompone igual que a una vocal acentuada, y quitarles la marca
 * convertiría "años" en "anos" o "Français" en "Francais", que son palabras distintas —no variantes de escritura—.
 */
export function tagKey(value: string | number): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/n\u0303/g, '\u00f1')
    .replace(/c\u0327/g, '\u00e7')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` si la lista ya contiene una etiqueta equivalente (misma clave), aunque se escriba de otra forma. */
export function hasTag(values: Array<string | number>, value: string): boolean {
  const key = tagKey(value);
  return values.some((entry) => tagKey(entry) === key);
}

/**
 * Grafía CANÓNICA de una etiqueta: si en las listas ya existe una equivalente, gana la que ya está guardada (se
 * escriba "accion", se guarda "Acción"). Si no hay ninguna, se respeta tal cual se escribió.
 */
export function canonicalTag(value: string, ...pools: Array<Array<string | number>>): string {
  const key = tagKey(value);
  for (const pool of pools) {
    const found = pool.find((entry) => tagKey(entry) === key);
    if (found !== undefined) return String(found);
  }
  return value;
}

/**
 * Añade etiquetas a una lista sin duplicar equivalentes y adoptando la grafía ya usada en la biblioteca
 * (`lookup`). PURA: devuelve una lista nueva. Es el commit que comparten el Enter, el pegado con comas y el
 * guardado del formulario, para que los tres se comporten igual.
 */
export function mergeTags(current: string[], additions: string[], lookup: Array<string | number> = []): string[] {
  const next = [...current];
  for (const raw of additions) {
    const clean = normalizeTag(raw);
    if (!clean || hasTag(next, clean)) continue;
    next.push(canonicalTag(clean, lookup));
  }
  return next;
}
