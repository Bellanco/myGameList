# Prompt 04 — Social Gist manager

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** la ruta del gist social vive en el mismo `src/model/repository/gistRepository.ts`,
> en el fichero `myGameList.social.json` (`SocialGistData`). **Hoy guarda el `review` COMPLETO**: la función
> `buildReviewExcerpt()` existe pero es **código muerto** (nunca se llama). Este paso introduce el
> **snippet split** (canal público sin campos privados) como destino: conectar/renombrar `buildReviewExcerpt`
> a `buildReviewSnippet` y proyectar `GameItem → PublicGame`. No existe `src/gist/`.

## Prerequisites
Prompts 01–03 completos. Importar desde `src/model/types/`, `src/model/repository/indexedDbRepository.ts`
y la ruta del gist de juegos en `gistRepository.ts` (solo para `distributeIntoChunks` y `createOverflowGist`).

## Output file (ruta real)
`src/model/repository/gistRepository.ts` — extender la **ruta de código del gist social** (mismo módulo).
Fichero ancla `myGameList.social.json` (`SocialGistData`); overflow `myGameList.social-chunk-N.json`.
Este gist es **público** (lectura anónima) y **no contiene** `review`, `score`, `hours`, `steamDeck`, `retry` ni `replayable`.

---

## Constants

```ts
const SOCIAL_MAX_CHUNK_KB  = 700;
const CHUNK_THRESHOLD      = 0.85;
const GIST_API             = 'https://api.github.com/gists';
const SOCIAL_MAIN_FILENAME = 'myGameList.social.json';   // nombre real del gist social
const SNIPPET_MAX_CHARS    = 160;
const FEED_PAGE_SIZE       = 10;
```

---

## La regla del snippet — aplicar en cada función

El snippet se deriva SIEMPRE del review privado, en publicación:
```ts
function buildReviewSnippet(review: string): string {   // reemplaza/conecta el actual buildReviewExcerpt (hoy muerto)
  return review.slice(0, SNIPPET_MAX_CHARS).trimEnd();
}
```
Si `review` está vacío, `snippet = ''` y `hasFullReview = false`.

**El campo `review` (y cualquier campo privado) no debe aparecer NUNCA en lo que se escribe en este gist.**
Aserción runtime antes de cada PATCH:
```ts
const PRIVATE_FIELDS = ['review', 'score', 'hours', 'steamDeck', 'retry', 'replayable'];
function assertNoPrivateFields(obj: unknown, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return;
  for (const f of PRIVATE_FIELDS) {
    if (f in (obj as object)) throw new Error(`campo privado '${f}' en ${path} — el gist social no debe contenerlo`);
  }
  for (const [k, v] of Object.entries(obj)) assertNoPrivateFields(v, `${path}.${k}`);
}
// alias específico mencionado por los agentes/tests:
const assertNoReview = (o: unknown, p = '') => assertNoPrivateFields(o, p);
```
Llamar `assertNoPrivateFields(fileContent)` **antes de cada PATCH** — innegociable.

---

## Forma real de `SocialGistData` y retrocompatibilidad (OBLIGATORIO)

> La forma real **hoy** (verificada en `gistRepository.ts`) es:
> `{ profile: { displayName, sharedLists: Record<TabId, juego[]> }, recommendations[], activity[], updatedAt }`,
> y **guarda el review completo** en `profile.sharedLists[].review` y en `activity[].reviewText`.
> `normalizeSocialGistData` ya reconcilia entradas legacy de `recommendations`↔`activity`.

Reglas de la migración del gist social:
- **Lectura retrocompatible:** seguir leyendo el formato viejo (con `review`/`reviewText`) sin romper;
  al normalizar, derivar `snippet = buildReviewSnippet(reviewText ?? review)` y **descartar** el texto completo
  en memoria pública (no re-exponerlo).
- **Escritura destino:** en `profile.sharedLists` escribir `PublicGame` (sin `review`); en `activity` escribir
  `snippet` en lugar de `reviewText`. Mantener `recommendations` (sin review) y `updatedAt`.
- Añadir `consent` y, si crece, `chunkIndex`/overflow. `assertNoPrivateFields` cubre `review`/`reviewText`/`score`/`hours`.
- No cambiar el nombre del fichero (`myGameList.social.json`); es un cambio de **contenido**, retrocompatible en lectura.

---

## Funciones a implementar (ruta del gist social)

