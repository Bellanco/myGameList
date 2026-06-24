# Prompt 01 — Core data models

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** todos los tipos viven HOY en `src/model/types/game.ts`
> (`GameItem` con `id: number` y reloj `_ts`, `TabData` por pestañas `c|v|e|p`, `DeletedItem`,
> `SyncConfig`, `StoragePayload`). **No hay** `PublicGame`, `profileId`, `snippet`, chunking ni
> versionado explícito. Este paso EXTIENDE ese modelo hacia el destino moderno **sin romper**
> lo existente: el `id` numérico y el reloj `_ts` se conservan; lo nuevo se añade de forma aditiva.

## Task
Define los tipos TypeScript que el resto de la migración usará como contrato.
Son la frontera entre todos los módulos: defínelos primero, todo lo demás importa de aquí.
Mantén compatibilidad con el `GameItem`/`TabData` actuales (no cambies `id: number` a UUID,
no elimines `_ts`); el pseudónimo público es `profileId`, **no** el id del juego.

## Output files (rutas reales)
- `src/model/types/game.ts`      — **ya existe**: extender de forma aditiva
- `src/model/types/social.ts`    — nuevo: proyección pública + perfil + feed
- `src/model/types/firestore.ts` — nuevo: índice público (index-only)
- `src/model/types/gist.ts`      — nuevo: chunking de gists
- `src/model/types/local.ts`     — nuevo: metadatos solo-IndexedDB + cola de sync

---

## `src/model/types/game.ts` (extender lo existente)

Conserva las definiciones actuales (`TabId`, `GameItem`, `DeletedItem`, `TabData`,
`StoragePayload`, `SyncConfig`, `TabSort`, `ToolbarFilters`, `StatusNotice`) y **añade**
estos campos opcionales (aditivos — no rompen merge ni almacenamiento actuales):

```ts
type TabId = 'c' | 'v' | 'e' | 'p';   // completed / playing(en curso) / excluded / pending

interface GameItem {
  id: number; _ts: number;            // _ts = reloj CRDT (última modificación). SE CONSERVA.
  name: string; platforms: string[]; genres: string[];
  steamDeck: boolean;                 // ⚠️ privado — nunca en gist social ni Firestore
  review: string;                     // ⚠️ privado — texto completo, solo gist de juegos / IndexedDB
  score?: number;                     // ⚠️ privado — nunca en gist social ni Firestore
  years?: number[];
  strengths?: string[]; weaknesses?: string[]; reasons?: string[];
  replayable?: boolean;               // ⚠️ privado — nunca en canal público
  retry?: boolean;                    // ⚠️ privado — nunca en canal público
  hours?: number | null;              // ⚠️ privado — nunca en gist social ni Firestore

  // --- Destino (aditivo, opcional para no romper datos legacy) ---
  _v?: number;                        // versión entera, incrementa en cada edición (opcional)
  shared?: boolean;                   // opt-in: este juego se proyecta al canal público
}

interface DeletedItem {
  id: number; _ts: number;
  deletedAt?: number;                 // destino: marca de borrado explícita (aditivo)
}

interface TabData { c: GameItem[]; v: GameItem[]; e: GameItem[]; p: GameItem[]; deleted: DeletedItem[]; updatedAt: number; }
```

El reloj CRDT sigue siendo `_ts` (number) por item + tombstones en `TabData.deleted`.
Merge = `_ts` más reciente gana, tombstones respetados. `_v` es metadato auxiliar, no sustituye a `_ts`.

---

## `src/model/types/social.ts` (nuevo — canal público)

