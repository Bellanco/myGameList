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

/**
 * Recorre TODAS las páginas de un `list()` de KV y devuelve sus claves juntas.
 *
 * KV pagina siempre: un `limit` alto no es "todo", es "hasta aquí", y lo que pase de ahí se pierde en silencio.
 * Eso ya mordió en el censo de `/api/share/all`, que pedía vetos y ajustes con `limit: 1000` y sin cursor: pasado
 * ese número, el panel pintaba como NO vetado a alguien que sí lo estaba. Un fallo de moderación mudo es peor que
 * uno ruidoso.
 *
 * Recibe la función que trae una página en vez del `KVNamespace` para que el bucle se pueda probar sin simular el
 * almacén (ver la nota de `tests/unit/shareFunctions.test.ts` sobre por qué aquí no se simula KV).
 */
export async function drainPages<M>(
  fetchPage: (cursor?: string) => Promise<KVListResult<M>>,
): Promise<KVListKey<M>[]> {
  const keys: KVListKey<M>[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

export const shareKey = (token: string): string => `share:${token}`;
export const ownerKey = (token: string): string => `owner:${token}`;
export const userSharePrefix = (uid: string): string => `user:${uid}:`;
export const userShareKey = (uid: string, token: string): string => `user:${uid}:${token}`;
export const overrideKey = (uid: string): string => `quota:override:${uid}`;
export const banKey = (uid: string): string => `ban:${uid}`;

/**
 * CUPO DE CARÁTULAS LEVANTADO para una IP. Lo escribe `/api/cover-quota` cuando quien llama demuestra, con su
 * ID token, que su perfil es del rango más alto; lo lee `/cover` solo cuando esa IP ha agotado su cupo.
 *
 * Va por IP y no por usuario porque las imágenes se piden con `<img src>`, que no puede llevar cabeceras: meter
 * una sesión en la URL la volvería distinta para cada persona y rompería la caché compartida —y la del service
 * worker, que guarda por URL—, que es lo que hace que una carátula se descargue UNA vez para todo el mundo.
 *
 * La contrapartida, dicha claramente: tras una red compartida (NAT), quien salga por la misma IP hereda el cupo
 * levantado mientras dure. Lo que se hereda es la capacidad de resolver carátulas nuevas, nada más: ni datos, ni
 * sesión, ni acceso. Y caduca solo.
 */
export const coverExemptionKey = (ip: string): string => `igdb:cupo-libre:v1:${ip}`;

/**
 * CUÁNTAS CARÁTULAS NUEVAS PUEDE RESOLVER EL SERVICIO ENTERO EN UN DÍA, y por qué este tope existe además del
 * que ya hay por IP.
 *
 * No miden lo mismo ni protegen lo mismo. El de `/cover` es por IP y por HORA porque acota a un abusador
 * concreto contra la cuota de IGDB, que se mide por segundo. Este es global y DIARIO porque lo que aquí se
 * agota es el presupuesto de ESCRITURAS de KV: 1.000 al día en el plan gratuito, y ese techo es de la CUENTA,
 * así que lo comparten estas carátulas y los enlaces de reseñas compartidas. Un tope tiene que medirse en la
 * unidad del recurso que protege.
 *
 * Por qué 700. Resolver un juego nuevo cuesta una escritura (el emparejamiento), más las del contador: con el
 * lote de 50 son ~14 al día, o sea ~714 en total. Quedan ~285 para compartir —unas 70 publicaciones diarias a
 * cuatro escrituras cada una, muy por encima del uso real— y aun así caben DOS bibliotecas grandes nuevas en un
 * mismo día, que es el caso legítimo más caro que existe (la de referencia tiene 302 juegos).
 *
 * Sigue siendo un tope BLANDO, por lo mismo que el de IP: KV no tiene incremento atómico y sus lecturas llegan
 * con retraso. Acota el gasto sostenido, que es lo que vacía el presupuesto; no el segundo exacto en que corta.
 */
export const COVER_DAILY_BUDGET = 700;

/**
 * Contador del día para ese tope. La fecha va en UTC igual que `dailyQuotaKey`: el día del servicio no depende
 * de dónde esté quien mira sus carátulas.
 *
 * Vive aquí, y no dentro de `functions/cover.ts`, porque tiene DOS lectores: quien gasta (el endpoint de las
 * carátulas) y quien mide (`/api/cover-stats`, que lo enseña en la pantalla de administración). Una clave
 * copiada en dos sitios es una clave que un día deja de ser la misma.
 */
export function coverDailyQuotaKey(now: number): string {
  return `igdb:cupo-dia:v1:${new Date(now).toISOString().slice(0, 10)}`;
}

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
