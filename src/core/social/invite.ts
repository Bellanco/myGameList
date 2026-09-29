/**
 * ¿A QUIÉN SE LE OFRECE «INVITA A UN AMIGO» EN LA PANTALLA DE AMIGOS?
 *
 * A quien todavía tiene POCOS amigos en la aplicación: es quien más gana trayendo a alguien, y a quien ya tiene
 * su grupo dentro la tarjeta solo le ocupa sitio encima de la lista que viene a mirar. La regla vive aquí, en un
 * solo sitio y probada, para que cambiar el umbral no obligue a tocar la pantalla.
 */

/** Con este número de amigos o más, la tarjeta ya no se ofrece. */
export const INVITE_UNTIL_FRIENDS = 3;

/**
 * ⚠️ TEMPORAL (29-09-2026): a la vista de TODO EL MUNDO para revisar cómo queda, también con el grupo entero ya
 * añadido. Cuando se dé el visto bueno, se revierte este commit y vuelve la regla de arriba.
 */
const INVITE_FOR_EVERYONE_WHILE_REVIEWING = true;

export function shouldOfferInvite(friendCount: number): boolean {
  return INVITE_FOR_EVERYONE_WHILE_REVIEWING || friendCount < INVITE_UNTIL_FRIENDS;
}
