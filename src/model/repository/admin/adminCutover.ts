// CUTOVER DE IDENTIDAD y BORRADO de un usuario: las dos operaciones más destructivas del panel.
//
// Van juntas porque comparten la misma naturaleza —mueven o retiran el documento de alguien— y las mismas
// cautelas: batch atómico, respeto al centinela y, en el caso del borrado, la advertencia de que es PARCIAL.
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore/lite';
import { invalidateOwnProfileCache, invalidateSocialDirectoryCache } from '../firebaseSocialRepository';
import { invalidateMyFriendshipsCache } from '../firebaseFriendshipRepository';
import { PLACEHOLDER_ID, describe, requireServices, toAdminError, toMillis, type AdminActionResult } from './adminShared';

export type IdentityCutoverOutcome =
  /** No existía `profiles/{uid}`: el documento legacy se ha MOVIDO ahí entero y el original se ha borrado. */
  | 'moved'
  /** Ya existía `profiles/{uid}`: manda el vivo, y del huérfano solo se ha rescatado lo que al vivo le faltaba. */
  | 'merged';

export interface IdentityCutoverResult {
  outcome: IdentityCutoverOutcome;
  /** Campos que se han rescatado del huérfano al documento vivo (vacío en un `moved`, que se lleva todo). */
  carried: string[];
}

/**
 * CUTOVER DE IDENTIDAD (señal `foreign-doc-id`): lleva un perfil legacy que vive bajo un id cualquiera a
 * `profiles/{uid}`, que es donde la app lo busca hoy, y borra el original.
 *
 * Por qué esto es del ADMIN y no del dueño: las reglas solo dejan escribir y borrar `profiles/{docId}` a quien
 * cumple `isOwner(docId)`. Sobre un documento cuyo id NO es su uid, el dueño no puede hacer nada —ni borrarlo ni
 * apagarlo—, así que el huérfano solo lo puede retirar el administrador. Lo que el dueño SÍ puede es crear su
 * documento canónico, y su navegador lo hace al entrar (ver `firebaseProfileHealRepository`).
 *
 * MOVER, NO REESCRIBIR: el documento legacy se copia TAL CUAL (incluidos `email`, `social.gistId`,
 * `social.gamesGistId` y el token en claro legacy). Podría parecer lo contrario de la purga de PII, y es justo al
 * revés: mientras el documento vive bajo un id ajeno, el auto-saneado del dueño no lo toca —solo mira
 * `profiles/{uid}`—, así que esos restos son intocables. En cuanto están en el documento canónico, el primer inicio
 * de sesión del dueño pone el token y el id del gist a salvo cifrados en `privateConfig` y purga el resto. Copiarlos
 * es lo que DESBLOQUEA la limpieza; dejarlos atrás sería destruir la única copia que le queda de su token.
 *
 * `uid` se fuerza al del destino: sin ese campo (hay perfiles tan viejos que no lo tienen) la regla
 * `profileWriteIsValid` denegaría al dueño cualquier escritura sobre su propio perfil recién movido.
 *
 * Las amistades NO se tocan: sus documentos referencian uids, no ids de perfil, así que el movimiento les es
 * indiferente. Y el `tier` viaja con el documento (o se rescata), que es lo que no podría hacer el dueño.
 *
 * Todo en un único `writeBatch`: o el perfil aparece en su sitio y el huérfano desaparece, o no cambia nada. Sin
 * ventana intermedia en la que el usuario esté duplicado en el directorio o no exista en ninguno de los dos sitios.
 */
