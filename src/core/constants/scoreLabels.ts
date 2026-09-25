/**
 * Cómo se anuncia una nota: el aro (0–100), las estrellas (0–5) y el juego sin puntuar.
 *
 * APARTE DE `labels.ts`, y no por tema: el aro y las estrellas se pintan en el listado y también en pantallas
 * perezosas (hub social, ruleta), y si importaran `labels.ts` el empaquetador lo sacaba ENTERO del chunk de entrada
 * a uno propio, que pierde la compresión compartida. Medido contra el build anterior (JS del arranque, gzip): así
 * +677 B —este módulo forma un chunk pequeño con `useScoreScale`—; con los textos en `labels.ts`, +767 B.
 */
export const SCORE_UI = {
  dialAria: 'Nota del juego (0 a 100)',
  gradeAria: (grade: number) => `Nota ${grade} de 100`,
  starsAria: (stars: number) => `${stars} de 5 estrellas`,
  starsOfAria: (stars: number, max: number) => `Puntuación ${stars} de ${max}`,
  unscored: 'Sin puntuar',
  // El medallón de «sin nota» dice una pregunta, con su signo de apertura.
  noScoreSymbol: '¿?',
} as const;
