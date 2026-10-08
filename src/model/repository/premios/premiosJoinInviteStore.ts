// La invitación al resto de la aplicación (al enviar la papeleta y en el histórico): en qué edición se contestó ya,
// en ESTE navegador (ver `PREMIOS_JOIN_INVITE_KEY`). Una sola respuesta para los dos sitios. Una preferencia de
// vista: si se pierde, la invitación se ofrece una vez más.
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
    // Sin almacenamiento se volverá a ofrecer en la próxima visita: es lo más que puede pasar.
  }
}
