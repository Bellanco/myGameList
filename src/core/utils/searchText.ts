// TEXTO PARA BUSCAR: lo que comparan la caja de cada lista y el buscador general (docs/plan-notificaciones-y-buscador.md).
//
// Sin acentos ni mayúsculas («pokemon» encuentra «Pokémon»), sin apóstrofes («marvels» encuentra «Marvel's») y con
// cualquier signo como separación. No es `gameTitleKey`: aquella además quita sufijos de edición y convierte romanos,
// y aquí buscar «remastered» o «ii» tiene que encontrar el juego que lo lleva en el título.
//
// VIAJA EN EL ARRANQUE (la usa `filterGames`): por eso tan corta.

/** El texto listo para comparar. */
export function normalizeSearchText(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * ¿Contiene `name` lo buscado? `query` ya normalizada. También sin espacios, para que «spiderman» encuentre
 * «Spider-Man» y «spider man» encuentre «Spiderman», pero solo desde el principio de una palabra: «ewi» no encuentra
 * «The Witcher» saltándose el hueco entre «the» y «witcher».
 */
export function matchesSearch(name: string, query: string): boolean {
  if (!query) return true;
  const text = normalizeSearchText(name);
  if (text.includes(query)) return true;
  const joined = query.replace(/ /g, '');
  const words = text.split(' ');
  return words.some((_, i) => words.slice(i).join('').startsWith(joined));
}
