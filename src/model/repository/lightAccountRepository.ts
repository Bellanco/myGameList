/**
 * LA CUENTA LIGERA: existir en la app sin haber conectado GitHub.
 *
 * Hasta ahora había dos estados —sin cuenta, o perfil social completo— y el segundo exige las DOS cosas: sesión
 * de Google y un gist, porque el gist es el canal por el que se publica. Eso está bien para el espacio social, y
 * es un muro absurdo para quien solo viene a votar en los premios: pedirle que se cree un token de GitHub el día
 * de más afluencia del año es perder a casi todo el que llegue de fuera.
 *
 * Esto añade el estado de en medio:
 *
 *   sin cuenta → CUENTA LIGERA → perfil social completo
 *
 * Una cuenta ligera tiene nombre, foto, pseudónimo y —si el administrador se lo pone— rango y palmarés. NO sale
 * en el directorio, NO publica actividad y NO tiene canal. Cuando su dueño conecte GitHub, el guardado del perfil
 * social la asciende sin perder nada: `createdAt` es inmutable por regla y el pseudónimo ya está asignado.
 *
 * DOS COSAS QUE NO SE ESCRIBEN NUNCA AQUÍ, y las dos por lo mismo — que las reglas lo rechazarían:
 *
 *  1. **`social.enabled`.** Sin gist, esa marca significa «perfil roto» para el código que hidrata el directorio
 *     (ver la señal `enabled-without-gist`), así que una cuenta ligera con ella aparecería como perfil averiado
 *     en el hub de todo el mundo.
 *  2. **`tier`.** En un `create`, `profileTierNotSelfAssigned()` exige que el campo NO esté: el rango lo pone el
 *     administrador, y quien no lo tiene se trata como bronce por el valor por omisión del código.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { FIRESTORE_SCHEMA_VERSION } from '../../core/constants/schema';
import { PUBLIC_NAME_MAX_LENGTH, safeTrim } from '../../core/security/sanitize';
import { initializeFirebaseServices, type SocialAuthUser } from './firebaseClient';
import { resolveStableProfileId } from './firebaseRepository';
import { getOwnProfileRef, invalidateOwnProfileCache } from './firebaseSocialRepository';

/**
 * Se asegura de que esta cuenta exista como perfil, y devuelve su pseudónimo público.
 *
 * ES IDEMPOTENTE Y NO PISA NADA: si ya hay perfil —ligero o completo— no lo reescribe, solo devuelve su
 * pseudónimo. Sobrescribirlo borraría el nombre que su dueño eligió y, en un perfil completo, su canal.
 *
 * Devuelve cadena vacía si no se pudo (sin Firebase, sin nombre utilizable o reglas que deniegan): votar sin
 * pseudónimo está permitido, así que un fallo aquí no puede impedir votar.
 */
export async function ensureLightAccount(user: SocialAuthUser | null, preferredName?: string): Promise<string> {
  if (!user?.uid) return '';

  try {
    const services = await initializeFirebaseServices();
    if (!services) return '';

    const ref = doc(services.firestore, 'profiles', user.uid);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return String(existing.data()?.profileId || '');
    }

    // Mismo criterio que el perfil completo: el nombre elegido, y si no el de la cuenta, recortado al tope que
    // aceptan las reglas. Un nombre de Google largo denegaría la escritura entera, y su dueño vería un fallo que
    // no puede ni explicar ni arreglar.
    const displayName = safeTrim(preferredName, PUBLIC_NAME_MAX_LENGTH) || safeTrim(user.displayName, PUBLIC_NAME_MAX_LENGTH);
    if (!displayName) return '';

    const profileId = await resolveStableProfileId(user.uid);
    const now = Date.now();

    await setDoc(ref, {
      schemaVersion: FIRESTORE_SCHEMA_VERSION,
      uid: user.uid,
      profileId,
      displayName,
      photoURL: user.photoURL || '',
      createdAt: now,
      updatedAt: now,
    });

    return profileId;
  } catch {
    // Sin perfil se vota igual: el pseudónimo es opcional en la papeleta y en las reglas.
    return '';
  }
}

/**
 * EL ALIAS DE LA PAPELETA PASA A LA CUENTA LIGERA, también si ya la tenía con otro nombre.
 *
 * Quien no tenía perfil ya lo estrena con ese nombre (`ensureLightAccount`); esto cubre a quien ya tenía cuenta
 * ligera de otra edición. Sin gist, `displayName` es su único nombre, así que basta con escribirlo ahí.
 *
 * NUNCA toca un perfil social: ahí el nombre de la papeleta ES el de su perfil y no se elige al votar, así que no
 * hay nada que devolverle (el que cambia es al revés, del perfil a la papeleta: ver `renameOwnBallot`).
 *
 * Best-effort, como la cuenta ligera: el voto ya está guardado y un fallo aquí no puede deshacerlo.
 */
export async function saveBallotNameToProfile(user: SocialAuthUser | null, name: string): Promise<void> {
  const nombre = safeTrim(name, PUBLIC_NAME_MAX_LENGTH);
  if (!user?.uid || !nombre) return;

  try {
    const services = await initializeFirebaseServices();
    if (!services) return;

    const own = await getOwnProfileRef(user.uid);
    if (!own || own.socialEnabled || own.displayName === nombre) return;

    await setDoc(
      doc(services.firestore, 'profiles', user.uid),
      { uid: user.uid, displayName: nombre, updatedAt: serverTimestamp() },
      { merge: true },
    );
    invalidateOwnProfileCache(user.uid);
  } catch {
    // El voto ya está dentro; el nombre de la cuenta se queda como estaba.
  }
}
