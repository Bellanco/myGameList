// Firebase Auth y Firestore por REST, con el token de la cuenta de servicio (`serviceAccount.ts`).
//
// Es lo mínimo que necesitan `/api/admin/accounts` y `/api/account`: listar y borrar usuarios de Auth, y listar,
// consultar y borrar documentos de Firestore. Con este token las reglas de Firestore NO se aplican (manda IAM), así
// que cada llamada de aquí tiene que venir de un endpoint que ya haya comprobado quién pide qué.
//
// Los fallos de cupo (429) o de servicio caído (5xx) se lanzan como `ServiceUnavailableError`: el middleware de
// `/api` los convierte en «no disponible ahora» (ver `functions/api/_middleware.ts`).
import { ServiceUnavailableError } from './http';

const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1/projects';
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects';
const REQUEST_TIMEOUT_MS = 8000;

export interface AdminApi {
  token: string;
  projectId: string;
  fetcher?: typeof fetch;
}

async function call(api: AdminApi, url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await (api.fetcher || fetch)(url, {
      ...init,
      headers: { Authorization: `Bearer ${api.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Sin respuesta (red, tiempo agotado): es «no atiende ahora», no un fallo de configuración.
    throw new ServiceUnavailableError('Google no respondió');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ServiceUnavailableError(`Google respondió ${response.status}`);
  }
  return response;
}

async function callJson<T>(api: AdminApi, url: string, init: RequestInit = {}): Promise<T> {
  const response = await call(api, url, init);
  if (!response.ok) {
    // Sin el cuerpo: puede traer identificadores, y esto acaba en la respuesta al panel.
    throw new Error(`Google respondió ${response.status}`);
  }
  return (await response.json()) as T;
}

// ─────────────────────────────── Firebase Auth ───────────────────────────────

/** Un usuario de Firebase Auth, con lo que el panel necesita y nada más. */
export interface AuthAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: number;
  /** Último inicio de sesión. */
  lastLoginAt: number;
  /** Última renovación del token: es la que se mueve cada vez que se abre la app con la sesión iniciada. */
  lastRefreshAt: number;
  disabled: boolean;
  admin: boolean;
}

interface RawAuthUser {
  localId?: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  createdAt?: string;
  lastLoginAt?: string;
  lastRefreshAt?: string;
  disabled?: boolean;
  customAttributes?: string;
}

/** El claim de administrador, con el mismo criterio estricto que `hasAdminClaim` (contra `true`). */
function readAdminAttribute(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { admin?: unknown }).admin === true;
  } catch {
    return false;
  }
}

export function toAuthAccount(raw: RawAuthUser): AuthAccount | null {
  const uid = String(raw.localId || '');
  if (!uid) return null;
  const refreshed = raw.lastRefreshAt ? Date.parse(raw.lastRefreshAt) : 0;
  return {
    uid,
    email: String(raw.email || ''),
    displayName: String(raw.displayName || ''),
    photoURL: String(raw.photoUrl || ''),
    createdAt: Number(raw.createdAt) || 0,
    lastLoginAt: Number(raw.lastLoginAt) || 0,
    lastRefreshAt: Number.isFinite(refreshed) ? refreshed : 0,
    disabled: raw.disabled === true,
    admin: readAdminAttribute(raw.customAttributes),
  };
}

/** Todos los usuarios de Auth, página a página (la API da hasta 1.000 por página). */
export async function listAuthAccounts(api: AdminApi): Promise<AuthAccount[]> {
  const accounts: AuthAccount[] = [];
  let pageToken = '';
  // Tope de seguridad: 50 páginas son 50.000 cuentas, muy por encima de lo que cabe en el plan gratuito.
  for (let page = 0; page < 50; page += 1) {
    const query = new URLSearchParams({ maxResults: '1000' });
    if (pageToken) query.set('nextPageToken', pageToken);
    const body = await callJson<{ users?: RawAuthUser[]; nextPageToken?: string }>(
      api,
      `${AUTH_BASE}/${api.projectId}/accounts:batchGet?${query}`,
    );
    for (const raw of body.users || []) {
      const account = toAuthAccount(raw);
      if (account) accounts.push(account);
    }
    pageToken = body.nextPageToken || '';
    if (!pageToken || (body.users || []).length === 0) break;
  }
  return accounts;
}

/** Borra un usuario de Auth. Si ya no existe, no es un error: el resultado buscado es que no esté. */
export async function deleteAuthAccount(api: AdminApi, uid: string): Promise<void> {
  const response = await call(api, `${AUTH_BASE}/${api.projectId}/accounts:delete`, {
    method: 'POST',
    body: JSON.stringify({ localId: uid }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (body?.error?.message === 'USER_NOT_FOUND') return;
  throw new Error(`Auth no borró la cuenta (${response.status})`);
}

// ─────────────────────────────── Firestore ───────────────────────────────

/** Un valor de Firestore REST, solo con los tipos que se leen aquí. */
export interface FirestoreValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  /** La versión del documento: se usa como precondición al reescribirlo (`commitWrites`). */
  updateTime?: string;
}

/** Un valor REST a JavaScript. Las marcas de tiempo salen en milisegundos. */
export function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.timestampValue !== undefined) return Date.parse(value.timestampValue) || 0;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields);
  return null;
}

/**
 * JavaScript a un valor REST, para escribir. Los números enteros van como `integerValue` y el resto como `doubleValue`,
 * que es como los guarda el SDK del cliente: así reescribir un documento no le cambia el tipo a ningún campo.
 */
export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) } };
  }
  return { nullValue: null };
}

export function decodeFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = decodeValue(value);
  return out;
}

/** El id de un documento a partir de su nombre completo. */
export function docIdOf(document: FirestoreDocument): string {
  return document.name.slice(document.name.lastIndexOf('/') + 1);
}

function documentsBase(api: AdminApi): string {
  return `${FIRESTORE_BASE}/${api.projectId}/databases/(default)/documents`;
}

/** Un documento por su ruta relativa (`privateConfig/abc`), con solo los campos pedidos; `null` si no existe. */
export async function getDocument(api: AdminApi, path: string, fields: readonly string[] = []): Promise<FirestoreDocument | null> {
  const query = new URLSearchParams();
  for (const field of fields) query.append('mask.fieldPaths', field);
  const response = await call(api, `${documentsBase(api)}/${path}${fields.length ? `?${query}` : ''}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Google respondió ${response.status}`);
  return (await response.json()) as FirestoreDocument;
}

/** Todos los documentos de una colección raíz, con solo los campos pedidos (`fields` vacío = todos). */
export async function listCollection(api: AdminApi, collection: string, fields: readonly string[] = []): Promise<FirestoreDocument[]> {
  const documents: FirestoreDocument[] = [];
  let pageToken = '';
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ pageSize: '300' });
    for (const field of fields) query.append('mask.fieldPaths', field);
    if (pageToken) query.set('pageToken', pageToken);
    const body = await callJson<{ documents?: FirestoreDocument[]; nextPageToken?: string }>(
      api,
      `${documentsBase(api)}/${collection}?${query}`,
    );
    documents.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return documents;
}

/** Los documentos de una colección raíz que cumplen UN filtro de campo. */
export async function queryCollection(
  api: AdminApi,
  collection: string,
  filter: { field: string; op: 'EQUAL' | 'ARRAY_CONTAINS'; value: string },
): Promise<FirestoreDocument[]> {
  const rows = await callJson<Array<{ document?: FirestoreDocument }>>(api, `${documentsBase(api)}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: { stringValue: filter.value } } },
      },
    }),
  });
  return rows.flatMap((row) => (row.document ? [row.document] : []));
}

