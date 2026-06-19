# Prompt 01 — Core data models

## Task
Generate all TypeScript interfaces and types that the migration will use.
These types are the contract between every other module. Define them first,
everything else imports from here.

## Output files
- `src/models/Game.ts`
- `src/models/GistChunk.ts`
- `src/models/SocialProfile.ts`
- `src/models/FirestoreModels.ts`
- `src/models/LocalMeta.ts`
- `src/models/SyncQueue.ts`

---

## `src/models/Game.ts`

Define the following types:

```ts
/** Status of a game in the user's collection */
type GameStatus = 'completed' | 'pending' | 'abandoned' | 'excluded';

/** Who can see this game in the social layer */
type ShareLevel = 'public' | 'private';

/**
 * Full game record — stored in IndexedDB and games Gist (private).
 * NEVER put a `snippet` field here. The snippet is derived at publish time.
 * The `review` field contains the full review text or empty string.
 */
interface Game {
  id: string;               // UUID v4
  name: string;
  genres: string[];         // resolved strings, not catalog IDs at this layer
  platforms: string[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
  years: number[];
  steamDeck: boolean;
  replayable: boolean;
  retry: boolean;
  review: string;           // full text — games Gist only
  score: number | null;     // private — never in social Gist or Firestore
  hours: number | null;     // private — never in social Gist or Firestore
  status: GameStatus;
  shareLevel: ShareLevel;
  socialSynced: number | null;  // timestamp of last push to social Gist
  _created: number;         // ms timestamp
  _modified: number;        // ms timestamp
  _v: number;               // increment on every edit
  _hash: string;            // crc32 of content fields
}

/**
 * Public projection of a game — stored in social Gist and Firestore.
 * NEVER put `review`, `score`, `hours`, `steamDeck`, `retry`, or `replayable` here.
 * The `snippet` is `game.review.slice(0, 160)`.
 */
interface PublicGame {
  id: string;
  name: string;
  genres: string[];
  platforms: string[];
  strengths: string[];
  weaknesses: string[];
  status: GameStatus;
  rating: number | null;    // mapped from score
  years: number[];
  snippet: string;          // ≤160 chars, derived from review
  hasFullReview: boolean;
  updatedAt: number;
}
```

Add a pure function `toPublicGame(game: Game): PublicGame` that performs the
projection and enforces the snippet length. Throw if `game.shareLevel !== 'public'`.

---

## `src/models/GistChunk.ts`

```ts
interface ChunkRef {
  chunkId: string;        // 'main' | 'c1' | 'c2' …
  gistId: string | null;  // null for the anchor chunk
  sizeKB: number;
  updatedAt: number;
}

interface ChunkIndex {
  strategy: 'size';
  maxChunkKB: number;
  chunks: ChunkRef[];
}

/** Anchor file — games-main.json */
interface GamesMainFile {
  schemaVersion: 3;
  fileType: 'games-main';
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  chunkIndex: ChunkIndex;
  catalog: Catalog;
  privacy: PrivacyConfig;
  syncMeta: { lamport: number; updatedAt: number };
  games: Record<string, Game>;
  deletedIndex: Record<string, { deletedAt: number; purgeAfter: number }>;
}

/** Overflow file — games-chunk-N.json */
interface GamesChunkFile {
  schemaVersion: 3;
  fileType: 'games-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  games: Record<string, Game>;
}

/** Anchor file — social-main.json */
interface SocialMainFile {
  schemaVersion: 2;
  fileType: 'social-main';
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  chunkIndex: ChunkIndex;
  consent: ConsentConfig;
  profile: SocialProfile;
  games: Record<string, PublicGame>;
  activityFeed: ActivityFeed;
}

/** Overflow file — social-chunk-N.json */
interface SocialChunkFile {
  schemaVersion: 2;
  fileType: 'social-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: 'crc32'; checksum: string; generatedAt: number };
  games: Record<string, PublicGame>;
  activityFeed: ActivityFeed;
}
```

---

## `src/models/SocialProfile.ts`

```ts
interface SocialProfile {
  profileId: string;        // UUID v4 — public pseudonym, not Firebase uid
  displayName: string;
  avatarHash: string;
  private: boolean;
  favoriteGames: string[];  // game IDs
  visibility: {
    hiddenLists: GameStatus[];
    hideGameTime: boolean;
  };
  stats: {
    totalCompleted: number;
    totalAbandoned: number;
    totalReviews: number;
    avgRating: number;
  };
  _modified: number;
  _v: number;
}

interface ActivityFeedItem {
  key: string;
  type: 'review';
  gameId: string;
  gameName: string;
  rating: number;
  snippet: string;          // ≤160 chars — NO full review
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

interface ActivityFeed {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  items: ActivityFeedItem[];
}

interface ConsentConfig {
  version: string;
  agreedAt: number;
  scope: string[];
  retentionDays: number;
  autoExpireAt: number;
  revokedFields: string[];
}
```

---

## `src/models/FirestoreModels.ts`

Only the fields that go into Firestore. If a field is not listed here,
it must not be written to Firestore.

```ts
/** /users/{profileId} */
interface FirestoreUser {
  profileId: string;
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  private: boolean;
  stats: { totalCompleted: number; totalReviews: number };
  socialChunks: ChunkRef[];
  consent: { agreedAt: number; autoExpireAt: number };
  updatedAt: number;
}

/** /feed/{reviewId} */
interface FirestoreFeedCard {
  reviewId: string;
  profileId: string;
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  gameId: string;
  gameName: string;
  genres: string[];
  rating: number;
  snippet: string;          // ≤160 chars — NO full review
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: 'active' | 'hidden';
}

/** /privateConfig/{uid} — owner-only read */
interface FirestorePrivateConfig {
  profileId: string;
  gamesGistId: string;
  socialGistId: string;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
}
```

---

## `src/models/LocalMeta.ts`

Everything that lives only in IndexedDB, never uploaded anywhere.

```ts
interface LocalMeta {
  _key: 'singleton';
  uid: string;              // Firebase Auth uid — IndexedDB only
  profileId: string;
  githubToken: string;      // IndexedDB only — NEVER to Firestore or Gist
  gamesGistId: string;      // IndexedDB + privateConfig only
  socialGistId: string;
  deviceId: string;
  deviceName: string;
  gamesEtag: string | null;
  socialEtag: string | null;
  lamport: number;
  lastGistPull: number;
  lastFirestorePush: number;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  devices: Record<string, { name: string; lastSeen: number }>;
}
```

---

## `src/models/SyncQueue.ts`

```ts
type SyncOpType =
  | 'upsertGame'
  | 'deleteGame'
  | 'updateProfile'
  | 'updateVisibility'
  | 'revokeConsent';

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
- All interfaces must be exported.
- No classes — interfaces and types only in this file.
- No runtime logic in model files.
- Add `// ⚠️ never in social Gist` comments on `score`, `hours`, `review` in Game.
- Add `// ⚠️ never in Firestore` on `review` in every interface where it might appear.
