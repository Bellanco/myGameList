/**
 * Cotas del canal de la porra que viven a la vez en el cliente y en `firestore.rules`.
 *
 * Son PARES DUPLICADOS, como `PUBLIC_NAME_MAX_LENGTH`: cambiar uno obliga a cambiar el otro, y los tests de
 * reglas los atan para que no puedan divergir en silencio.
 */
import { CHOSEN_NAME_MAX_LENGTH, PUBLIC_NAME_MAX_LENGTH } from '../security/sanitize';

/**
 * Longitud máxima del nombre que alguien elige mostrar en la clasificación.
 *
 * Es el mismo tope que exigen las reglas al validar la papeleta, y el mismo que el del nick del perfil
 * (`CHOSEN_NAME_MAX_LENGTH`): el nombre de la papeleta se guarda en el perfil y el del perfil se copia a la
 * papeleta, así que no pueden diferir.
 */
export const BALLOT_NAME_MAX_LENGTH = CHOSEN_NAME_MAX_LENGTH;

/**
 * Longitud máxima del nombre de la cuenta de Google que guarda la papeleta (`userNickname`). No lo elige nadie ni
 * se enseña en público —es para identificar al votante desde el panel—, así que si no cabe se corta, igual que el
 * mismo nombre cuando cae en el perfil (`PUBLIC_NAME_MAX_LENGTH`).
 */
export const BALLOT_NICKNAME_MAX_LENGTH = PUBLIC_NAME_MAX_LENGTH;
