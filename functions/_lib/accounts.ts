// EL CENSO DE CUENTAS DE FIREBASE AUTH y su borrado completo (docs/plan-cuentas-inactivas.md).
//
// El censo del panel sale de `profiles`, así que quien entró con Google y no llegó a crear su espacio social no
// aparecía en ningún sitio. Aquí se cruza Auth con Firestore para saber, de cada cuenta, si tiene perfil, si votó en
// los premios y cuándo la usó por última vez; con eso decide `judgeRetention` (src/core/admin/accountRetention.ts).
//
// El BORRADO (`purgeAccount`) se lleva TODO lo que el servicio guarda de una cuenta (decisión del usuario,
// 15-10-2026): amistades de los dos lados, depósitos de ids, enlaces públicos y lo que KV guarda por uid, documentos
// propios, su fila en el archivo y en los votos de cada edición de los premios, su uid en los registros de premios,
// lo que el registro del panel apunta de ella y, al final, la cuenta de Auth. Lo usan el panel y la baja desde la app
// (`/api/account`). Los gists no se tocan: son del usuario, en su cuenta de GitHub.
import { judgeRetention, retentionFactsOf, type RetentionVerdict } from '../../src/core/admin/accountRetention';
import {
  decodeFields,
  commitWrites,
  deleteAuthAccount,
  docIdOf,
  getDocument,
  listAuthAccounts,
  listCollection,
  queryCollection,
  type AdminApi,
  type AdminWrite,
  type AuthAccount,
  type FirestoreDocument,
} from './googleAdmin';
import { ServiceUnavailableError } from './http';
import { banKey, dailyQuotaKey, overrideKey, relatedIndexKey, type KVNamespace } from './keys';
import { listActiveShares } from './quota';
import { removeShares } from './shares';

/** Lo que el panel recibe de cada cuenta. El correo solo lo pinta la ficha (decisión del usuario, 15-10-2026). */
export interface AccountRow {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: number;
  /** Último uso según Auth: la más reciente entre la renovación de la sesión y el último inicio. */
  authLastUsedAt: number;
  /** `social`: perfil con el espacio social activo; `suspended`: perfil con él apagado; `null`: sin perfil. */
  profile: 'social' | 'suspended' | null;
  profileUpdatedAt: number;
  hasBallot: boolean;
  premiosParticipant: boolean;
  admin: boolean;
  disabled: boolean;
}

export interface AccountCensus {
  accounts: AccountRow[];
  /** Perfiles cuyo uid ya no está en Auth: restos que nadie puede borrar desde la app. */
  orphanProfiles: number;
}

/** Colecciones con un documento por uid (las mismas que borra la baja desde la app, más la papeleta). */
const OWNED_COLLECTIONS = ['profiles', 'privateConfig', 'publicConfig', 'userMap', 'premiosBallots'] as const;

