// Fachada del repositorio Firebase. El código se reparte en módulos cohesivos (M2):
//  - firebaseClient: init de servicios + config + analytics module + helpers de error + interfaces de dominio.
//  - telemetryRepository: reportHandledError / trackAnalyticsEvent.
//  - firebaseAuthRepository: sign-in/out con Google + usuario actual.
//  - firebaseSocialRepository: directorio, índice público, recomendaciones (+ sus cachés).
// Este fichero conserva el NÚCLEO de perfil/identidad/token y RE-EXPORTA la API pública para que ningún
// consumidor cambie sus imports.
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { decryptFromString, encryptToString } from '../../core/security/crypto';
import { seedProfileIdFromRemote } from './indexedDbRepository';
import {
  initializeFirebaseServices,
  isPermissionDeniedError,
  type SocialAuthUser,
  type SocialProfileReference,
} from './firebaseClient';
import { findSocialProfileByEmail, invalidateSocialDirectoryCache, saveProfileByEmailCache } from './firebaseSocialRepository';
import type { FirestorePrivateConfig } from '../types/firestore';

// --- RE-EXPORTS: API pública estable (los consumidores siguen importando desde firebaseRepository) ---
export { initializeFirebaseServices } from './firebaseClient';
export type {
  FirebaseServices,
  SocialAuthUser,
  SocialProfileReference,
  SocialDirectoryEntry,
} from './firebaseClient';
export { reportHandledError, trackAnalyticsEvent } from './telemetryRepository';
export { getCurrentSocialAuthUser, signInWithGoogle, signOutSocialUser } from './firebaseAuthRepository';
// C5: el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones quedaron sin consumidores y
// con reglas admin-only (rotas en cliente). Código muerto eliminado; la migración a índice pseudónimo por
// profileId (con guarda recursiva de campos privados) queda registrada como tarea gated en CODE-REVIEW-IMPROVEMENTS.md.
export {
  findSocialProfileByEmail,
  listSocialDirectory,
} from './firebaseSocialRepository';

// F6.3 (modernización): marca de versión de esquema en los docs de Firestore (profiles/userMap/privateConfig).
// Aditiva — las reglas no validan un conjunto exacto de campos, así que no requiere redesplegar reglas. Permite a
// futuras migraciones detectar la versión del documento.
const FIRESTORE_SCHEMA_VERSION = 1;

/**
 * Guarda referencia mínima de perfil en Firestore.
 * No lee ni elimina documentos de placeholder en colecciones sociales.
 */
export async function upsertProfileSocialReferences(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
}): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const profileName = (input.preferredName || input.user.displayName || input.user.email || '').trim();
  const profileId = await resolveStableProfileId(input.user.uid);

  await setDoc(
    doc(services.firestore, 'profiles', input.user.uid),
    {
      schemaVersion: FIRESTORE_SCHEMA_VERSION,
      uid: input.user.uid,
      profileId,
      email: input.user.email,
      displayName: profileName,
      photoURL: input.user.photoURL,
      social: {
        gistId: input.socialGistId,
        gamesGistId: String(input.gamesGistId || ''),
        etag: input.socialGistEtag,
        enabled: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // B1: el token NO se escribe en claro en Firestore; se respalda CIFRADO en privateConfig (recuperación cross-device).
  if (input.githubToken) {
    try {
      await backupGithubToken(input.user.uid, input.githubToken);
      // Upgrade proactivo: una vez respaldado cifrado, borrar el token en claro LEGACY que perfiles viejos
      // aún conservan en `profiles.social.githubToken` (merge no lo elimina; deleteField sí).
      await setDoc(
        doc(services.firestore, 'profiles', input.user.uid),
        { social: { githubToken: deleteField() } }, // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
        { merge: true },
      );
    } catch (error) {
      console.warn('[firebase] No se pudo respaldar/limpiar el token:', error instanceof Error ? error.message : error);
    }
  }

  // B2: establecer profileId/userMap/privateConfig.
  await establishProfileIdentity(input.user.uid, profileId, String(input.gamesGistId || ''), input.socialGistId);

  const cleanEmail = input.user.email.trim().toLowerCase();
  if (cleanEmail) {
    saveProfileByEmailCache(cleanEmail, {
      id: input.user.uid,
      email: cleanEmail,
      displayName: profileName,
      socialGistId: input.socialGistId,
      gamesGistId: String(input.gamesGistId || ''),
      githubToken: String(input.githubToken || ''), // audit-allow: caché en MEMORIA (no Firestore); el token va cifrado a privateConfig
      socialEnabled: true,
    });
  }
}

// ---------------------------------------------------------------------------
// privateConfig/{uid} — solo lectura/escritura del dueño (ver firestore.rules destino).
// Guarda ids de gist/chunks y el token de GitHub CIFRADO (recuperación tras reinstalar).
// ---------------------------------------------------------------------------

export async function getPrivateConfig(uid: string): Promise<FirestorePrivateConfig | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  const snap = await getDoc(doc(services.firestore, 'privateConfig', uid));
  return snap.exists() ? (snap.data() as FirestorePrivateConfig) : null;
}

export async function setPrivateConfig(uid: string, config: Partial<FirestorePrivateConfig>): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  await setDoc(doc(services.firestore, 'privateConfig', uid), { ...config, schemaVersion: FIRESTORE_SCHEMA_VERSION }, { merge: true });
}