/**
 * Una escritura del `commit`: borrar un documento, o reescribir algunos de sus campos solo si nadie lo ha tocado
 * desde que se leyó (`updateTime`). Rutas relativas (`profiles/abc`).
 */
export type AdminWrite =
  | { delete: string }
  | { update: string; fields: Record<string, unknown>; updateTime?: string };

/**
 * Aplica escrituras en UNA llamada (`documents:commit`), de 500 en 500, que es el tope de Firestore.
 *
 * Una llamada y no una por documento por el tope de subpeticiones de Workers Free (50 por petición): con un `DELETE`
 * por documento, borrar unas pocas cuentas con amistades ya lo pasaba. Cada tanda es atómica: o se aplica entera o
 * no se aplica nada. Borrar lo que no existe no es un error (no lleva precondición); reescribir algo que ha cambiado
 * desde que se leyó, sí, y entonces falla la tanda entera.
 */
export async function commitWrites(api: AdminApi, writes: readonly AdminWrite[]): Promise<void> {
  const name = (path: string) => `projects/${api.projectId}/databases/(default)/documents/${path}`;
  const deleted = new Set<string>();
  const body = writes.flatMap((write): Array<Record<string, unknown>> => {
    if ('delete' in write) {
      if (deleted.has(write.delete)) return [];
      deleted.add(write.delete);
      return [{ delete: name(write.delete) }];
    }
    return [{
      update: { name: name(write.update), fields: Object.fromEntries(Object.entries(write.fields).map(([key, value]) => [key, encodeValue(value)])) },
      updateMask: { fieldPaths: Object.keys(write.fields) },
      ...(write.updateTime ? { currentDocument: { updateTime: write.updateTime } } : {}),
    }];
  });
  for (let index = 0; index < body.length; index += 500) {
    await callJson(api, `${documentsBase(api)}:commit`, { method: 'POST', body: JSON.stringify({ writes: body.slice(index, index + 500) }) });
  }
}
