# Prompt 05 — Firestore repositories

## Prerequisites
Prompts 01–04 complete. Import from `src/models/FirestoreModels.ts`.

## Task
Create one repository class per Firestore collection.
All Firestore calls in the entire codebase must go through these repositories.
No inline `setDoc`, `getDoc`, or `updateDoc` anywhere else.

## Output files
- `src/firebase/userRepository.ts`
- `src/firebase/feedRepository.ts`
- `src/firebase/privateConfigRepository.ts`
- `src/firebase/firebaseConfig.ts`

---

## `src/firebase/firebaseConfig.ts`

Initialize Firebase and export the `db` (Firestore) and `auth` instances.
Read credentials from `import.meta.env.VITE_FIREBASE_*`.
Export a `getFirebaseAuth()` helper that returns the current user or throws.

---

## `src/firebase/userRepository.ts`

```ts
class UserRepository {
  /**
   * Creates or fully replaces the public user document.
   * Validates that no private fields are present before writing.
   */
  async upsert(user: FirestoreUser): Promise<void>

  /**
   * Partial update — only the fields provided are written.
   * Validates that no private fields are in the patch.
   */
  async patch(profileId: string, patch: Partial<FirestoreUser>): Promise<void>

  /**
   * Reads a public user profile. Returns null if not found or private.
   */
  async get(profileId: string): Promise<FirestoreUser | null>

  /**
   * Updates only the socialChunks array and updatedAt.
   * Called after a new social overflow chunk is created.
   */
  async updateChunks(profileId: string, chunks: ChunkRef[]): Promise<void>

  /**
   * Updates only the stats sub-object and updatedAt.
   */
  async updateStats(profileId: string, stats: FirestoreUser['stats']): Promise<void>
}
```

Validation helper (used in `upsert` and `patch`):
```ts
const FORBIDDEN_FIELDS = [
  'uid', 'email', 'githubToken', 'gamesGistId',
  'score', 'hours', 'steamDeck', 'retry', 'replayable',
  'review', 'photoURL',
] as const;

function assertNoPrivateFields(data: Record<string, unknown>): void {
  for (const field of FORBIDDEN_FIELDS) {
    if (field in data) throw new Error(`Forbidden field "${field}" in Firestore write`);
  }
}
```

Call `assertNoPrivateFields` at the start of `upsert` and `patch`.

---

## `src/firebase/feedRepository.ts`

```ts
class FeedRepository {
  /**
   * Upsert a feed card. Validates no private fields and snippet ≤ 160 chars.
   */
  async upsertCard(card: FirestoreFeedCard): Promise<void>

  /**
   * Soft-delete: sets status to 'hidden'. Does not remove the document.
   */
  async hideCard(reviewId: string): Promise<void>

  /**
   * Hard-delete: removes the document. Used on consent revocation.
   */
  async deleteCard(reviewId: string): Promise<void>

  /**
   * Paginated feed query. Returns up to `limit` active, non-expired cards
   * sorted by createdAt descending. Pass the last document snapshot as cursor.
   */
  async getPage(limit: number, cursor?: DocumentSnapshot): Promise<{
    items: FirestoreFeedCard[];
    nextCursor: DocumentSnapshot | null;
    hasMore: boolean;
  }>

  /**
   * Batch upsert — writes up to 499 cards in a single Firestore batch.
   * Splits into multiple batches if needed.
   */
  async batchUpsert(cards: FirestoreFeedCard[]): Promise<void>

  /**
   * Delete all cards belonging to a profileId. Used on account deletion.
   */
  async deleteAllByProfile(profileId: string): Promise<void>
}
```

Validation in `upsertCard`:
- `assertNoPrivateFields(card)`
- `if (card.snippet.length > 160) throw new Error('snippet exceeds 160 chars')`
- `if ('review' in card) throw new Error('review field forbidden in feed card')`

---

## `src/firebase/privateConfigRepository.ts`

```ts
class PrivateConfigRepository {
  /**
   * Reads the private config for the current authenticated user.
   * Uses request.auth.uid match — only the owner can read.
   */
  async get(uid: string): Promise<FirestorePrivateConfig | null>

  /**
   * Creates or replaces the private config.
   */
  async set(uid: string, config: FirestorePrivateConfig): Promise<void>

  /**
   * Adds a new chunk reference to gamesChunks or socialChunks.
   */
  async addChunk(uid: string, type: 'games' | 'social', chunk: ChunkRef): Promise<void>
}
```

---

## Security rules reminder (not code — for the developer)

Add a comment block at the top of each repository file:

```ts
/**
 * Security rules for this collection (deploy via Firebase console or CLI):
 *
 * /users/{profileId}:
 *   read: resource.data.private == false && autoExpireAt > now
 *   write: authenticated && isOwner(profileId) && !hasPrivateFields
 *
 * /feed/{reviewId}:
 *   read: status == 'active' && expiresAt > now
 *   write: authenticated && isOwner(profileId prefix) && snippet ≤ 200
 *
 * /privateConfig/{uid}:
 *   read/write: request.auth.uid == uid
 */
```

---

## Constraints
- Export repository instances as singletons.
- No repository may import from `src/gist/`.
- All batch operations must split into chunks of ≤ 499 (Firestore batch limit).
- `batchUpsert` must call `assertNoPrivateFields` on each card.
