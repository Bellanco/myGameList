/**
 * EL NOMBRE QUE EMPAREJA la tarjeta de una reseña en una lista con la del detalle (`ReviewScreen`, `morphName`):
 * con el mismo nombre a los dos lados, la View Transition hace crecer una hasta la otra al abrirla y la devuelve a
 * su sitio al volver (`::view-transition-group(.resena)`, `_motion.scss`).
 *
 * Quien lo usa elige la clave, y tiene que ser la misma a los dos lados y única en la pantalla (dos elementos con
 * el mismo nombre abortan la transición entera):
 *   · la lista de reseñas de un perfil o las tuyas (`ProfileReviewsList` → `SocialProfileReviewScreen`): el id del
 *     juego, que no se repite dentro de un perfil;
 *   · el feed (`SocialFeedScreen` → `SocialDetailScreen`): perfil y juego, porque ahí se mezclan personas.
 *
 * Un nombre de transición es un identificador de CSS, así que lo que no sea letra, cifra, guion o subrayado se
 * cambia por un guion.
 */
export function nombreDeResena(clave: string | number): string {
  return `resena-${String(clave).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