export async function migrateForeignProfileDoc(legacyDocId: string, uid: string): Promise<IdentityCutoverResult> {
  const cleanLegacyId = String(legacyDocId || '').trim();
  const cleanUid = String(uid || '').trim();

  if (!cleanLegacyId || cleanLegacyId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }
  if (!cleanUid) {
    throw new Error('No se conoce el uid de destino: sin él no hay a dónde mover el perfil');
  }
  if (cleanLegacyId === cleanUid) {
    throw new Error('Este perfil ya vive en `profiles/{uid}`: no hay nada que migrar');
  }

  const services = await requireServices();

  let legacySnapshot;
  let targetSnapshot;
  try {
    [legacySnapshot, targetSnapshot] = await Promise.all([
      getDoc(doc(services.firestore, 'profiles', cleanLegacyId)),
      getDoc(doc(services.firestore, 'profiles', cleanUid)),
    ]);
  } catch (error) {
    throw toAdminError(error, 'leer los perfiles de la migración');
  }

  if (!legacySnapshot.exists()) {
    throw new Error('El perfil legacy ya no existe: recarga el censo');
  }

  const legacyData = legacySnapshot.data() as Record<string, unknown>;
  const batch = writeBatch(services.firestore);
  const legacyRef = doc(services.firestore, 'profiles', cleanLegacyId);
  const targetRef = doc(services.firestore, 'profiles', cleanUid);
  const carried: string[] = [];

  if (!targetSnapshot.exists()) {
    // MOVER el documento entero. `merge: false` a propósito: es el mismo perfil cambiando de sitio, no una fusión.
    batch.set(targetRef, { ...legacyData, uid: cleanUid }); // audit-allow: MOVIMIENTO literal del documento (el email ya era público en el origen); el saneado del dueño lo purga después
    batch.delete(legacyRef);
  } else {
    // Ya hay documento canónico (su dueño ya ha pasado por aquí). El vivo MANDA: pisarlo con el legacy le
    // devolvería un nick o una foto viejos. Del huérfano solo se rescata lo que al vivo le falte, y lo que se
    // rescata es exactamente lo que su dueño no podría recuperar de otro sitio.
    const targetData = targetSnapshot.data() as Record<string, unknown>;
    const legacySocial = (legacyData.social || {}) as Record<string, unknown>;
    const targetSocial = (targetData.social || {}) as Record<string, unknown>;
    const rescue: Record<string, unknown> = { uid: cleanUid };

    // El rango lo asigna el administrador y el dueño no puede escribirlo: si se quedara en el huérfano, se
    // perdería en el borrado y habría que volver a asignarlo a mano.
    if (legacyData.tier && !targetData.tier) {
      rescue.tier = legacyData.tier;
      carried.push('tier');
    }

    // Antigüedad: gana la fecha de alta MÁS ANTIGUA de las dos. El dueño no puede reescribir la suya (las reglas
    // la declaran inmutable), así que esta es la única oportunidad de conservarla.
    const legacyCreatedAt = toMillis(legacyData.createdAt as never);
    const targetCreatedAt = toMillis(targetData.createdAt as never);
    if (legacyCreatedAt > 0 && (targetCreatedAt === 0 || legacyCreatedAt < targetCreatedAt)) {
      rescue.createdAt = legacyData.createdAt;
      carried.push('createdAt');
    }

    // Restos de recuperación: solo si el vivo no los tiene ya. Van al documento canónico para que el saneado del
    // arranque los ponga a salvo cifrados y los purgue; ahí sí puede, y en el huérfano nunca pudo.
    if (legacySocial.githubToken && !targetSocial.githubToken) {
      rescue['social.githubToken'] = legacySocial.githubToken; // audit-allow: RESCATE del token legacy para que el saneado del dueño lo cifre en privateConfig y lo purgue; en el huérfano se perdería
      carried.push('social.githubToken');
    }
    if (legacySocial.gamesGistId && !targetSocial.gamesGistId) {
      rescue['social.gamesGistId'] = legacySocial.gamesGistId; // audit-allow: RESCATE del id de gist para que el saneado lo mueva a privateConfig (owner-only)
      carried.push('social.gamesGistId');
    }
    if (legacySocial.gistId && !targetSocial.gistId) {
      rescue['social.gistId'] = legacySocial.gistId;
      carried.push('social.gistId');
    }

    batch.set(targetRef, rescue, { merge: true });
    batch.delete(legacyRef);
  }

  try {
    await batch.commit();
  } catch (error) {
    throw toAdminError(error, 'migrar la identidad del perfil');
  }

  invalidateOwnProfileCache(cleanLegacyId);
  invalidateOwnProfileCache(cleanUid);
  invalidateSocialDirectoryCache();

  return { outcome: targetSnapshot.exists() ? 'merged' : 'moved', carried };
}

/**
 * Borra el perfil de un usuario y TODAS sus amistades (en ambos sentidos: el doc de amistad guarda también la
 * identidad denormalizada del que se va, así que dejarlo sería dejar su nombre y su foto en la bandeja del otro).
 *
 * BORRADO PARCIAL, y hay que decirlo claro: `privateConfig`, `publicConfig` y `userMap` de ese usuario son
 * owner-only en las reglas y sobreviven a esta operación, igual que su cuenta de Firebase Auth y sus gists de
 * GitHub. Para un borrado completo haría falta el Admin SDK en servidor. Lo que sí consigue: el usuario desaparece
 * del directorio, del feed y de las listas de amigos, y al volver a entrar se le crea un perfil nuevo.
 *
 * Best-effort acumulativo (mismo criterio que `deleteOwnAccount`): no aborta al primer fallo, los reporta.
 */
export async function deleteUserProfile(profileDocId: string, uid: string): Promise<AdminActionResult> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    return { ok: false, failures: ['Identificador de perfil no válido'] };
  }

  const services = await requireServices();
  const failures: string[] = [];
  const targetUid = uid || profileDocId;

  try {
    const snapshot = await getDocs(
      query(collection(services.firestore, 'friendships'), where('users', 'array-contains', targetUid)),
    );
    const results = await Promise.allSettled(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      failures.push(`amistades: ${failed} de ${snapshot.size} no se pudieron borrar`);
    }
  } catch (error) {
    failures.push(`amistades: ${describe(toAdminError(error, 'borrar las amistades'))}`);
  }

  try {
    await deleteDoc(doc(services.firestore, 'profiles', profileDocId));
  } catch (error) {
    failures.push(`perfil: ${describe(toAdminError(error, 'borrar el perfil'))}`);
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateMyFriendshipsCache();
  invalidateSocialDirectoryCache();

  return { ok: failures.length === 0, failures };
}
