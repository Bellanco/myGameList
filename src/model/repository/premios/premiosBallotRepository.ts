/**
 * Las papeletas: enviar el voto y recuperar el propio.
 *
 * EL UID ES EL ID DEL DOCUMENTO, y eso es lo que garantiza un voto por persona. Corregir el voto reescribe el
 * MISMO documento; nunca se crea otro. `editCount` lleva la cuenta —0 en el envío inicial, +1 por corrección— y
 * las reglas exigen que avance de uno en uno sin pasar del tope (ver `core/premios/ballotEdits`).
 *
 * DOS COSAS QUE NO SE GUARDAN, y las dos por decisión de esta casa (20-09-2026):
 *
 *  - **El correo.** La aplicación de origen lo escribía en cada papeleta. Aquí los correos se purgaron de
 *    Firestore y las reglas los prohíben en el perfil, así que reintroducirlos por esta puerta sería deshacer esa
 *    limpieza. El panel identifica a cualquiera por su uid, su pseudónimo y el nombre que eligió.
 *  - **La foto.** No viaja en la papeleta ni en el archivo publicado: la cara se resuelve al pintar, con la
 *    reciprocidad del hub, que es dinámica. Ver `docs/plan-unificar-premios.md` §4.1.
 *
 * El esquema que se escribe aquí lo valida también el servidor. Si cambia un campo, cambian las reglas.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { safeTrim } from '../../../core/security/sanitize';
import { BALLOT_NAME_MAX_LENGTH } from '../../../core/premios/limits';
import type { PremiosBallot, PremiosOption } from '../../types/premios';
import { BALLOTS_COLLECTION, requireServices } from './premiosShared';

/** Lo que hace falta saber de quien vota para construir su papeleta. */
export interface BallotAuthor {
  uid: string;
  /** Nombre de su cuenta de Google. No lo elige la persona. */
  displayName?: string | null;
  /** Pseudónimo público de su perfil; vacío si todavía no tiene ninguno. */
  profileId?: string;
}

export interface BuildBallotParams {
  author: BallotAuthor;
  /** Lo elegido en cada categoría, tal y como lo lleva el flujo de votación. */
  userVotes: Record<string, PremiosOption>;
  /** El nombre que la persona quiere que se vea en la clasificación. */
  displayName: string;
  season: number;
  /** La papeleta anterior, si se está corrigiendo. */
  existingBallot?: PremiosBallot | null;
}

/**
 * Construye el documento de la papeleta.
 *
 * Los votos se guardan por **`optionId`**, nunca por nombre: así son independientes del idioma y sobreviven a que
 * se corrija el texto de un nominado.
 *
 * Es una función PURA y se exporta aparte para poder probarla sin tocar Firestore.
 */
export function buildBallot({
  author,
  userVotes,
  displayName,
  season,
  existingBallot = null,
}: BuildBallotParams): PremiosBallot {
  const selections: Record<string, string> = {};
  Object.entries(userVotes || {}).forEach(([categoryId, vote]) => {
    if (vote?.id) selections[categoryId] = vote.id;
  });

  const now = new Date().toISOString();
  const elegido = safeTrim(displayName, BALLOT_NAME_MAX_LENGTH);

  return {
    userId: author.uid,
    // El nombre de la cuenta se lee del autor y NUNCA del estado de la pantalla, para que no pueda llegar vacío;
    // si la cuenta no tiene ninguno, se usa el elegido.
    userNickname: safeTrim(author.displayName, BALLOT_NAME_MAX_LENGTH) || elegido,
    userDisplayName: elegido,
    ...(author.profileId ? { profileId: author.profileId } : {}),
    selections,
    season: Math.trunc(season), // las reglas lo exigen entero
    // `submittedAt` es la fecha del PRIMER envío y no se reescribe al corregir (las reglas rechazan el cambio);
    // `updatedAt` es la de esta escritura.
    submittedAt: existingBallot?.submittedAt || now,
    updatedAt: now,
    // Las papeletas anteriores al contador cuentan como cero correcciones gastadas.
    editCount: existingBallot ? (existingBallot.editCount || 0) + 1 : 0,
    isActive: true,
  };
}

export interface SubmitBallotResult {
  selectionCount: number;
  editCount: number;
  ballot: PremiosBallot;
}

/**
 * Guarda el voto. Sirve para el envío inicial y para las correcciones: se escribe siempre el mismo documento, y
 * son las reglas las que distinguen una cosa de la otra y las que cuentan las correcciones.
 */
export async function submitBallot(params: BuildBallotParams): Promise<SubmitBallotResult> {
  const { firestore } = await requireServices();
  const ballot = buildBallot(params);
  await setDoc(doc(firestore, BALLOTS_COLLECTION, params.author.uid), ballot);
  return {
    selectionCount: Object.keys(ballot.selections).length,
    editCount: ballot.editCount || 0,
    ballot,
  };
}

/**
 * La papeleta ya registrada de esta cuenta, o `null` si todavía no ha votado.
 *
 * Es UNA sola lectura por sesión y de ella sale todo: si ya votó, sus selecciones para poder corregirlas y
 * cuántas correcciones le quedan.
 *
 * ANTE UN ERROR DEVUELVE `null`, y es deliberado: no se bloquea a nadie por un fallo de red. Quien ya hubiera
 * votado será rechazado igualmente por las reglas, que es donde se cumple de verdad lo de un voto por persona.
 */
export async function fetchUserBallot(uid: string): Promise<PremiosBallot | null> {
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDoc(doc(firestore, BALLOTS_COLLECTION, uid));
    return snapshot.exists() ? ({ ...snapshot.data() } as PremiosBallot) : null;
  } catch {
    return null;
  }
}

/**
 * Retira la papeleta de una persona. SOLO ADMINISTRACIÓN.
 *
 * Existe para lo que de verdad pasa mientras se prepara una edición: alguien vota de prueba, o una papeleta hay
 * que quitarla a mano. Las reglas ya lo reservan a quien modera (`allow delete: if isAdmin()`), así que esto no
 * abre ninguna puerta nueva — solo pone el botón donde se ve el efecto, que es la clasificación provisional.
 *
 * NO SE PUEDE DESHACER: el voto no se guarda en ningún otro sitio. Quien lo pulse tiene que confirmarlo antes.
 */
export async function deleteBallot(uid: string): Promise<void> {
  const { firestore } = await requireServices();
  await deleteDoc(doc(firestore, BALLOTS_COLLECTION, uid));
}