### `publishSocial(meta: LocalMeta): Promise<{ chunksWritten: number; newChunksCreated: number }>`
1. Cargar juegos públicos: `getPublicGames()` → filtrar `shared === true`.
2. Proyectar cada uno a `PublicGame` vía `toPublicGame(game)` (definida aquí, en el repositorio).
3. Ordenar por `updatedAt` (= `_ts`) descendente.
4. `distributeIntoChunks(publicGames, SOCIAL_MAX_CHUNK_KB * CHUNK_THRESHOLD)`.
5. Construir el activity feed desde los mismos juegos públicos:
   - Solo los que tienen `review.length > 0` generan item (con `snippet`, nunca review).
   - Ordenar por `_ts` descendente. Página 1 (`FEED_PAGE_SIZE`) en `myGameList.social.json`; el resto en overflow.
6. Por cada chunk:
   a. Comprobar gist existente en `meta.socialChunks`.
   b. Si no, `createSocialOverflowGist(index)` (`public: true`).
   c. Construir el contenido.
   d. `assertNoPrivateFields(content)`.
   e. PATCH con `If-Match`.
7. `patchMeta({ socialChunks })`.

### `toPublicGame(game: GameItem): PublicGame`
Proyección: copia `id`, `name`, `genres`, `platforms`, `strengths`, `weaknesses`, `years`, `tab`,
`rating` (derivado de `score`), `updatedAt = game._ts`, `snippet = buildReviewSnippet(game.review)`,
`hasFullReview = game.review.length > 0`. **Omite** todos los campos privados. Lanzar si `game.shared !== true`.

### `createSocialOverflowGist(index: number): Promise<string>`
Como `createOverflowGist` pero `public: true`, `description: 'Mi Lista — social chunk ${index}'`,
fichero `myGameList.social-chunk-${index}.json`.

### `buildSocialMainFile(meta, games: Record<number, PublicGame>, feed: ActivityFeed, chunkIndex: ChunkIndex): SocialGistData`
Construye el ancla. Verifica: ningún campo privado en `games`; todo `snippet` ≤ `SNIPPET_MAX_CHARS`;
`profile` viene de `profileCache` o se computa. Incluye `consent`.

### `buildSocialChunkFile(meta, chunkId, games: Record<number, PublicGame>, feed: ActivityFeed): SocialChunkFile`
Chunk de overflow. Mismas restricciones que el ancla (sin campos privados, snippets recortados).

### `readSocialGist(socialGistId, cachedEtag?): Promise<{ data: SocialGistData; etag: string | null; fromCache: boolean }>`
Lee el gist social de otro usuario (lectura anónima, sin `Authorization`; si es el propio y hay token, usarlo para más rate-limit).
304 → devolver de `chunkCache`. OK → guardar en `chunkCache`.

### `readSocialChunk(chunkRef: ChunkRef): Promise<SocialChunkFile>`
GET `GIST_API/{chunkRef.gistId}` sin auth, con caché de ETag en `chunkCache`.

---

## Cómputo de stats (sobre el modelo real: TabId + shared)

```ts
function computeStats(games: GameItem[]): SocialProfile['stats'] {
  const pub = games.filter(g => g.shared === true);
  return {
    totalCompleted: pub.filter(g => /* pestaña 'c' */ true).length,  // según el TabId de origen
    totalExcluded:  pub.filter(g => /* pestaña 'e' */ true).length,
    totalReviews:   pub.filter(g => g.review.length > 0).length,
    avgRating:      computeAvgRating(pub),
  };
}
function computeAvgRating(games: GameItem[]): number {
  const rated = games.filter(g => g.score != null);
  if (!rated.length) return 0;
  return Math.round((rated.reduce((s, g) => s + (g.score ?? 0), 0) / rated.length) * 10) / 10;
}
```
> Nota: el TabId no está en `GameItem` sino en la estructura `TabData`; al proyectar, pasa la pestaña de origen
> (de la lista en la que vive el juego) para `tab`/stats.

## Constraints
- La ruta social no escribe en Firestore (las escrituras del gist social son solo-gist).
- `assertNoPrivateFields` antes de cada PATCH — innegociable.
- Los gists de overflow social se crean con `public: true`.
- El `githubToken` se necesita para escribir, no para leer.
- Reutilizar `distributeIntoChunks` del gist de juegos con umbral propio (`SOCIAL_MAX_CHUNK_KB`).
- `tsc --noEmit` debe pasar tras este paso.
