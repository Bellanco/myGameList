// Esquema de claves de KV para las reseñas compartidas, en un solo sitio (ver docs/plan-compartir-resenas.md §2).
//
// Cada clave existe por un motivo distinto y NINGUNA es redundante:
//
//   share:{token}        el artículo público. Lo lee cualquiera con el enlace → NO puede llevar identidad.
//   owner:{token}        de quién es ese enlace. Privado: lo necesitan la retirada desde /admin (que solo conoce
//                        el token), la purga al vetar y la limpieza del índice al borrar.
//   user:{uid}:{token}   índice del propietario. La pantalla de gestión y el recuento de cuota se resuelven con
//                        UN list() por prefijo, sin leer un solo artículo, porque los datos de la fila viajan en
//                        la `metadata` de la clave.
//   quota:{uid}:{fecha}  contador diario de creaciones (anti-abuso).
//   quota:override:{uid} ajuste individual de cuota puesto por el administrador.
//   ban:{uid}            veto de compartir.
//
// Los tres primeros caducan solos con el TTL del enlace, así que no hay tarea de limpieza que mantener: lo que
// caduca desaparece de KV sin que nadie barra.

/** Tipos mínimos de KV. Cloudflare los inyecta en runtime; aquí se declaran para no depender de @cloudflare/workers-types. */
export interface KVListKey<M = unknown> {
  name: string;
  expiration?: number;
  metadata?: M;
}
export interface KVListResult<M = unknown> {
  keys: KVListKey<M>[];
  list_complete: boolean;
  cursor?: string;
}
export interface KVNamespace {
  get(key: string, type?: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list<M = unknown>(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult<M>>;
}

export interface Env {
  SHARES: KVNamespace;
  FIREBASE_PROJECT_ID?: string;
  ADMIN_EMAIL?: string;
}

export const shareKey = (token: string): string => `share:${token}`;
export const ownerKey = (token: string): string => `owner:${token}`;
export const userSharePrefix = (uid: string): string => `user:${uid}:`;
export const userShareKey = (uid: string, token: string): string => `user:${uid}:${token}`;
export const overrideKey = (uid: string): string => `quota:override:${uid}`;
export const banKey = (uid: string): string => `ban:${uid}`;

/** Contador diario. La fecha va en UTC a propósito: el día del servidor no depende de dónde esté el usuario. */
export function dailyQuotaKey(uid: string, now: number): string {
  return `quota:${uid}:${new Date(now).toISOString().slice(0, 10)}`;
}

/** Lo que viaja en la `metadata` de `user:{uid}:{token}`: lo justo para pintar una fila y contar cuota. */
export interface ShareIndexMetadata {
  gameId: number;
  gameName: string;
  createdAt: number;
  expiresAt: number;
}
