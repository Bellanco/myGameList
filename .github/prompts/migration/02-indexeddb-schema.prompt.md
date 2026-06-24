# Prompt 02 — IndexedDB schema (raw IndexedDB)

> Adaptado al stack real (React 19 / hooks / IndexedDB en crudo / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real (verificado):** la BD es **`myGameList`, versión 2**, con DOS object stores:
> `appState` (guarda el `StoragePayload` ENTERO bajo la clave `'latest'` — no por-juego) y `cryptoKeys`.
> El almacenamiento local usa **IndexedDB en crudo** (sin Dexie) repartido entre `idbConnectionRepository.ts`
> (conexión + `onupgradeneeded`), `indexedDbRepository.ts` (lecturas/escrituras) y `localRepository.ts`
> (fallback a localStorage `mis-listas-v12-unified` + legacy v11–v8 con migración automática).
> `migrateRepository.ts` normaliza nombres de campos legacy (español→inglés).
>
> ⚠️ **NO romper los datos locales existentes.** Subir la versión de la BD **2 → 3**, **conservar**
> `appState` y `cryptoKeys`, y en `onupgradeneeded` **migrar** el `StoragePayload` de `appState['latest']`
> al nuevo modelo (rellenar el store `games`, `meta`, etc.) **sin borrar** `appState` hasta confirmar la
> migración. Si los stores nuevos ya existen, no recrearlos.

## Prerequisites
Prompt 01 completo. Importar tipos desde `src/model/types/`.

## Task
Evolucionar el esquema y los helpers de acceso a IndexedDB usando la **API nativa**
(`indexedDB.open`, `transaction`, `objectStore`). IndexedDB es la fuente de verdad local.
**No** añadir Dexie ni ninguna dependencia nueva (regla del proyecto: no añadir deps sin preguntar).

## Output files (rutas reales)
- `src/model/repository/idbConnectionRepository.ts` — apertura/versionado/upgrade de la BD (object stores)
- `src/model/repository/indexedDbRepository.ts`     — helpers de juegos / meta / cola de sync / caché de chunks
- `src/model/repository/localRepository.ts`         — fallback localStorage + migración del payload legacy

---

## Object stores (BD `myGameList`, versión 3)

Conservar los existentes y añadir los nuevos:
```
appState     (EXISTENTE — conservar)  clave manual 'latest' → StoragePayload entero
cryptoKeys   (EXISTENTE — conservar)  claves de cifrado (se reutiliza para el token cifrado)

games        keyPath: id (number)   índices: tab, shared, _ts, [tab+shared]
meta         keyPath: _key ('singleton') → LocalMeta
syncQueue    keyPath: id (string)   índices: type, createdAt, nextRetry
chunkCache   keyPath: gistId (string)  índice: cachedAt
profileCache keyPath: profileId (string)  índice: cachedAt
conflicts    keyPath: id (string)   índice: gameId, resolved   → SyncConflict (lo usa el paso 06)
```

Versionado en `onupgradeneeded` (2 → 3):
- `if (!db.objectStoreNames.contains(name)) db.createObjectStore(...)` para cada store nuevo.
- **NO** tocar/borrar `appState` ni `cryptoKeys`.
- **Migrar** el `StoragePayload` de `appState['latest']` al nuevo modelo (poblar `games`, `meta`)
  dentro del propio upgrade o en un paso de arranque idempotente, **sin** borrar `appState` hasta
  confirmar. La app debe seguir funcionando aunque la migración a los stores nuevos no haya corrido aún
  (leer de `appState` como fuente de verdad durante la transición).

Stub de migración legacy (en `localRepository.ts` / `migrateRepository.ts`):
- Leer el payload legacy de localStorage (`mis-listas-v12-unified` + legacy v11–v8) si existe.
- Normalizarlo con `migrateRepository.ts` e insertarlo.
- Conservar el fallback a localStorage (offline-first dual). Si está vacío o falla, continuar en silencio.

---

## Helpers de juegos (en `indexedDbRepository.ts`)

Cada función recibe la conexión (vía `idbConnectionRepository`). Tipos: `GameItem` (no `Game`),
`id: number`, reloj `_ts`. **No** existe `shareLevel`/`status`: la pertenencia a lista es `TabId`
(`c|v|e|p`) y el opt-in público es `shared`.

```ts
/** Todos los juegos, ordenados por _ts descendente */
getAllGames(): Promise<GameItem[]>

/** Solo juegos con shared === true (proyección al canal público), por _ts desc */
getPublicGames(): Promise<GameItem[]>

/** Juegos modificados después de un timestamp (_ts) */
getGamesSince(since: number): Promise<GameItem[]>

/**
 * Upsert de un juego. Fija _ts = Date.now() e incrementa _v.
 * Encola automáticamente una entrada 'upsertGame' en syncQueue.
 */
upsertGame(game: Omit<GameItem, '_ts' | '_v'>): Promise<GameItem>

/**
 * Borrado lógico: quita de `games`, añade tombstone a TabData.deleted
 * (con deletedAt), y encola 'deleteGame' en syncQueue.
 */
deleteGame(id: number): Promise<void>

/** Merge de juegos remotos (de un chunk). Resuelve conflictos por _ts (más reciente gana). */
mergeRemoteGames(remote: Record<number, GameItem>): Promise<{ updated: number; skipped: number }>

/** Merge de tombstones remotos. Borra el juego local si remote.deletedAt > game._ts */
mergeRemoteDeleted(deletedIndex: Record<number, { deletedAt: number }>): Promise<number>
```

> La lógica de merge canónica vive en `syncRepository.ts` (paso 06); estos helpers la invocan
> o exponen primitivas atómicas. No dupliques el algoritmo CRDT.

## Helpers de meta (LocalMeta — en `indexedDbRepository.ts`)

```ts
getMeta(): Promise<LocalMeta | undefined>
setMeta(meta: LocalMeta): Promise<void>
patchMeta(patch: Partial<LocalMeta>): Promise<void>   // lee, fusiona y reescribe en una sola transacción
```

## Cola de sync (syncQueue)

```ts
enqueue(op: Omit<SyncOp, 'id' | 'createdAt' | 'attempts' | 'nextRetry'>): Promise<void>
getAllOps(): Promise<SyncOp[]>
getPendingOps(): Promise<SyncOp[]>   // attempts < 3 y nextRetry <= Date.now()
markOpFailed(id: string): Promise<void>   // incrementa attempts, fija nextRetry (backoff)
clearProcessedOps(ids: string[]): Promise<void>
```

## Caché de chunks (chunkCache)

```ts
interface CachedChunk {
  gistId: string;
  data: SocialGistData | SocialChunkFile | GamesMainFile | GamesChunkFile;
  etag: string | null;
  cachedAt: number;
}

getCachedChunk(gistId: string): Promise<CachedChunk | undefined>
setCachedChunk(gistId: string, data: unknown, etag: string | null): Promise<void>
evictStaleChunks(maxAgeMs?: number): Promise<number>   // por defecto 24h
```

## Constraints
- API nativa de IndexedDB únicamente (transacciones `readwrite`, `objectStore`, `IDBRequest`). **Sin Dexie.**
- Toda operación con varias escrituras va dentro de **una** transacción; `mergeRemoteGames` debe ser atómica.
- Conexión expuesta como singleton a través de `idbConnectionRepository.ts` (reutilizar la apertura, limpiar listeners).
- Conservar el fallback a localStorage de `localRepository.ts` (offline-first dual).
- `Date.now()` es válido aquí (código de app, no script de workflow).
- JSDoc en cada función exportada (convención del proyecto).
- `tsc --noEmit` debe pasar tras este paso.
