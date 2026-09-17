/**
 * Normaliza el nombre de un juego para compararlo.
 *
 * VIVÍA EN `core/roulette/roulette`, y no por ninguna razón: sortear un juego y comparar dos títulos no tienen
 * nada que ver. La consecuencia era que el listado, la bandeja de importados y el espacio social importaban «de
 * la ruleta» para una comparación de textos, y con ella se arrastraba el módulo entero —el pool, las
 * ponderaciones, la curva de la nota— al chunk de arranque de todo el mundo, aunque el modal de la ruleta sea
 * perezoso y aunque nadie llegue a abrirlo.
 *
 * Los IDs son locales de cada biblioteca y no comparables entre usuarios, así que el nombre normalizado es lo
 * único que permite saber si dos personas hablan del mismo juego.
 */
export function normalizeName(name: string): string {
  return String(name || '').trim().toLowerCase();
}
