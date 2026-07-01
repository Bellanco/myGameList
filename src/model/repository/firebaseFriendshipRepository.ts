// Capa de amistad en Firestore: un doc por par no ordenado (id canónico `minUid__maxUid`), aceptación mutua.
// Sigue el patrón de firebaseSocialRepository (caché de sesión + dedupe in-flight + degradación silenciosa).
// Identidad SIEMPRE por uid (única verificable en reglas). Los campos de identidad van DENORMALIZADOS en el doc:
// cada parte escribe SOLO los suyos (requester al crear, recipient al aceptar), así la lista/bandeja/feed se
// resuelven desde el propio doc sin leer el directorio (evita el tope de SOCIAL_DIRECTORY_LIMIT y las reglas de profiles).
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { initializeFirebaseServices, isPermissionDeniedError } from './firebaseClient';
import type { FriendshipDoc } from '../types/firestore';
import type { FriendshipView, MyFriendships } from '../types/social';

const MY_FRIENDSHIPS_CACHE_TTL_MS = 60_000;

type CachedValue<T> = { value: T; expiresAt: number };

const myFriendshipsCache = new Map<string, CachedValue<MyFriendships>>();
const myFriendshipsInFlight = new Map<string, Promise<MyFriendships>>();

/** Id canónico del doc de amistad: los dos uid ordenados y unidos por `__`. Determinista → un solo doc por par. */
export function friendshipDocId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}__${uidB}` : `${uidB}__${uidA}`;
}

/** Par ordenado [min, max] para el campo `users` (habilita array-contains y la regla de orden canónico). */
function sortedPair(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

/** Datos que cada parte aporta de SÍ MISMA al crear/aceptar (denormalizados en el doc). */
export interface FriendshipSelfInfo {
  name: string;
  photo: string;
  socialGistId: string;
  gamesGistId: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Convierte un doc crudo en la vista desde el punto de vista de `myUid` (el "otro" ya extraído). */
function toFriendshipView(docId: string, data: Partial<FriendshipDoc>, myUid: string): FriendshipView | null {
  const requester = str(data.requester);
  const recipient = str(data.recipient);
  if (!requester || !recipient) {
    return null;
  }

  const amRequester = requester === myUid;
  const amRecipient = recipient === myUid;
  if (!amRequester && !amRecipient) {
    return null; // no participo — no debería ocurrir con array-contains, pero es una guarda barata.
  }

  const status = data.status === 'accepted' ? 'accepted' : 'pending';
  const state: FriendshipView['state'] = status === 'accepted' ? 'friends' : amRequester ? 'outgoing' : 'incoming';

  return {
    docId,
    otherUid: amRequester ? recipient : requester,
    otherName: amRequester ? str(data.recipientName) : str(data.requesterName),
    otherPhoto: amRequester ? str(data.recipientPhoto) : str(data.requesterPhoto),
    otherSocialGistId: amRequester ? str(data.recipientSocialGistId) : str(data.requesterSocialGistId),
    otherGamesGistId: amRequester ? str(data.recipientGamesGistId) : str(data.requesterGamesGistId),
    state,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

function readMyFriendshipsCache(myUid: string): MyFriendships | undefined {
  const cached = myFriendshipsCache.get(myUid);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt <= Date.now()) {
    myFriendshipsCache.delete(myUid);
    return undefined;
  }
  return cached.value;
}

function saveMyFriendshipsCache(myUid: string, value: MyFriendships): void {
  myFriendshipsCache.set(myUid, { value, expiresAt: Date.now() + MY_FRIENDSHIPS_CACHE_TTL_MS });
}

/** Invalida la caché de amistad (llamar tras cualquier mutación para que el ViewModel re-derive). */
export function invalidateMyFriendshipsCache(myUid?: string): void {
  if (myUid) {
    myFriendshipsCache.delete(myUid);
    return;
  }
  myFriendshipsCache.clear();
}

const EMPTY_FRIENDSHIPS: MyFriendships = { friends: [], incoming: [], outgoing: [], byOtherUid: {} };

/**
 * Todo el estado de amistad del usuario en UNA sola lectura: `friendships where users array-contains myUid`.
 * Categoriza en amigos / recibidas / enviadas y expone `byOtherUid` para el estado O(1) en tarjetas y perfiles.
 * Si las reglas deniegan o Firebase no está configurado, degrada a vacío para no bloquear la UI social.
 */
export async function getMyFriendships(myUid: string, options?: { forceRefresh?: boolean }): Promise<MyFriendships> {
  if (!myUid) {
    return EMPTY_FRIENDSHIPS;
  }

  const forceRefresh = Boolean(options?.forceRefresh);
  if (!forceRefresh) {
    const cached = readMyFriendshipsCache(myUid);
    if (cached) {
      return cached;
    }
    const inFlight = myFriendshipsInFlight.get(myUid);
    if (inFlight) {
      return inFlight;
    }
  }

  const request = (async () => {
    const services = await initializeFirebaseServices();
    if (!services) {
      return EMPTY_FRIENDSHIPS;
    }

    let snapshot;
    try {
      snapshot = await getDocs(
        query(collection(services.firestore, 'friendships'), where('users', 'array-contains', myUid)),
      );
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        return EMPTY_FRIENDSHIPS;
      }
      throw error;
    }

    const friends: FriendshipView[] = [];
    const incoming: FriendshipView[] = [];
    const outgoing: FriendshipView[] = [];
    const byOtherUid: Record<string, FriendshipView> = {};

    snapshot.docs.forEach((entry) => {
      const view = toFriendshipView(entry.id, entry.data() as Partial<FriendshipDoc>, myUid);
      if (!view) {
        return;
      }
      byOtherUid[view.otherUid] = view;
      if (view.state === 'friends') {
        friends.push(view);
      } else if (view.state === 'incoming') {
        incoming.push(view);
      } else {
        outgoing.push(view);
      }
    });

    const byRecent = (a: FriendshipView, b: FriendshipView) => b.updatedAt - a.updatedAt;
    friends.sort(byRecent);
    incoming.sort(byRecent);
    outgoing.sort(byRecent);

    const result: MyFriendships = { friends, incoming, outgoing, byOtherUid };
    saveMyFriendshipsCache(myUid, result);
    return result;
  })();

  if (!forceRefresh) {
    myFriendshipsInFlight.set(myUid, request);
  }
  try {
    return await request;
  } finally {
    myFriendshipsInFlight.delete(myUid);
  }
}

/**
 * Envía una petición de amistad (crea el doc canónico en estado `pending`). Solo escribe los campos del `requester`
 * (los del `recipient` se rellenan al aceptar). Invalida la caché del solicitante.
 *
 * Nota: si el doc ya existe (p. ej. el otro ya te pidió amistad), el `create` fallará; el llamador de más alto nivel
 * (`requestOrAccept` en el ViewModel) consulta primero el estado cacheado y decide crear vs. aceptar.
 */
export async function sendFriendRequest(input: {
  myUid: string;
  otherUid: string;
  self: FriendshipSelfInfo;
}): Promise<void> {
  const { myUid, otherUid, self } = input;
  if (!myUid || !otherUid || myUid === otherUid) {
    throw new Error('Petición de amistad inválida');
  }

  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const now = Date.now();
  const ref = doc(services.firestore, 'friendships', friendshipDocId(myUid, otherUid));
  // create-only (no merge): los campos del recipient NO se escriben aquí (la regla `create` no los permite).
  await setDoc(ref, {
    users: sortedPair(myUid, otherUid),
    requester: myUid,
    recipient: otherUid,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    requesterName: self.name,
    requesterPhoto: self.photo,
    requesterSocialGistId: self.socialGistId,
    requesterGamesGistId: self.gamesGistId,
  });

  invalidateMyFriendshipsCache(myUid);
}

/**
 * Acepta una petición recibida: pasa `pending → accepted` y escribe los campos denormalizados del recipient.
 * Las reglas garantizan que solo el `recipient` puede ejecutar esta transición.
 */
export async function acceptFriendRequest(input: {
  myUid: string;
  docId: string;
  self: FriendshipSelfInfo;
}): Promise<void> {
  const { myUid, docId, self } = input;
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const ref = doc(services.firestore, 'friendships', docId);
  await updateDoc(ref, {
    status: 'accepted',
    updatedAt: Date.now(),
    recipientName: self.name,
    recipientPhoto: self.photo,
    recipientSocialGistId: self.socialGistId,
    recipientGamesGistId: self.gamesGistId,
  });

  invalidateMyFriendshipsCache(myUid);
}

/**
 * Borra el doc de amistad. Cubre cancelar (requester), rechazar (recipient) y eliminar amistad (cualquiera).
 * Las reglas exigen ser participante.
 */
export async function deleteFriendship(input: { myUid: string; docId: string }): Promise<void> {
  const { myUid, docId } = input;
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  try {
    await deleteDoc(doc(services.firestore, 'friendships', docId));
  } catch (error) {
    // Si el doc ya no existe (la otra parte lo canceló/eliminó a la vez), la regla `delete` deniega porque no hay
    // `resource.data.users` que comprobar → permission-denied. El estado deseado (ya no sois amigos) YA se cumple,
    // así que lo tratamos como éxito idempotente en vez de propagar un error confuso. Solo delete es idempotente aquí.
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
  }
  invalidateMyFriendshipsCache(myUid);
}

/**
 * Lee un doc de amistad concreto por par (best-effort). Útil para resolver una carrera de petición simultánea:
 * si al enviar ya existía, el llamador puede releer y decidir aceptar. Devuelve null si no existe o no es legible.
 */
export async function readFriendship(myUid: string, otherUid: string): Promise<FriendshipView | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    return null;
  }
  const docId = friendshipDocId(myUid, otherUid);
  try {
    const snap = await getDoc(doc(services.firestore, 'friendships', docId));
    if (!snap.exists()) {
      return null;
    }
    return toFriendshipView(snap.id, snap.data() as Partial<FriendshipDoc>, myUid);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return null;
    }
    throw error;
  }
}
