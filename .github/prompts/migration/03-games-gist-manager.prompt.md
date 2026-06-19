# Prompt 03 — Games Gist manager

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** todo el I/O de gists (juegos **y** social) vive en
> `src/model/repository/gistRepository.ts` — un único módulo, con `myGames.json` (gist de juegos)
> y `myGameList.social.json` (gist social), **un fichero por gist, sin chunking**. Ya usa ETags
> (`If-Match` / `304`). Este paso evoluciona la ruta del **gist de juegos** dentro de ese módulo
> y añade chunking como destino. No existe `src/gist/`.

## Prerequisites
Prompts 01 y 02 completos. Importar desde `src/model/types/` y `src/model/repository/indexedDbRepository.ts`.

## Output file (ruta real)
`src/model/repository/gistRepository.ts` — extender la **ruta de código del gist de juegos**
(no crear un fichero nuevo). El fichero ancla pasa a llamarse `myGames.json`; los excedentes,
`myGames-chunk-N.json`.

---

## Constants

```ts
const GAMES_MAX_CHUNK_KB = 800;
const CHUNK_THRESHOLD     = 0.85;   // abrir chunk nuevo al 85% del máximo
const GIST_API            = 'https://api.github.com/gists';
const GAMES_MAIN_FILENAME = 'myGames.json';   // nombre real del gist de juegos
```

---

## Tipos locales a este módulo

```ts
interface PullResult { fromCache: boolean; changed: boolean; newEtag: string | null; }
interface PushResult { chunksWritten: number; newChunksCreated: number; }
```

---

## Funciones a implementar (ruta del gist de juegos)

### `pullGames(meta: LocalMeta): Promise<PullResult>`
1. GET `GIST_API/{meta.gamesGistId}` con `Authorization` e `If-None-Match: meta.gamesEtag`.
2. Si 304 → `{ fromCache: true, changed: false, newEtag: null }`.
3. Parsear `myGames.json` con **detección de formato y desenvoltura retrocompatible** (ver sección siguiente):
   `unwrapGamesFile(parsed)` → `TabData` plano, y solo entonces `migrateData(tabData)`.
4. Si `chunkIndex.chunks.length > 1`, traer todos los chunks de overflow en paralelo
   (GET `GIST_API/{chunkRef.gistId}`, respetando su ETag desde `chunkCache`).
5. Recolectar todos los `games` (`Record<number, GameItem>`) de todos los chunks.
6. `mergeRemoteGames(allRemoteGames)`.
7. `mergeRemoteDeleted(anchor.deletedIndex)`.
8. `patchMeta({ gamesEtag, lastGistPull })`.
9. Devolver `{ fromCache: false, changed: true, newEtag }`.

### `pushGames(meta: LocalMeta): Promise<PushResult>`
1. Cargar todos los juegos: `getAllGames()` (`GameItem[]`).
2. `distributeIntoChunks(games, GAMES_MAX_CHUNK_KB * CHUNK_THRESHOLD)` → `{ main, c1?, c2?, … }`.
3. Por cada grupo de chunk:
   a. Determinar el gistId destino desde `meta.gamesChunks`.
   b. Si es nuevo (sin `ChunkRef`), `createOverflowGist('games', index)` (gist privado) y registrarlo
      en `meta.gamesChunks` y en Firestore `privateConfig` (vía `firebaseRepository.ts`).
   c. Construir el contenido (`buildGamesMainFile` o `buildGamesChunkFile`).
   d. PATCH `GIST_API/{targetGistId}` con `If-Match`.
4. Tras todos los PATCH OK → `patchMeta({ gamesChunks, lastGistPull })`.
5. Devolver `{ chunksWritten, newChunksCreated }`.

### `distributeIntoChunks(games: GameItem[], thresholdBytes: number): Record<string, GameItem[]>`
- Iterar juegos ordenados por `_ts` ascendente (los más antiguos en `main`, los nuevos en el último chunk).
- Acumular tamaño con `new Blob([JSON.stringify(game)]).size`.
- Al superar `thresholdBytes`, abrir bucket nuevo (`c1`, `c2`, …).
- Devolver `{ main: [...], c1?: [...], … }`.