```ts
import type { GameItem, TabId } from './game';

/**
 * Proyección pública de un juego — se guarda en el gist social y en Firestore.
 * NUNCA contiene `review`, `score`, `hours`, `steamDeck`, `retry` ni `replayable`.
 * `snippet` se deriva del review en tiempo de publicación (≤160 chars).
 */
interface PublicGame {
  id: number;
  name: string;
  genres: string[];
  platforms: string[];
  strengths?: string[];
  weaknesses?: string[];
  tab: TabId;                 // pestaña/estado (mapea c|v|e|p)
  rating: number | null;      // derivado de score (puede redondearse/ocultarse según consentimiento)
  years?: number[];
  snippet: string;            // ≤160 chars, derivado de review — ⚠️ nunca el review completo
  hasFullReview: boolean;     // indica que existe review privado (sin exponerlo)
  updatedAt: number;          // = _ts del item de origen
}

interface SocialProfile {
  profileId: string;          // UUID v4 — pseudónimo público, NO el uid de Firebase
  displayName: string;
  avatarHash: string;         // hash determinista (no expone email/uid)
  private: boolean;
  favoriteGames: number[];    // ids de juego
  visibility: { hiddenTabs: TabId[]; hideGameTime: boolean };
  stats: { totalCompleted: number; totalExcluded: number; totalReviews: number; avgRating: number };
  _modified: number;
  _v: number;
}

interface ActivityFeedItem {
  key: string;
  type: 'review';
  gameId: number;
  gameName: string;
  rating: number | null;
  snippet: string;            // ≤160 chars — ⚠️ nunca review completo
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

interface ActivityFeed { page: number; pageSize: number; totalCount: number; hasMore: boolean; items: ActivityFeedItem[]; }

interface ConsentConfig {
  version: string;
  agreedAt: number;
  scope: string[];
  retentionDays: number;
  autoExpireAt: number;
  revokedFields: string[];
}

/**
 * Contenido del fichero `myGameList.social.json` (gist social, público).
 * ⚠️ FORMA REAL ACTUAL (verificada en gistRepository.ts) — NO inventar otra:
 *   { profile, recommendations, activity, updatedAt }
 *   - `profile.sharedLists` agrupa juegos por TabId y **hoy incluye `review` completo**.
 *   - `activity[]` son entradas con `reviewText` (review completo) hoy.
 * El destino del snippet-split: en `sharedLists` y `activity` el review completo se sustituye por
 * `snippet` (≤160) — `review`/`reviewText` dejan de escribirse. Se añade `consent` y, si crece, `chunkIndex`.
 * La lectura debe seguir aceptando la forma vieja (con review/reviewText) y normalizarla.
 */
interface SocialGistData {
  profile: SocialGistProfile;          // perfil + sharedLists por TabId
  recommendations: SocialRecommendationEntry[];
  activity: SocialActivityEntry[];     // destino: snippet en vez de reviewText
  updatedAt: number;
  // --- Destino (aditivo) ---
  schemaVersion?: 2;
  consent?: ConsentConfig;
  chunkIndex?: ChunkIndex;             // solo si hay overflow
}

interface SocialGistProfile {
  profileId?: string;                  // destino: pseudónimo (hoy se usa uid/displayName)
  displayName: string;
  avatarHash?: string;
  sharedLists: Record<TabId, PublicGame[]>;   // destino: PublicGame (sin review); hoy lleva review completo
}

interface SocialRecommendationEntry { gameId: number; gameName: string; rating: number | null; /* sin review */ }
interface SocialActivityEntry {
  gameId: number; gameName: string; rating: number | null;
  snippet: string;                     // destino (≤160). Hoy el campo real es `reviewText` (completo) — migrar en lectura.
  createdAt: number; updatedAt: number;
}
```

> **Tres tipos de perfil — NO confundir (son destinos distintos):**
> - `SocialGistProfile` → el `profile` que vive DENTRO del gist social (`myGameList.social.json`), con `sharedLists`.
> - `SocialProfile` → modelo enriquecido (stats/visibility/`_modified`/`_v`) usado en la app/ViewModels; `_modified` es
>   su reloj propio del perfil (no sustituye a `_ts` de los juegos). `SocialGistProfile` reutiliza sus campos comunes.
> - `ProfileIndexDoc` → el documento de Firestore (índice público, index-only). **No** es el perfil del gist.
> `rating` se deriva de `score` en `toPublicGame` (paso 04); `stats`/`avgRating` se recomputan en `publishSocial`
> y se suben con `updateProfileStats` en el ciclo de sync (paso 06).

`toPublicGame` y `buildReviewSnippet` se definen en el repositorio (paso 04), no aquí
(los ficheros de tipos no contienen lógica). Aquí solo el contrato de datos.

---

## `src/model/types/firestore.ts` (nuevo — index-only)

> **Destino:** Firestore pasa a ser un **índice público** para descubrir usuarios.
> NO debe guardar `githubToken`, `email` (salvo mínimo consentido) ni stats privados.
> *(Estado actual: el doc `profiles` SÍ guarda email/uid/githubToken/gamesGistId — eso es lo que esta
> migración elimina; ver copilot-instructions §5 y §10.)*
> Si un campo no aparece aquí, **no** debe escribirse en Firestore.

```ts
import type { ChunkRef } from './gist';

/** profiles/{profileId}  — index-only, identificado por el pseudónimo, NO por uid */
interface ProfileIndexDoc {
  profileId: string;          // UUID v4 público (no uid)
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  private: boolean;
  stats: { totalCompleted: number; totalReviews: number };
  socialChunks: ChunkRef[];
  consent: { agreedAt: number; autoExpireAt: number };
  updatedAt: number;
  // ⚠️ NUNCA: uid, email, githubToken, gamesGistId, review, score, hours
}

/** feed/{reviewId} — tarjeta pública del feed de actividad */
interface FirestoreFeedCard {
  reviewId: string;
  profileId: string;
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  gameId: number;
  gameName: string;
  genres: string[];
  rating: number | null;
  snippet: string;            // ≤160 chars — ⚠️ nunca review completo
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: 'active' | 'hidden';
}

/** recommendations/{id} — refleja la colección real `recommendations` */
interface RecommendationDoc {
  fromProfileId: string;      // destino: pseudónimo, no uid
  toEmail: string;            // necesario para entregar (campo mínimo consentido)
  gameId: number;
  gameName: string;
  message: string;
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: number;
  updatedAt: number;
  // ⚠️ NUNCA: review, score, hours, githubToken
}

/** privateConfig/{uid} — solo el dueño (request.auth.uid == uid). Permite recuperar la config tras reinstalar. */
interface FirestorePrivateConfig {
  profileId: string;
  gamesGistId: string;
  socialGistId: string;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  /**
   * Token de GitHub CIFRADO en cliente (nunca en claro). Permite recuperar el PAT al volver a
   * iniciar sesión con Google. Firestore solo almacena el texto cifrado; la clave de descifrado
   * vive en IndexedDB (`cryptoKeys`) y nunca se sube. Ver core/security/crypto.ts.
   */
  encryptedGithubToken?: string;
}
```

