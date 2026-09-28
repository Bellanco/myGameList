// LA FOTO QUE SE PROPAGA A UNA AMISTAD desde el panel de administración.
//
// Vive en el núcleo porque la usan dos sitios que tienen que decir lo mismo: la moderación, que la escribe, y la
// ficha del censo, que decide con ella si la foto está rancia.

/**
 * La foto que el panel dejaría en el lado de una amistad al propagar la identidad de su dueño.
 *
 * PRIVACIDAD: nunca AÑADE una foto donde la amistad no tiene ninguna. El interruptor de verdad (`showPhoto`) vive en
 * el gist, que el panel no lee, y una amistad sin foto con el perfil publicando una es justo lo que deja quien la
 * ocultó y luego publicó con un cliente anterior al arreglo (el perfil caía a la foto de Google sin filtrar). Propagar
 * ahí le enseñaba la cara a todas sus amistades. Sustituir una foto por otra (cambió la de Google) o retirarla sí es
 * seguro. Si esa persona la quiere visible, su propio cliente la publica al abrir el espacio social.
 *
 * El censo usa la MISMA regla para decidir si la foto está rancia: si no, el panel pediría propagar algo que esta
 * función se niega a escribir, y el aviso no se iría nunca.
 */
export function healedFriendPhoto(current: string, profilePhoto: string): string {
  return current ? profilePhoto : '';
}
