/**
 * Cotas del canal de la porra que viven a la vez en el cliente y en `firestore.rules`.
 *
 * Son PARES DUPLICADOS, como `PUBLIC_NAME_MAX_LENGTH`: cambiar uno obliga a cambiar el otro, y los tests de
 * reglas los atan para que no puedan divergir en silencio.
 */

/**
 * Longitud máxima del nombre que alguien elige mostrar en la clasificación.
 *
 * Es el mismo tope que exigen las reglas al validar la papeleta. Cincuenta caracteres dan de sobra para un nombre
 * y evitan que la clasificación se convierta en un tablón.
 */
export const BALLOT_NAME_MAX_LENGTH = 50;
