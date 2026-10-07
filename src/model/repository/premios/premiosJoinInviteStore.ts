// La invitación a quedarse que sale al enviar la papeleta: en qué edición se contestó ya, en ESTE navegador (ver
// `PREMIOS_JOIN_INVITE_KEY`). Una preferencia de vista: si se pierde, la invitación se ofrece una vez más.
import { PREMIOS_JOIN_INVITE_KEY } from '../../../core/constants/storageKeys';

/** La edición cuya invitación ya se contestó. Sin almacenamiento, ninguna. */
export function readJoinInviteAnswer(): string {
  try {
    return localStorage.getItem(PREMIOS_JOIN_INVITE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveJoinInviteAnswer(seasonId: string): void {
  try {
    localStorage.setItem(PREMIOS_JOIN_INVITE_KEY, seasonId);
  } catch {
    // Sin almacenamiento se volverá a ofrecer en la próxima papeleta: es lo más que puede pasar.
  }
}
