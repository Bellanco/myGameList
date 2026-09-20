/**
 * Cuántas veces se puede enviar la papeleta: LAS OPORTUNIDADES.
 *
 * El voto fue inmutable (`allow update: if false`). Luego se pudo corregir mientras la votación siguiera
 * abierta, con un tope igual para todo el mundo. Ahora el tope lo pone LA CUENTA, y se cuenta en
 * **oportunidades**, que es como se dice de cara a quien vota: la primera oportunidad es el envío y cada
 * corrección gasta otra.
 *
 *   sin cuenta social ......  1  (envía y queda como está)
 *   bronce .................  5  (el envío y 4 correcciones)
 *   plata .................. 10
 *   oro .................... 15
 *   mithril ................ 20
 *
 * QUÉ ES «TENER CUENTA SOCIAL»: un perfil con canal (`social.enabled`). La CUENTA LIGERA que se crea al votar
 * —nombre, foto y pseudónimo, sin canal— no lo es, y por eso se queda en una oportunidad aunque exista su
 * documento de perfil. Es la línea que separa a quien participa en la casa de quien pasa a votar y se va.
 *
 * ESTO CAMBIA UNA DECISIÓN ESCRITA (ver `docs/plan-unificar-premios.md` §5.1, decisión 9): el rango ya no
 * desbloquea solo la lámina del trofeo, también el cupo de envíos. Lo que aquella decisión ahorraba era una
 * lectura del perfil en las reglas, y ese es el precio que ahora se paga: **solo en las correcciones**, no en el
 * primer envío —que es el del momento de más carga del año—, porque el envío inicial vale para todos.
 *
 * MANDA EL SERVIDOR: `firestore.rules` exige que el contador entrante sea exactamente el anterior más uno y que
 * no pase del tope que le toca a ese perfil. Este módulo es solo para la interfaz —ofrecer el botón y decir
 * cuántas quedan—, así que la tabla es un PAR DUPLICADO: si cambia aquí, cambia allí, y su test lo ata.
 */
import { DEFAULT_PROFILE_TIER, type ProfileTier } from '../constants/tiers';
import type { PremiosBallot, PremiosVotingConfig } from '../../model/types/premios';
import { isVotingOpenNow } from './votingSchedule';

/** Oportunidades de quien tiene canal social, por rango. Espejo de `firestore.rules`. */
export const PREMIOS_OPPORTUNITIES_BY_TIER: Record<ProfileTier, number> = {
  bronze: 5,
  silver: 10,
  gold: 15,
  mithril: 20,
};

/** Oportunidades de quien vota sin cuenta social: una, la del envío. Espejo de `firestore.rules`. */
export const PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL = 1;

/** Lo que hace falta saber de quien vota para resolver su cupo. Sale de su propio perfil. */
export interface PremiosVoterStanding {
  /** ¿Tiene canal social (`social.enabled`)? La cuenta ligera del voto no cuenta. */
  hasSocialAccount: boolean;
  tier: ProfileTier;
}

/** El caso de quien todavía no tiene perfil, o cuyo perfil no se ha podido leer: el cupo mínimo. */
export const NO_SOCIAL_STANDING: PremiosVoterStanding = {
  hasSocialAccount: false,
  tier: DEFAULT_PROFILE_TIER,
};

/**
 * Oportunidades totales de esta cuenta, el envío incluido.
 *
 * Un rango desconocido cae a bronce (`normalizeTier` ya lo hace al leer el perfil, pero aquí se vuelve a cubrir:
 * degradar es más seguro que promocionar).
 */
export function getOpportunities(standing: PremiosVoterStanding | null | undefined): number {
  if (!standing?.hasSocialAccount) return PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL;
  return PREMIOS_OPPORTUNITIES_BY_TIER[standing.tier] ?? PREMIOS_OPPORTUNITIES_BY_TIER[DEFAULT_PROFILE_TIER];
}

/**
 * Correcciones permitidas DESPUÉS del envío inicial: una oportunidad menos, que es la que gastó al enviar.
 *
 * Es el número que imponen las reglas sobre `editCount`, y por eso existe aparte: con una sola oportunidad el
 * tope de correcciones es 0 y el documento no se puede volver a escribir.
 */
export function getMaxBallotEdits(standing: PremiosVoterStanding | null | undefined): number {
  return getOpportunities(standing) - 1;
}

/**
 * Oportunidades que le quedan.
 *
 * Sin papeleta están todas por gastar. Con papeleta se descuentan el envío y sus correcciones, así que el número
 * vale a la vez como «veces que puedo volver a enviarla».
 *
 * Tolera las papeletas escritas antes de que existiera el contador: sin `editCount` se asume que no ha gastado
 * ninguna corrección, que es lo que de hecho ocurrió.
 */
export function getRemainingOpportunities(
  ballot: PremiosBallot | null | undefined,
  standing: PremiosVoterStanding | null | undefined,
): number {
  const total = getOpportunities(standing);
  if (!ballot) return total;
  const used = typeof ballot.editCount === 'number' ? ballot.editCount : 0;
  return Math.max(0, total - 1 - used);
}

/**
 * ¿Puede rehacer su voto ahora?
 *
 * Hacen falta las dos cosas: que le queden oportunidades y que la votación siga abierta. Fuera de plazo las
 * reglas rechazan también las correcciones, así que ofrecer el botón sería ofrecer un error.
 */
export function canEditBallot(
  ballot: PremiosBallot | null | undefined,
  votingConfig: PremiosVotingConfig | null | undefined,
  standing: PremiosVoterStanding | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!ballot) return false;
  if (getRemainingOpportunities(ballot, standing) <= 0) return false;
  return isVotingOpenNow(votingConfig, now);
}

/**
 * ¿La papeleta que se va a enviar es EXACTAMENTE la que ya está guardada?
 *
 * Mirar lo que uno votó no puede costar una oportunidad. Se entra a la papeleta a repasarla, se llega al final y
 * se pulsa enviar por inercia: sin esto, esa visita gastaba una de las oportunidades igual que una corrección de
 * verdad — y las reglas no pueden distinguirlo, porque para ellas es una escritura como cualquier otra.
 *
 * Se comparan las SELECCIONES (por `optionId`, que es como se guardan) y el NOMBRE con el que sale en la
 * clasificación, que es lo otro que se puede cambiar desde la revisión. Todo lo demás del documento —fechas,
 * contador— lo pone el envío, así que no es lo que hay que comparar.
 */
export function ballotIsUnchanged(
  ballot: PremiosBallot | null | undefined,
  selections: Record<string, string>,
  displayName: string,
): boolean {
  if (!ballot) return false;

  const previas = ballot.selections || {};
  const clavesPrevias = Object.keys(previas);
  const clavesNuevas = Object.keys(selections);
  if (clavesPrevias.length !== clavesNuevas.length) return false;
  if (clavesNuevas.some((categoria) => previas[categoria] !== selections[categoria])) return false;

  return (ballot.userDisplayName || '').trim() === displayName.trim();
}