`ChunkRef` se importa de `./gist`.

---

## `src/model/types/gist.ts` (nuevo — chunking)

> **Destino:** hoy cada gist es **un único fichero** (`myGames.json`, `myGameList.social.json`).
> El chunking reparte el excedente cuando se supera un umbral de tamaño. Mantiene el fichero
> ancla y añade ficheros `*-chunk-N.json`.
>
> ⚠️ **RETROCOMPATIBILIDAD CRÍTICA.** Hoy `myGames.json` contiene un `TabData` **plano sin envoltorio**
> y `readGist → migrateData` lee `.c/.v/.e/.p` directamente. `GamesMainFile` (con `schemaVersion`/`chunkIndex`/
> `deletedIndex`) es el formato **DESTINO**. Si una versión nueva escribiera este envoltorio mientras el lector
> espera `TabData` plano, leería listas vacías y **sobrescribiría el gist con datos vacíos (pérdida total)**.
> Por eso: la **lectura** debe detectar formato y **desenvolver** el envoltorio ANTES de `migrateData`
> (ver paso 03), y la **escritura** del envoltorio solo se activa tras una fase de transición (ver paso 03).

```ts
import type { GameItem } from './game';
import type { PublicGame, ActivityFeed } from './social';

interface ChunkRef { chunkId: string; gistId: string | null; sizeKB: number; updatedAt: number; }
interface ChunkIndex { strategy: 'size'; maxChunkKB: number; chunks: ChunkRef[]; }

/** Fichero ancla del gist de juegos — `myGames.json` (privado) */
interface GamesMainFile {
  schemaVersion: 3;
  fileType: 'games-main';
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  chunkIndex: ChunkIndex;
  syncMeta: { lamport: number; updatedAt: number };
  games: Record<number, GameItem>;     // privado completo
  deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }>;
}

/** Fichero de overflow del gist de juegos — `myGames-chunk-N.json` */
interface GamesChunkFile {
  schemaVersion: 3;
  fileType: 'games-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  games: Record<number, GameItem>;
}

/** Fichero de overflow del gist social — `myGameList.social-chunk-N.json` (público) */
interface SocialChunkFile {
  schemaVersion: 2;
  fileType: 'social-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  games: Record<number, PublicGame>;   // ⚠️ solo proyección pública
  activityFeed: ActivityFeed;
}
```

---

## `src/model/types/local.ts` (nuevo — solo IndexedDB)

> Evolución de `SyncConfig`. Todo esto vive **solo en IndexedDB**, nunca se sube.
> El `githubToken` y el `uid` permanecen aquí — **nunca** a Firestore ni a gist.

```ts
import type { ChunkRef } from './gist';

interface LocalMeta {
  _key: 'singleton';
  uid: string;                // uid de Firebase — solo IndexedDB
  profileId: string;          // pseudónimo público (mapa uid→profileId privado)
  githubToken: string;        // ⚠️ solo IndexedDB — NUNCA a Firestore ni gist
  gamesGistId: string;
  socialGistId: string;
  deviceId: string;
  deviceName: string;
  gamesEtag: string | null;   // ETag para If-Match (conserva el mecanismo actual)
  socialEtag: string | null;
  lamport: number;
  lastGistPull: number;
  lastFirestorePush: number;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  devices: Record<string, { name: string; lastSeen: number }>;
  migrationVersion?: number;   // estado de la migración one-time (lo usa el paso 08; >=3 = migrado)
}

type SyncOpType = 'upsertGame' | 'deleteGame' | 'updateProfile' | 'updateVisibility' | 'revokeConsent';

interface SyncOp {
  id: string;
  type: SyncOpType;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  nextRetry: number | null;
}
```

## Constraints
- Todas las interfaces exportadas.
- Sin clases ni lógica en los ficheros de tipos (solo `interface`/`type`).
- Comentarios `// ⚠️ privado` en `score`, `hours`, `review`, `steamDeck`, `retry`, `replayable`.
- Comentarios `// ⚠️ nunca a Firestore` / `// ⚠️ nunca review completo` donde aplique.
- No cambiar `id: number` por UUID ni eliminar `_ts`: la compatibilidad con el modelo actual es obligatoria.
- `tsc --noEmit` debe pasar tras este paso.
