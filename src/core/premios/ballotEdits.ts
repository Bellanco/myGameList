/**
 * Cuántas veces se puede rehacer el voto.
 *
 * El voto fue inmutable (`allow update: if false`). Ahora se puede corregir mientras la votación siga abierta,
 * pero con tope: cada corrección es una escritura y una lectura más, y sin límite una sola persona podría
 * reescribir su papeleta indefinidamente.
 *
 * EL TOPE ES EL MISMO PARA TODO EL MUNDO, y eso es una decisión (ver `docs/plan-unificar-premios.md` §5.1): el
 * rango de la cuenta afecta a la calidad de la lámina del trofeo, no a las oportunidades de acertar. La ventaja
 * práctica es que las reglas NO tienen que leer el perfil de quien vota en el momento de más carga del año.
 *
 * MANDA EL SERVIDOR: `firestore.rules` exige que el contador entrante sea exactamente el anterior más uno y que
 * no pase de aquí. Este módulo es solo para la interfaz —ofrecer el botón y decir cuántas quedan—, así que el
 * número es un PAR DUPLICADO: si cambia aquí, cambia allí, y su test lo ata.
 */
import type { PremiosBallot, PremiosVotingConfig } from '../../model/types/premios';
import { isVotingOpenNow } from './votingSchedule';

/** Correcciones permitidas DESPUÉS del envío inicial. Espejo de `firestore.rules`. */
export const MAX_BALLOT_EDITS = 5;

/**
 * Correcciones que le quedan a una papeleta.
 *
 * Tolera las papeletas escritas antes de que existiera el contador: sin `editCount` se asume que no ha gastado
 * ninguna, que es lo que de hecho ocurrió.
 */
export function getRemainingEdits(ballot: PremiosBallot | null | undefined): number {
  if (!ballot) return MAX_BALLOT_EDITS;
  const used = typeof ballot.editCount === 'number' ? ballot.editCount : 0;
  return Math.max(0, MAX_BALLOT_EDITS - used);
}

/**
 * ¿Puede rehacer su voto ahora?
 *
 * Hacen falta las dos cosas: que le queden correcciones y que la votación siga abierta. Fuera de plazo las reglas
 * rechazan también las correcciones, así que ofrecer el botón sería ofrecer un error.
 */
export function canEditBallot(
  ballot: PremiosBallot | null | undefined,
  votingConfig: PremiosVotingConfig | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!ballot) return false;
  if (getRemainingEdits(ballot) <= 0) return false;
  return isVotingOpenNow(votingConfig, now);
}
