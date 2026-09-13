// Reparto de la RAMPA CATEGÓRICA (`--cat-1`…`--cat-7`, CAPA 2b de `src/styles/_base.scss`).
//
// El problema que resuelve: hasta ahora todo lo que no era semántico —el género de un juego, la serie de una
// gráfica— se pintaba con el acento del tema, así que «RPG» y «Terror» eran el mismo color y la interfaz se leía
// monócroma. Aquí se decide QUÉ TONO le toca a cada nombre; el color concreto lo pone el tema en CSS, de modo
// que el mismo género cambia de piel con el tema sin dejar de ser reconocible dentro de él.
//
// REGLAS DE LA CASA:
//   · Estable: el mismo nombre da siempre el mismo tono, en esta y en la próxima sesión. Nada de `Math.random`
//     ni de índices por posición en la lista (el color cambiaría al filtrar, que es justo cuando más molesta).
//   · Insensible a mayúsculas y acentos: «RPG», «rpg» y «Acción»/«Accion» no pueden repartirse distinto.
//   · Sin tabla de géneros: la lista de géneros la escribe el usuario y crece sola, así que un mapa fijo se
//     quedaría corto el día que alguien escriba «Soulslike». El hash reparte lo que venga.
//
// AMPLIAR LA RAMPA: sube `CATEGORY_TONES` y añade `--cat-8`(-fg) a los doce bloques de `_base.scss`. Ningún
// componente sabe qué color le toca a qué nombre, así que no hay nada más que tocar.

/** Cuántos tonos tiene la rampa. Debe coincidir con los `--cat-N` declarados en `_base.scss`. */
export const CATEGORY_TONES = 7;

/** Quita acentos y mayúsculas para que «Acción» y «accion» caigan en el mismo tono. */
function normaliza(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Tono (1…`CATEGORY_TONES`) que le corresponde a un nombre de categoría.
 *
 * Hash FNV-1a de 32 bits: cabe en cuatro líneas, no tiene dependencias y reparte bien nombres cortos y
 * parecidos —que es justo lo que hay aquí: «RPG», «ARPG», «JRPG»—. Se fuerza a entero sin signo con `>>> 0`
 * porque en JavaScript el desplazamiento devuelve un entero con signo y un hash negativo daría un índice
 * negativo.
 */
export function categoryTone(nombre: string): number {
  const texto = normaliza(nombre);
  if (!texto) return 1;
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % CATEGORY_TONES) + 1;
}

/**
 * Las dos fichas que necesita una pieza teñida por categoría: `--cat` para el relleno y `--cat-fg` para el
 * texto. Van juntas a propósito — usar el relleno como color de texto es justo el fallo de contraste que la
 * rampa evita (ver el comentario de CAPA 2b).
 *
 * Se devuelve como `Record<string, string>` y no como `CSSProperties` porque el tipo de React no admite
 * propiedades personalizadas; el consumidor lo pasa tal cual al `style`.
 */
export function categoryToneStyle(nombre: string): Record<string, string> {
  const tono = categoryTone(nombre);
  return { '--cat': `var(--cat-${tono})`, '--cat-fg': `var(--cat-${tono}-fg)` };
}
