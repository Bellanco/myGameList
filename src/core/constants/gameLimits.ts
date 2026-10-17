// TOPES DEL FORMULARIO DE JUEGO (añadir y editar). Elegidos por el usuario el 15-10-2026 con su biblioteca delante:
// holgados para lo que hay (el nombre más largo tenía 49 caracteres, el género 26, el punto 24; la lista más larga, 5
// puntos fuertes) y cortos para que nada se vaya de madre ni desborde una fila del formulario o una pastilla.
//
// SOLO FRENAN LO QUE SE ESCRIBE. Ni la sincronización ni la importación de Playnite recortan nada (el esquema del
// gist no lleva topes a propósito: ver `gamesGistSchema.ts`), y un juego que ya pase de un tope se abre tal cual: lo
// que no deja es alargarlo más.

/** Las listas de etiquetas de texto de un juego. */
export type GameTagListKey = 'platforms' | 'genres' | 'strengths' | 'weaknesses' | 'reasons';

export const GAME_LIMITS = {
  /** Caracteres del nombre. */
  name: 80,
  /** Caracteres del análisis (antes 25.000; el más largo de la biblioteca tenía 2.381). */
  review: 22_500,
  /**
   * Caracteres MÍNIMOS de un análisis que se escribe (sin contar los espacios de los extremos), para que no sea una
   * frase suelta. Elegido por el usuario el 15-10-2026: lo cumplían 95 de las 98 reseñas de su biblioteca (bajó de
   * 250 a 200 para dejar algo de margen). Vacío sigue valiendo (el análisis es opcional), y uno más corto de antes se
   * conserva mientras no se cambie su texto.
   */
  reviewMin: 200,
  /** Horas jugadas, como mucho. */
  hoursMax: 9_999,
  /** Decimales de las horas («12,25»). */
  hoursDecimals: 2,
  /** El primer año que se admite como año completado: el de los primeros juegos comerciales. */
  firstYear: 1970,
  /** Caracteres de cada etiqueta. */
  tagLength: {
    platforms: 30,
    genres: 40,
    strengths: 50,
    weaknesses: 50,
    reasons: 50,
  } satisfies Record<GameTagListKey, number>,
  /** Cuántas etiquetas por juego en cada lista. */
  tagCount: {
    platforms: 6,
    genres: 5,
    strengths: 10,
    weaknesses: 10,
    reasons: 10,
    years: 20,
  } satisfies Record<GameTagListKey | 'years', number>,
} as const;
