/**
 * Los trofeos del podio: qué le toca a cada puesto.
 *
 * Al publicar una edición, los cinco primeros PUESTOS reciben un título con su nombre. Aquí está el dónde y el
 * cómo se escribe encima; el dibujo es `awardCanvas`.
 *
 * EL PUESTO NO ES LA POSICIÓN EN LA LISTA. Un empate cuenta como un solo puesto: dos primeros reciben los dos el
 * título de primero y quien les sigue es SEGUNDO, no tercero (ver `assignDenseRanks`). Por eso puede haber más de
 * cinco premiados y nunca más de cinco títulos distintos.
 *
 * DOS TROFEOS, Y NO ES CAPRICHO (decisión del 20-09-2026, ver `docs/plan-unificar-premios.md` §5):
 *
 *  - **La lámina**, que es la de siempre: un cartel ilustrado, con su propia tipografía. Lleva arte de terceros,
 *    así que se sirve SOLO a quien tiene sesión iniciada — nunca desde la página pública de resultados, donde
 *    chocaría con la regla de no publicar arte ajeno que ya rige para las reseñas compartidas.
 *  - **La medalla**, tipográfica y con los tokens del tema, que es la que sí sale en público. Se construye con la
 *    receta de `docs/logros/receta-medalla.md` y llega con la interfaz (F3).
 *
 * ⚠️ PENDIENTE al regenerar el arte: las láminas llevan impreso «Ganador Game Awards», que es el nombre de un
 * certamen real. El evento se llama «El reto del jugador» (decisión del 20-09-2026), así que hay que rerotularlas
 * desde los ficheros fuente. No bloquea nada mientras el arte sea privado.
 */

/** Puestos con premio: hay una lámina por cada uno y ni una más. */
export const MAX_AWARD_RANK = 5;

/** La zona donde cabe el nombre, en fracciones del ancho y del alto de la lámina. */
export interface AwardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Award {
  rank: number;
  image: string;
  color: string;
  box: AwardBox;
}

/**
 * Configuración de cada lámina.
 *
 * `box` va en FRACCIONES y no en píxeles porque las cinco no miden lo mismo. Está medida sobre el arte real —el
 * hueco que dejan la ola, los logos y el título impreso—, así que **si se retoca una lámina hay que volver a
 * medir su caja** o el nombre se montará encima del dibujo.
 *
 * `color` es el tono del título impreso en esa lámina, muestreado de ella: es lo que hace que el nombre parezca
 * parte del cartel y no un añadido.
 */
export const AWARDS: readonly Award[] = [
  { rank: 1, image: '/awards/rank-1.jpg', color: '#e8cd7e', box: { x: 0.13, y: 0.16, w: 0.61, h: 0.21 } },
  { rank: 2, image: '/awards/rank-2.jpg', color: '#dbdbdd', box: { x: 0.35, y: 0.17, w: 0.5, h: 0.27 } },
  { rank: 3, image: '/awards/rank-3.jpg', color: '#ffbc8b', box: { x: 0.3, y: 0.16, w: 0.65, h: 0.17 } },
  { rank: 4, image: '/awards/rank-4.jpg', color: '#a2aef6', box: { x: 0.03, y: 0.17, w: 0.69, h: 0.2 } },
  { rank: 5, image: '/awards/rank-5.jpg', color: '#fa5b52', box: { x: 0.06, y: 0.21, w: 0.6, h: 0.18 } },
];

/** Lámina de un puesto, o `null` si ese puesto no se lleva título. */
export function getAward(rank: number): Award | null {
  return AWARDS.find((award) => award.rank === rank) || null;
}

/** ¿Este puesto se lleva título? */
export function hasAward(rank: number): boolean {
  return Number.isInteger(rank) && rank >= 1 && rank <= MAX_AWARD_RANK;
}
