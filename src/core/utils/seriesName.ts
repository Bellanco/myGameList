// Saga de un juego a partir de su nombre. Vivía en `core/roulette/roulette`, pero la usan también las estadísticas
// (el parentesco de los deseos), y desde allí se habrían llevado la ruleta entera a su chunk.

const ROMAN: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

/**
 * Descompone un nombre en (base de la saga, ordinal). El ordinal se detecta como número arábigo de 1–3 dígitos
 * (evita años como "2077"), número romano, o número antes de un subtítulo tras ":". Sin número → ordinal 1
 * (la primera entrega). Los números en medio del nombre ("Left 4 Dead") no cuentan.
 */
export function parseSeries(name: string): { base: string; ordinal: number } {
  const main = String(name || '').trim().split(':')[0].trim();
  const tokens = main.split(/\s+/);
  const last = (tokens[tokens.length - 1] || '').toLowerCase().replace(/[.,]$/, '');

  let ordinal = 1;
  let baseTokens = tokens;
  if (/^\d{1,3}$/.test(last)) {
    ordinal = Number(last);
    baseTokens = tokens.slice(0, -1);
  } else if (ROMAN[last] !== undefined) {
    ordinal = ROMAN[last];
    baseTokens = tokens.slice(0, -1);
  }

  const base = baseTokens.join(' ').trim().toLowerCase();
  // Si al quitar el ordinal no queda base (el número/romano era todo el nombre), trátalo como primera entrega.
  if (!base) return { base: main.toLowerCase(), ordinal: 1 };
  return { base, ordinal };
}