/** `updatedAt` llega como marca de tiempo o, en perfiles viejos, como número. */
function millis(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Los uids que figuran en el registro de votantes (`voters-*`) o de trofeos (`palmares-*`) de los premios.
 *
 * El que cuenta de verdad es `palmares-*`: lleva a TODO el que votó (participar también es un trofeo, de rango 0) y no
 * se borra nunca. `voters-*` se borra al abrir la edición siguiente; se lee igual porque entre publicar y que el
 * registro de trofeos se guarde (es best-effort) es el único sitio con los uids.
 */
export function premiosParticipants(documents: ReadonlyArray<{ id: string; data: Record<string, unknown> }>): Set<string> {
  const uids = new Set<string>();
  for (const { id, data } of documents) {
    if (id.startsWith('voters-') && Array.isArray(data.uids)) {
      for (const uid of data.uids) if (typeof uid === 'string' && uid) uids.add(uid);
    }
    if (id.startsWith('palmares-') && Array.isArray(data.recipients)) {
      for (const entry of data.recipients) {
        const uid = (entry as { uid?: unknown } | null)?.uid;
        if (typeof uid === 'string' && uid) uids.add(uid);
      }
    }
  }
  return uids;
}

export function toAccountRow(
  account: AuthAccount,
  profile: { socialEnabled: boolean; updatedAt: number } | undefined,
  hasBallot: boolean,
  premiosParticipant: boolean,
): AccountRow {
  return {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    photoURL: account.photoURL,
    createdAt: account.createdAt,
    authLastUsedAt: Math.max(account.lastRefreshAt, account.lastLoginAt),
    profile: profile ? (profile.socialEnabled ? 'social' : 'suspended') : null,
    profileUpdatedAt: profile?.updatedAt || 0,
    hasBallot,
    premiosParticipant,
    admin: account.admin,
    disabled: account.disabled,
  };
}

export function judgeRow(row: AccountRow, now: number): RetentionVerdict {
  return judgeRetention(retentionFactsOf(row), now);
}

/** Lee Auth y lo que hace falta de Firestore. Son cuatro listados, sin leer ningún documento entero. */
export async function readAccountCensus(api: AdminApi): Promise<AccountCensus> {
  const [accounts, profiles, ballots, premiosAdmin] = await Promise.all([
    listAuthAccounts(api),
    // `uid` además del id: hay perfiles legacy cuyo documento no lleva el uid por id (`foreign-doc-id`, ver
    // `adminCutover.ts`). Sin él, su dueño saldría «sin perfil», caducaría a los dos meses y su perfil se quedaría.
    listCollection(api, 'profiles', ['uid', 'social.enabled', 'updatedAt']),
    // Solo los ids: el campo pedido es uno cualquiera de la papeleta, para no traer los votos.
    listCollection(api, 'premiosBallots', ['userId']),
    listCollection(api, 'premiosAdmin', ['uids', 'recipients']),
  ]);

  // Por el `uid` del documento (o su id si no lo lleva). Con dos documentos para la misma persona (el canónico y uno
  // legacy a medio migrar), cuenta el más reciente y el espacio social activo si lo está en alguno.
  const profileByUid = new Map<string, { socialEnabled: boolean; updatedAt: number }>();
  for (const document of profiles) {
    const data = decodeFields(document.fields);
    const owner = typeof data.uid === 'string' && data.uid ? data.uid : docIdOf(document);
    const social = (data.social || {}) as { enabled?: unknown };
    const previous = profileByUid.get(owner);
    profileByUid.set(owner, {
      socialEnabled: social.enabled === true || previous?.socialEnabled === true,
      updatedAt: Math.max(millis(data.updatedAt), previous?.updatedAt || 0),
    });
  }
  const ballotUids = new Set(ballots.map(docIdOf));
  const participants = premiosParticipants(premiosAdmin.map((document) => ({ id: docIdOf(document), data: decodeFields(document.fields) })));

  const authUids = new Set(accounts.map((account) => account.uid));
  return {
    accounts: accounts.map((account) =>
      toAccountRow(account, profileByUid.get(account.uid), ballotUids.has(account.uid), participants.has(account.uid))),
    orphanProfiles: [...profileByUid.keys()].filter((uid) => !authUids.has(uid)).length,
  };
}

export interface PurgeOutcome {
  /** Pasos que fallaron, en palabras y sin identificadores. Vacío = todo borrado. */
  failures: string[];
  /** Si se borró la cuenta de Auth (solo se intenta con todo lo demás ya borrado). */
  authDeleted: boolean;
}

/** Lo que se lee antes de borrar, para saber qué quitar de los documentos que la cuenta comparte con otros. */
export interface ForgetInput {
  uid: string;
  /** Sus seudónimos: el `profileId` de su perfil, de `privateConfig` y de `userMap`. */
  profileIds: ReadonlySet<string>;
  /** `premiosAdmin`: los registros de votantes (`voters-*`) y de trofeos (`palmares-*`). */
  premiosAdmin: readonly FirestoreDocument[];
  /** `premiosResults`: el archivo público de cada edición. */
  results: readonly FirestoreDocument[];
  /** `premiosReveal`: los votos de cada uno de una edición. */
  reveals: readonly FirestoreDocument[];
}

/**
 * Las reescrituras que hacen falta para olvidar la cuenta en los documentos que comparte con otros. Puro.
 *
 * - Su uid sale de los registros de votantes y de trofeos (si estaba).
 * - Su fila sale del archivo y de los votos de cada edición. Una fila es suya solo si se cumplen LAS DOS: su
 *   `profileId` es uno de sus seudónimos (`ownProfileIds`) y el registro de trofeos de esa edición —que escribe solo
 *   el administrador, con el uid— dice que esta cuenta quedó en el puesto de esa fila. El seudónimo solo no basta:
 *   lo escribe el cliente y los ajenos están a la vista en el archivo público. Las filas de gente de fuera de la app
 *   (el histórico importado) llevan el `profileId` vacío, y un vacío no se busca nunca. El resto de filas se queda
 *   con su puesto: quitar a alguien no reordena la clasificación de los demás. Los recuentos (votos por nominado,
 *   papeletas) se quedan: son cifras, no dicen de quién.
 *
 * Cada reescritura lleva el `updateTime` de la lectura: si el administrador toca el mismo documento a la vez, el
 * `commit` falla entero y se reintenta, en vez de pisar su cambio.
 */
export function forgetWrites(input: ForgetInput): AdminWrite[] {
  const writes: AdminWrite[] = [];
  const update = (document: FirestoreDocument, fields: Record<string, unknown>) => {
    const collection = document.name.split('/documents/')[1]?.split('/')[0] || '';
    writes.push({ update: `${collection}/${docIdOf(document)}`, fields, updateTime: document.updateTime });
  };
  // En qué puesto quedó en cada edición, según el registro de trofeos: el del trofeo o, si solo participó, el real.
  const placeBySeason = new Map<string, number>();
  for (const document of input.premiosAdmin) {
    const id = docIdOf(document);
    if (!id.startsWith('palmares-')) continue;
    const recipients = decodeFields(document.fields).recipients;
    const own = Array.isArray(recipients) ? (recipients.find((entry) => (entry as { uid?: unknown } | null)?.uid === input.uid) as { rank?: unknown; place?: unknown } | undefined) : undefined;
    const place = own ? (Number(own.rank) > 0 ? Number(own.rank) : Number(own.place) || 0) : 0;
    if (place > 0) placeBySeason.set(id.slice('palmares-'.length), place);
  }
  const ownRow = (seasonId: string) => (entry: unknown) => {
    const row = (entry || {}) as { profileId?: unknown; rank?: unknown };
    const place = placeBySeason.get(seasonId);
    return typeof row.profileId === 'string' && row.profileId !== '' && input.profileIds.has(row.profileId)
      && place !== undefined && Number(row.rank) === place;
  };

  for (const document of input.premiosAdmin) {
    const id = docIdOf(document);
    const data = decodeFields(document.fields);
    if (id.startsWith('voters-') && Array.isArray(data.uids) && data.uids.includes(input.uid)) {
      update(document, { uids: data.uids.filter((uid) => uid !== input.uid) });
    }
    if (id.startsWith('palmares-') && Array.isArray(data.recipients)) {
      const kept = data.recipients.filter((entry) => (entry as { uid?: unknown } | null)?.uid !== input.uid);
      if (kept.length !== data.recipients.length) update(document, { recipients: kept });
    }
  }
  for (const document of input.results) {
    const data = decodeFields(document.fields);
    const own = ownRow(docIdOf(document));
    if (Array.isArray(data.leaderboard) && data.leaderboard.some(own)) {
      update(document, { leaderboard: data.leaderboard.filter((entry) => !own(entry)) });
    }
  }
  for (const document of input.reveals) {
    const data = decodeFields(document.fields);
    const own = ownRow(docIdOf(document));
    if (Array.isArray(data.ballots) && data.ballots.some(own)) {
      update(document, { ballots: data.ballots.filter((entry) => !own(entry)) });
    }
  }
  return writes;
}

/** Como mucho, cuántos seudónimos se comprueban por cuenta (cada uno es una consulta: ver `PURGE_BATCH_MAX`). */
export const MAX_PROFILE_IDS = 3;

/**
 * Los seudónimos de la cuenta que se pueden usar para buscar sus filas en los premios. Puro.
 *
 * NO SE FÍA DE LO QUE ESCRIBE EL CLIENTE: el `profileId` de `privateConfig`, de `userMap` y del perfil los escribe su
 * dueño, y los de los demás están a la vista en el archivo público de los premios. Sin esta comprobación, bastaría
 * con copiar el de otra persona y darse de baja para borrar SU fila del archivo. Por eso solo vale un seudónimo que
 * ningún perfil de otra cuenta lleve (`owners`: de quién es cada perfil que lo lleva, por su `uid` o por su id).
 */
export function ownProfileIds(uid: string, owners: ReadonlyMap<string, readonly string[]>): Set<string> {
  return new Set([...owners].filter(([, uids]) => uids.every((owner) => owner === uid)).map(([profileId]) => profileId));
}

/** De quién es un perfil: su campo `uid`, o su id si no lo lleva (legacy). */
function ownerOf(document: FirestoreDocument): string {
  const value = decodeFields(document.fields).uid;
  return typeof value === 'string' && value ? value : docIdOf(document);
}

/** El `profileId` de un documento, si lo tiene. */
function profileIdOf(document: FirestoreDocument | null): string {
  const value = document ? decodeFields(document.fields).profileId : '';
  return typeof value === 'string' ? value : '';
}

/**
 * Borra TODO lo de una cuenta y la cuenta de Auth la última (ver la cabecera).
 *
 * En tres tiempos: se lee todo lo que hace falta (nueve lecturas, más una por seudónimo para comprobarlo, hasta
 * `MAX_PROFILE_IDS`), se limpia KV y se aplica todo de golpe en un `commit`. Son hasta catorce llamadas a Google por
 * cuenta, tenga las amistades que tenga (el tope de Workers Free es 50 por petición; de ahí `PURGE_BATCH_MAX`).
 *
 * La de Auth solo se borra si lo demás salió bien: con ella fuera, lo que quedara ya no tendría dueño que pudiera
 * borrarlo ni aparecería en el censo (sale de Auth). Un `ServiceUnavailableError` se deja pasar: quien llama decide si
 * sigue con la siguiente cuenta o para.
 */
export async function purgeAccount(api: AdminApi, kv: KVNamespace, uid: string, now: number = Date.now()): Promise<PurgeOutcome> {
  const failures: string[] = [];
  const attempt = async <T>(label: string, step: () => Promise<T>): Promise<T | null> => {
    try {
      return await step();
    } catch (error) {
      if (error instanceof ServiceUnavailableError) throw error;
      failures.push(`${label}: ${error instanceof Error ? error.message : 'error'}`);
      return null;
    }
  };

  // 1) Leer. Sin saber qué tiene, no se borra nada: borrar a medias dejaría su identidad en documentos ajenos.
  const [friendships, keys, profiles, privateConfig, userMap, premiosAdmin, results, reveals, logEntries] = await Promise.all([
    attempt('amistades', () => queryCollection(api, 'friendships', { field: 'users', op: 'ARRAY_CONTAINS', value: uid })),
    attempt('depósitos', () => queryCollection(api, 'friendshipKeys', { field: 'requester', op: 'EQUAL', value: uid })),
    // Por el campo `uid`: encuentra el canónico y los legacy con otro id (`foreign-doc-id`).
    attempt('perfiles', () => queryCollection(api, 'profiles', { field: 'uid', op: 'EQUAL', value: uid })),
    attempt('privateConfig', () => getDocument(api, `privateConfig/${uid}`, ['profileId'])),
    attempt('userMap', () => getDocument(api, `userMap/${uid}`, ['profileId'])),
    attempt('premios', () => listCollection(api, 'premiosAdmin', ['uids', 'recipients'])),
    attempt('archivo de premios', () => listCollection(api, 'premiosResults', ['leaderboard'])),
    attempt('votos de premios', () => listCollection(api, 'premiosReveal', ['ballots'])),
    attempt('registro del panel', () => queryCollection(api, 'adminLog', { field: 'targetUid', op: 'EQUAL', value: uid })),
  ]);
  if (failures.length > 0) return { failures, authDeleted: false };

  // 1b) Sus seudónimos, comprobados: ver `ownProfileIds`. Uno que no se pueda comprobar no se usa.
  const candidates = [...new Set([...(profiles || []).map(profileIdOf), profileIdOf(privateConfig), profileIdOf(userMap)].filter(Boolean))]
    .slice(0, MAX_PROFILE_IDS);
  const owners = new Map<string, string[]>();
  await Promise.all(candidates.map((profileId) => attempt('seudónimos', async () => {
    const claimants = await queryCollection(api, 'profiles', { field: 'profileId', op: 'EQUAL', value: profileId });
    owners.set(profileId, claimants.map(ownerOf));
  })));
  if (failures.length > 0) return { failures, authDeleted: false };
  const profileIds = ownProfileIds(uid, owners);

  // 2) KV: los enlaces públicos ANTES que los documentos (como en la baja desde la app) y lo que guarda por uid —el
  //    veto, el ajuste de cuota, el índice de sugeridos y el contador del día (vive 48 h: el de hoy y el de ayer)—.
  await attempt('enlaces', async () => {
    const rows = await listActiveShares(kv, uid);
    await removeShares(kv, uid, rows.map((row) => row.token), { everything: true });
    await Promise.all([
      kv.delete(banKey(uid)),
      kv.delete(overrideKey(uid)),
      kv.delete(relatedIndexKey(uid)),
      kv.delete(dailyQuotaKey(uid, now)),
      kv.delete(dailyQuotaKey(uid, now - 86_400_000)),
    ]);
  });

  // 3) Firestore, de golpe.
  const writes: AdminWrite[] = [
    ...forgetWrites({ uid, profileIds, premiosAdmin: premiosAdmin || [], results: results || [], reveals: reveals || [] }),
    ...(friendships || []).flatMap((document) => [{ delete: `friendships/${docIdOf(document)}` }, { delete: `friendshipKeys/${docIdOf(document)}` }]),
    ...(keys || []).map((document) => ({ delete: `friendshipKeys/${docIdOf(document)}` })),
    ...(profiles || []).map((document) => ({ delete: `profiles/${docIdOf(document)}` })),
    ...(logEntries || []).map((document) => ({ delete: `adminLog/${docIdOf(document)}` })),
    ...OWNED_COLLECTIONS.map((collection) => ({ delete: `${collection}/${uid}` })),
  ];
  await attempt('documentos', () => commitWrites(api, writes));

  if (failures.length > 0) return { failures, authDeleted: false };
  await attempt('cuenta de Google', () => deleteAuthAccount(api, uid));
  return { failures, authDeleted: failures.length === 0 };
}
