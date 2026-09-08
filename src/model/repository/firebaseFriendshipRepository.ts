// Capa de amistad en Firestore: un doc por par no ordenado (id canónico `minUid__maxUid`), aceptación mutua.
// Sigue el patrón de firebaseSocialRepository (caché de sesión + dedupe in-flight + degradación silenciosa).
// Identidad SIEMPRE por uid (única verificable en reglas). Los campos de identidad van DENORMALIZADOS en el doc:
// cada parte escribe SOLO los suyos (requester al crear, recipient al aceptar), así la lista/bandeja/feed se
// resuelven desde el propio doc sin leer el directorio (evita el tope de SOCIAL_DIRECTORY_LIMIT y las reglas de profiles).
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore/lite';
import { mapWithConcurrency } from '../../core/utils/concurrency';
import { initializeFirebaseServices, isPermissionDeniedError } from './firebaseClient';
import { getLocalMeta, patchLocalMeta } from './indexedDbRepository';
import { trackAnalyticsEvent } from './telemetryRepository';
import type { FriendshipDoc } from '../types/firestore';
import type { FriendshipView, MyFriendships } from '../types/social';

const MY_FRIENDSHIPS_CACHE_TTL_MS = 60_000;

/**
 * Cinturón de seguridad de la lectura, no paginación. La consulta `array-contains` no tenía tope: un grafo
 * patológico (o un bug que creara amistades en bucle) se traía todos los documentos de golpe.
 *
 * Va SIN `orderBy` a propósito. Ordenar por `updatedAt` daría un recorte determinista, pero exige un índice
 * compuesto declarado y DESPLEGADO en Firebase antes de mergear la consulta: mientras no lo esté, Firestore
 * responde "requires an index" y el espacio social entero se cae. A un tope de mil el recorte no llega a
 * ocurrir nunca en la práctica, así que no compensa acoplar el merge a un despliegue de infraestructura.
 */
const FRIENDSHIPS_HARD_CAP = 1000;

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

/**
 * HUELLA DE MI IDENTIDAD DENORMALIZADA — lo que convierte el saneado en gratis.
 *
 * `healOwnFriendshipIdentity` se dispara al abrir el hub, al guardar el perfil, al publicar y al migrar el canal.
 * Su guarda `diverges` ya evitaba la ESCRITURA cuando nada había cambiado, pero no evitaba nada más: seguía
 * leyendo todos mis documentos de amistad en cada disparo para poder compararlos. Con 500 amigos eso son 500
 * lecturas por apertura del hub para descubrir, casi siempre, que no hay nada que hacer.
 *
 * La huella corta antes: si la identidad que voy a propagar es la misma que ya propagué con éxito desde ESTE
 * dispositivo, no hay nada que comparar y se sale sin leer ni escribir. El caso normal pasa a coste cero.
 *
 * Es local por dispositivo (IndexedDB) A PROPÓSITO: la foto publicable y el gist de la sesión se resuelven en
 * cada dispositivo por separado, así que un sello compartido daría por propagado lo que este dispositivo nunca
 * escribió. El precio es un saneado por dispositivo, que es exactamente lo que hace falta.
 *
 * Sustituye a `friendshipHealedForGist`, que solo miraba el id del gist social: un cambio de nick o de foto —el
 * caso que de verdad importa para la privacidad— se le escapaba entero.
 */
const IDENTITY_FINGERPRINT_VERSION = 1;

function identityFingerprint(myUid: string, self: FriendshipSelfInfo): string {
  // Separador NUL: no puede aparecer en un nick, una URL ni un id de gist, así que dos identidades
  // distintas nunca colisionan por concatenación (un espacio sí valdría en un nick, y ahí `A B|x`
  // colisionaría con `A|B x`). Va como secuencia de escape y NO como byte literal: un NUL crudo en el
  // fuente hace que git trate el fichero como binario y el diff deja de ser revisable.
  return [IDENTITY_FINGERPRINT_VERSION, myUid, self.name, self.photo, self.socialGistId, self.gamesGistId]
    .join('\u0000');
}