/**
 * Cifra el token de GitHub con una clave derivada del `uid` (estable entre dispositivos) y lo guarda
 * en `privateConfig`. Firestore nunca ve el token en claro.
 * Nota de seguridad: la protección efectiva es la regla owner-only de `privateConfig`; el uid no es
 * un secreto de alta entropía, así que no sustituye a dicha regla.
 */
export async function backupGithubToken(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;
  const encryptedGithubToken = await encryptToString(token, uid);
  await setPrivateConfig(uid, { encryptedGithubToken });
}

/**
 * Recupera y descifra el token de GitHub desde `privateConfig` (tras login con Google).
 * Resiliente: si la lectura de `privateConfig` está denegada por reglas (permission-denied) o el
 * descifrado falla, devuelve null para que el flujo caiga al fallback legacy en vez de romperse.
 */
export async function recoverGithubToken(uid: string): Promise<string | null> {
  try {
    const cfg = await getPrivateConfig(uid);
    if (!cfg?.encryptedGithubToken) return null;
    return await decryptFromString(cfg.encryptedGithubToken, uid);
  } catch {
    return null;
  }
}

/** userMap/{uid} → { profileId }. Mapa privado uid→profileId (reglas: nunca legible por clientes). */
export async function setUserMap(uid: string, profileId: string): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');
  await setDoc(doc(services.firestore, 'userMap', uid), { profileId, schemaVersion: FIRESTORE_SCHEMA_VERSION }, { merge: true });
}

/**
 * B2: establece la identidad pseudónima al activar lo social — genera/recupera `profileId`,
 * escribe `userMap/{uid}` y guarda los ids en `privateConfig` (merge, conserva el token cifrado).
 * Best-effort: no rompe el guardado social si falla.
 */
export async function establishProfileIdentity(uid: string, profileId: string, gamesGistId: string, socialGistId: string): Promise<void> {
  try {
    await setUserMap(uid, profileId);
    await setPrivateConfig(uid, { profileId, gamesGistId, socialGistId });
  } catch (error) {
    console.warn('[firebase] No se pudo establecer profileId/userMap:', error instanceof Error ? error.message : error);
  }
}

/** Lee `userMap/{uid}.profileId` (owner-only). Resiliente: cualquier fallo/ausencia → null. */
export async function getUserMapProfileId(uid: string): Promise<string | null> {
  try {
    const services = await initializeFirebaseServices();
    if (!services || !uid) return null;
    const snap = await getDoc(doc(services.firestore, 'userMap', uid));
    if (!snap.exists()) return null;
    const pid = String((snap.data() as { profileId?: string }).profileId || '').trim();
    return pid || null;
  } catch {
    return null;
  }
}