### `createOverflowGist(type: 'games' | 'social', index: number): Promise<string>`
- POST a `GIST_API`: `public: false` para juegos (siempre privados),
  `description: 'Mi Lista — games chunk ${index}'`, contenido inicial vacío de `myGames-chunk-${index}.json`.
- Devolver el nuevo gistId y registrarlo en Firestore `privateConfig` vía `firebaseRepository.ts`.

### `buildGamesMainFile(meta: LocalMeta, games: GameItem[]): GamesMainFile`
- JSON ancla completo. `games` solo los del chunk principal.
- `chunkIndex` refleja `meta.gamesChunks`. `integrity.checksum` = CRC32 del objeto `games` serializado.
- `syncMeta.lamport = meta.lamport + 1`. Incluir `deletedIndex` (tombstones).

### `buildGamesChunkFile(meta: LocalMeta, chunkId: string, games: GameItem[]): GamesChunkFile`
- Fichero de overflow. **No** incluye `chunkIndex` ni `deletedIndex`.

---

## Retrocompatibilidad de formato (OBLIGATORIO — evita pérdida de datos)

> Hoy `myGames.json` es un `TabData` **plano sin envoltorio**; `migrateData` lee `.c/.v/.e/.p` directo.
> `GamesMainFile` (con `schemaVersion`/`chunkIndex`/`deletedIndex`) es el formato **destino**. Si se escribe
> el envoltorio mientras un lector espera plano → listas vacías → **sobrescritura con pérdida total**.

**Lectura — desenvoltura defensiva ANTES de `migrateData`:**
```ts
function unwrapGamesFile(parsed: unknown): unknown {
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    // Formato destino: { schemaVersion, fileType:'games-main', games, deletedIndex, chunkIndex }
    if ('schemaVersion' in o && ('games' in o || 'fileType' in o)) {
      return tabDataFromMainFile(o);   // reconstruir TabData (incl. chunks si chunkIndex.length>1)
    }
  }
  return parsed;   // formato viejo: TabData plano → tal cual
}
// readGist: const tabData = unwrapGamesFile(JSON.parse(raw)); return { data: migrateData(tabData), etag };
```
Si el formato no se reconoce, **lanzar error** (no devolver `{}` silenciosamente).

**Escritura — transición en 2 fases (no romper a quien no ha actualizado):**
- **Fase A (compat):** la versión nueva **lee** ambos formatos pero **escribe el plano `TabData`** (como hoy).
  Solo así un cliente viejo puede seguir leyendo el gist.
- **Fase B (corte):** cuando el 100% de los clientes ya leen ambos formatos, activar la escritura de
  `GamesMainFile`/chunks (flag de versión). Es un cambio de una sola dirección.
- Al cambiar de formato, el `etag` previo deja de ser válido: **forzar el primer ciclo** (ignorar etag,
  `force=true`) y marcar dirty para reescribir, en lugar de fiarse de un 304.
- **Conservar `migrateData`** (traducción de nombres legacy español→inglés) en el camino nuevo.

## Error handling
- Envolver errores de red en una clase `GistError` con `status`, `message`, `retryable`.
- 409 en PATCH → retryable, volver sin actualizar meta.
- 404 en el ancla → no-retryable (gist borrado; el usuario debe re-autenticar).
- Nunca tragarse errores (log + rethrow o `StatusNotice`).

## Constraints
- La ruta de código del **gist de juegos** no debe llamar a las funciones de escritura del **gist social**
  dentro del mismo módulo (mantener los caminos separados aunque compartan fichero).
- Sin llamadas directas a Firestore salvo vía `firebaseRepository.ts`.
- Todo PATCH incluye `If-Match` (ETag) para evitar sobrescrituras concurrentes.
- El `githubToken` viene de `meta.githubToken` — nunca hardcodeado ni de env.
- `tsc --noEmit` debe pasar tras este paso.
