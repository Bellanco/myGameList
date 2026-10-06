/**
 * Cotas del canal de la porra que viven a la vez en el cliente y en `firestore.rules`.
 *
 * Son PARES DUPLICADOS, como `PUBLIC_NAME_MAX_LENGTH`: cambiar uno obliga a cambiar el otro, y los tests de
 * reglas los atan para que no puedan divergir en silencio.
 */
import { PUBLIC_NAME_MAX_LENGTH } from '../security/sanitize';

/**
 * Longitud máxima del nombre que alguien elige mostrar en la clasificación.
 *
 * Es el mismo tope que exigen las reglas al validar la papeleta, y el mismo que el del nombre del perfil: el de la
 * papeleta se guarda en la cuenta ligera, y el de un perfil social se copia a la papeleta.
 */
export const BALLOT_NAME_MAX_LENGTH = PUBLIC_NAME_MAX_LENGTH;
