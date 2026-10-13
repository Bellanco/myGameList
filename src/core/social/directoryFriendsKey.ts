// LEER LA HUELLA DE AMISTADES de la copia del directorio social (la escribe `socialDirectoryFriendsKey`, en
// `viewmodel/social/useSocialDirectory.ts`): `profileIdPropio|uid:gistSocial:gistJuegos:sello|…`.
//
// Sirve a quien quiere saber quiénes son tus amistades sin cargar Firebase, como el buscador general
// (docs/plan-notificaciones-y-buscador.md): la copia del directorio lleva también a gente que no es amistad, y esta
// huella es lo único guardado que dice quién sí. `tests/unit/directoryFriendsKey.test.ts` comprueba la ida y vuelta
// con el escritor, así que un cambio de formato allí rompe el test en vez de vaciar el buscador en silencio.

/** Los uid de las amistades de la huella, o `null` si no hay huella (copias guardadas antes de existir). */
export function friendUidsFromDirectoryKey(key: string | undefined): Set<string> | null {
  if (key === undefined) return null;
  const [, ...edges] = key.split('|');
  return new Set(edges.map((edge) => edge.split(':')[0]).filter(Boolean));
}