/**
 * 6.2a — Recupera el `profileId` canónico desde Firestore: primero `privateConfig/{uid}` (donde lo
 * deja `establishProfileIdentity`), con fallback a `userMap/{uid}`. Resiliente: permission-denied / offline
 * / ausencia → null para que el llamador caiga al comportamiento local.
 */
export async function recoverRemoteProfileId(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const cfg = await getPrivateConfig(uid);
    const pid = String(cfg?.profileId || '').trim();
    if (pid) return pid;
  } catch {
    // sigue al fallback de userMap
  }
  return getUserMapProfileId(uid);
}

/**
 * 6.2a — Resuelve el `profileId` a usar para las escrituras sociales. Reconcilia con el remoto canónico
 * ANTES de generar uno local nuevo, de modo que todos los dispositivos del mismo usuario converjan al mismo
 * pseudónimo. Si no hay remoto (primer dispositivo) o Firestore no responde, cae al `profileId` local.
 */
export async function resolveStableProfileId(uid: string): Promise<string> {
  const remote = await recoverRemoteProfileId(uid);
  return seedProfileIdFromRemote(remote);
}

/**
 * Garantiza que exista perfil por correo con correo, nombre y gist id.
 */
export async function ensureProfileByEmail(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
}): Promise<SocialProfileReference> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanEmail = input.user.email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('La cuenta de Google no tiene email válido');
  }

  let existing: SocialProfileReference | null = null;
  try {
    existing = await findSocialProfileByEmail(cleanEmail);
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
  }

  const profileName = (input.preferredName || input.user.displayName || cleanEmail).trim();
  const targetId = existing?.id || input.user.uid;
  const gamesGistId = String(input.gamesGistId || '');
  const githubToken = String(input.githubToken || '');
  const profileId = await resolveStableProfileId(input.user.uid);
  const shouldWriteProfile =
    !existing ||
    !existing.socialEnabled ||
    existing.id !== targetId ||
    existing.id !== input.user.uid ||
    existing.displayName.trim() !== profileName ||
    existing.socialGistId !== input.socialGistId ||
    existing.gamesGistId !== gamesGistId ||
    existing.githubToken !== githubToken;

  if (shouldWriteProfile) {
    await setDoc(
      doc(services.firestore, 'profiles', targetId),
      {
        schemaVersion: FIRESTORE_SCHEMA_VERSION,
        uid: input.user.uid,
        profileId,
        email: cleanEmail,
        displayName: profileName,
        photoURL: input.user.photoURL,
        social: {
          gistId: input.socialGistId,
          gamesGistId,
          etag: input.socialGistEtag,
          enabled: true,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  // B1: respaldo CIFRADO del token en privateConfig; nunca en claro en `profiles`.
  if (githubToken) {
    try {
      await backupGithubToken(input.user.uid, githubToken);
      // Upgrade proactivo: una vez respaldado cifrado, borrar el token en claro LEGACY que perfiles viejos
      // aún conservan en `profiles.social.githubToken` (merge no lo elimina; deleteField sí).
      await setDoc(
        doc(services.firestore, 'profiles', targetId),
        { social: { githubToken: deleteField() } }, // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
        { merge: true },
      );
    } catch (error) {
      console.warn('[firebase] No se pudo respaldar/limpiar el token:', error instanceof Error ? error.message : error);
    }
  }

  // B2: establecer profileId/userMap/privateConfig.
  await establishProfileIdentity(input.user.uid, profileId, gamesGistId, input.socialGistId);

  saveProfileByEmailCache(cleanEmail, {
    id: targetId,
    email: cleanEmail,
    displayName: profileName,
    socialGistId: input.socialGistId,
    gamesGistId,
    githubToken,
    socialEnabled: true,
  });
  invalidateSocialDirectoryCache();

  return {
    id: targetId,
    email: cleanEmail,
    displayName: profileName,
    socialGistId: input.socialGistId,
    gamesGistId,
    githubToken,
    socialEnabled: true,
  };
}