/**
 * Olvida la huella para que el PRÓXIMO saneado corra entero. Se llama al crear y al aceptar una amistad, y no es
 * un detalle: sin esto, la huella introduce un bug que hoy no existe.
 *
 * `sendFriendRequest` escribe mis campos con lo que sepa EN ESE INSTANTE, y varios llamantes pasan
 * `gamesGistId: mainSyncConfig?.gistId || ''` sobre una configuración que se hidrata de forma asíncrona. El
 * `create` no tiene la protección `keepKnown` del saneado (no hay valor anterior que conservar), así que esa
 * arista puede nacer con el id vacío. Si la huella siguiera sellada, el saneado ya no volvería a correr y ese
 * amigo se quedaría sin ver mi lista de juegos PARA SIEMPRE. Olvidándola, el siguiente saneado lo arregla: para
 * entonces la configuración ya está hidratada y `keepKnown` deja pasar el id bueno.
 */
async function forgetIdentityFingerprint(): Promise<void> {
  // La cadena vacía nunca puede ser una huella real (todas llevan el prefijo de versión), así que sirve de
  // "ninguna" sin tener que borrar la clave.
  await patchLocalMeta({ friendshipIdentityFingerprint: '' }).catch(() => {
    /* best-effort: sin sello el saneado simplemente vuelve a correr, que es el lado seguro. */
  });
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
        query(
          collection(services.firestore, 'friendships'),
          where('users', 'array-contains', myUid),
          limit(FRIENDSHIPS_HARD_CAP),
        ),
      );
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        return EMPTY_FRIENDSHIPS;
      }
      throw error;
    }

    // Truncar en silencio sería lo peor de los dos mundos: la pantalla se vería normal y `byOtherUid` estaría
    // incompleto, así que a un amigo real se le pintaría "Añadir amigo" y su petición chocaría contra un
    // documento que ya existe. Si el tope se alcanza alguna vez, que quede constancia.
    if (snapshot.docs.length >= FRIENDSHIPS_HARD_CAP) {
      // El `.catch` no sobra: se invoca con `void`, y el `trackAnalyticsEvent` de este módulo SÍ puede rechazar
      // (inicializa Firebase por dentro). Sin él sería un `unhandledrejection` que el gancho global de `main.tsx`
      // atiende con `reportHandledError` —realimentando el fallo— y que en CI tumba la suite con todo en verde.
      // Los llamantes eager lo evitan pasando por `firebaseGateway`, que aquí no se puede usar: crearía un ciclo
      // (`firebaseRepository` → este módulo → gateway → import dinámico de `firebaseRepository`).
      void trackAnalyticsEvent('friendships_hard_cap_reached', { cap: FRIENDSHIPS_HARD_CAP }).catch(() => {
        /* si no se puede informar, no se informa. */
      });
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

    // Los AMIGOS, por el sello del documento. Es un orden de partida: quien los pinta los reordena por el último
    // uso de la aplicación (ver `buildFriendshipViews`), que dice mucho más que cuándo os hicisteis amigos.
    friends.sort((a, b) => b.updatedAt - a.updatedAt);
    // Las PETICIONES, por cuándo se pidieron. Iban por `updatedAt`, y ese campo lo pisa el saneado de identidad:
    // que alguien cambiara su nick o su foto le reordenaba a uno la bandeja sin haber pasado nada. Ahí lo que
    // importa es cuál llegó antes, que es además lo que `friendshipViews` lleva documentando desde siempre.
    const byRequestDate = (a: FriendshipView, b: FriendshipView) => b.createdAt - a.createdAt;
    incoming.sort(byRequestDate);
    outgoing.sort(byRequestDate);

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

  // Hay una arista NUEVA con lo que se supiera en este instante (que puede ser un id vacío). El próximo saneado
  // tiene que verla; ver `forgetIdentityFingerprint`.
  await forgetIdentityFingerprint();
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

  // Mismo motivo que al crear: acabo de estrenar mis campos en esta arista con lo que supiera ahora mismo.
  await forgetIdentityFingerprint();
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
 * Tope de operaciones por lote. Firestore admite 500; se deja margen para no quedarse al filo.
 */
const HEAL_BATCH_MAX_OPS = 450;

/** Escrituras simultáneas del reintento doc a doc cuando un lote entero es rechazado. */
const HEAL_RETRY_CONCURRENCY = 12;

/**
 * Escribe el saneado en LOTES en vez de una petición por amigo. Con 500 amigos eran 500 idas y vueltas sueltas
 * (`Promise.all` sin límite de concurrencia, o sea una ráfaga de 500 peticiones simultáneas); ahora son dos.
 *
 * El `catch` por lote con reintento doc a doc no es una precaución de más: un `writeBatch` es ATÓMICO, así que un
 * único documento que las reglas rechacen —uno legacy con una forma que `friendshipHealOwnFields` no admita—
 * tumbaría el lote entero y se llevaría por delante a los 449 sanos. Antes, con las escrituras sueltas, un doc
 * envenenado solo se perdía a sí mismo. El reintento conserva esa tolerancia: se pierde la ventaja del lote solo
 * en el caso raro, y solo en el trozo afectado.
 *
 * @returns `true` si TODO se escribió. Es lo que decide si se sella la huella.
 */
async function commitHealBatches(
  firestore: Parameters<typeof writeBatch>[0],
  pending: ReadonlyArray<{ docId: string; fields: Record<string, unknown> }>,
): Promise<boolean> {
  let allWritten = true;

  for (let index = 0; index < pending.length; index += HEAL_BATCH_MAX_OPS) {
    const slice = pending.slice(index, index + HEAL_BATCH_MAX_OPS);
    const batch = writeBatch(firestore);
    slice.forEach((item) => batch.update(doc(firestore, 'friendships', item.docId), item.fields));

    try {
      await batch.commit();
    } catch {
      // Degradación a doc a doc: salva todo lo salvable de este trozo. Con la concurrencia ACOTADA, como el resto
      // del proyecto (`mapWithConcurrency`): aquí ya hay algo yendo mal —el lote entero ha sido rechazado— y
      // responder con una ráfaga de 450 escrituras simultáneas es la peor forma de reaccionar.
      const results = await mapWithConcurrency(slice, HEAL_RETRY_CONCURRENCY, (item) =>
        updateDoc(doc(firestore, 'friendships', item.docId), item.fields).then(
          () => true,
          () => false,
        ),
      );
      if (results.some((ok) => !ok)) {
        allWritten = false;
      }
    }
  }

  return allWritten;
}

/**
 * "Sanea" MI identidad denormalizada (nick/foto/ids) en TODOS mis docs de amistad. Se llama al guardar el perfil:
 * si cambié el nick, mis amigos/solicitudes deben reflejar el nick nuevo (privacidad: nunca queda el nombre real
 * de un doc antiguo). Solo toca MIS campos (requester* si soy requester, recipient* si soy recipient) → lo permite
 * la regla `friendshipHealOwnFields`. Best-effort: los fallos por doc no rompen el guardado del perfil.
 *
 * Coste: CERO lecturas y cero escrituras mientras mi identidad no cambie, gracias a la huella (ver
 * `identityFingerprint`). Cuando sí cambia, las escrituras van en lotes en vez de una por amigo.
 *
 * @param options.force Salta la huella y sanea igualmente. Para cuando hace falta la garantía por encima del
 * ahorro (p. ej. tras clonar el canal social, donde el borrado del gist antiguo espera a que las referencias
 * estén repuntadas).
 */
export async function healOwnFriendshipIdentity(
  myUid: string,
  self: FriendshipSelfInfo,
  options?: { force?: boolean },
): Promise<void> {
  if (!myUid) {
    return;
  }

  const fingerprint = identityFingerprint(myUid, self);
  if (!options?.force) {
    const meta = await getLocalMeta().catch(() => null);
    if (meta?.friendshipIdentityFingerprint === fingerprint) {
      return; // nada que propagar: ni una lectura.
    }
  }

  const services = await initializeFirebaseServices();
  if (!services) {
    return;
  }

  let snapshot;
  try {
    // SIN el tope de `FRIENDSHIPS_HARD_CAP`, a diferencia de la lectura de la UI. Recortar aquí dejaría docs sin
    // sanear, y como el recorte no es determinista podrían ser siempre los mismos: justo el fallo que este
    // saneado existe para evitar (que el nombre real de alguien se quede congelado en la bandeja de otro).
    snapshot = await getDocs(
      query(collection(services.firestore, 'friendships'), where('users', 'array-contains', myUid)),
    );
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return;
    }
    throw error;
  }

  const now = Date.now();
  const pending: Array<{ docId: string; fields: Record<string, unknown> }> = [];

  snapshot.docs.forEach((entry) => {
    const data = entry.data() as Partial<FriendshipDoc>;
    const amRequester = data.requester === myUid;
    /**
     * Un id VACÍO no borra el que ya consta: conserva el guardado.
     *
     * Mismo criterio que `establishProfileIdentity` y por el mismo motivo, solo que aquí el daño es ajeno. Varios
     * llamantes pasan `gamesGistId: mainSyncConfig?.gistId || ''`, así que un `''` no significa "este usuario ya
     * no tiene gist de juegos": significa "en este dispositivo, en este instante, no sé cuál es" —la
     * configuración se hidrata de forma asíncrona, y basta guardar el perfil antes de que llegue—. Y estos
     * campos son de donde MIS AMIGOS sacan mi lista de juegos: escribir el vacío se la dejaba en blanco a todos
     * ellos hasta el siguiente guardado con la configuración ya cargada. Borrar de verdad un canal es un gesto
     * explícito con respaldo comprobado (ver `purgeOwnPublicGistIds`), nunca el efecto colateral de no saberlo.
     */
    const keepKnown = (next: string, stored: string | undefined): string => next || str(stored);
    const socialGistId = keepKnown(self.socialGistId, amRequester ? data.requesterSocialGistId : data.recipientSocialGistId);
    const gamesGistId = keepKnown(self.gamesGistId, amRequester ? data.requesterGamesGistId : data.recipientGamesGistId);

    // Solo escribir si algún campo denormalizado DIVERGE del valor actual (evita N writes/cuota en cada
    // apertura de social o guardado de perfil cuando nada ha cambiado).
    const diverges = amRequester
      ? data.requesterName !== self.name ||
        data.requesterPhoto !== self.photo ||
        data.requesterSocialGistId !== socialGistId ||
        data.requesterGamesGistId !== gamesGistId
      : data.recipientName !== self.name ||
        data.recipientPhoto !== self.photo ||
        data.recipientSocialGistId !== socialGistId ||
        data.recipientGamesGistId !== gamesGistId;
    if (!diverges) {
      return;
    }
    const fields = amRequester
      ? {
          requesterName: self.name,
          requesterPhoto: self.photo,
          requesterSocialGistId: socialGistId,
          requesterGamesGistId: gamesGistId,
          updatedAt: now,
        }
      : {
          recipientName: self.name,
          recipientPhoto: self.photo,
          recipientSocialGistId: socialGistId,
          recipientGamesGistId: gamesGistId,
          updatedAt: now,
        };
    pending.push({ docId: entry.id, fields });
  });

  const committed = await commitHealBatches(services.firestore, pending);

  // El sello SOLO se pone si todo se escribió. Si algo falló (red, una regla que denegó), dejarlo sin sellar es
  // lo que hace que el próximo disparo lo reintente en vez de dar por propagado lo que no llegó.
  if (committed) {
    await patchLocalMeta({ friendshipIdentityFingerprint: fingerprint }).catch(() => {
      /* best-effort: sin sello se repite el saneado, que no rompe nada. */
    });
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
