# Prompt 09 — Migration validation tests

## Prerequisites
Prompts 01–08 complete. Use Vitest as the test runner.

## Task
Write tests that validate the most critical invariants of the migration.
These tests act as a regression suite — if any of them fail after a change,
it means private data could leak or the sync could corrupt data.

## Output files
- `src/__tests__/models.test.ts`
- `src/__tests__/gistManagers.test.ts`
- `src/__tests__/migration.test.ts`
- `src/__tests__/firestoreRepositories.test.ts`

---

## `src/__tests__/models.test.ts`

### toPublicGame — invariants

```ts
describe('toPublicGame', () => {
  it('strips review from PublicGame', () => {
    const game = buildGame({ review: 'Full review text', score: 4, hours: 10 });
    const pub = toPublicGame(game);
    expect(pub).not.toHaveProperty('review');
    expect(pub).not.toHaveProperty('score');
    expect(pub).not.toHaveProperty('hours');
    expect(pub).not.toHaveProperty('steamDeck');
    expect(pub).not.toHaveProperty('retry');
    expect(pub).not.toHaveProperty('replayable');
  });

  it('sets snippet to first 160 chars of review', () => {
    const longReview = 'A'.repeat(300);
    const pub = toPublicGame(buildGame({ review: longReview }));
    expect(pub.snippet.length).toBeLessThanOrEqual(160);
    expect(pub.snippet).toBe(longReview.slice(0, 160));
  });

  it('sets hasFullReview=true when review is non-empty', () => {
    expect(toPublicGame(buildGame({ review: 'text' })).hasFullReview).toBe(true);
    expect(toPublicGame(buildGame({ review: '' })).hasFullReview).toBe(false);
  });

  it('throws if shareLevel is not public', () => {
    const game = buildGame({ shareLevel: 'private' });
    expect(() => toPublicGame(game)).toThrow();
  });
});
```

### snippet length invariant

```ts
describe('snippet', () => {
  it('snippet is always ≤ 160 chars', () => {
    for (const len of [0, 1, 100, 160, 161, 500, 1000]) {
      const game = buildGame({ review: 'X'.repeat(len), shareLevel: 'public' });
      const pub = toPublicGame(game);
      expect(pub.snippet.length).toBeLessThanOrEqual(160);
    }
  });
});
```

---

## `src/__tests__/gistManagers.test.ts`

Mock the GitHub API using `vi.mock` or `msw`.

### assertNoReview

```ts
describe('assertNoReview', () => {
  it('throws if review field is present at root', () => {
    expect(() => assertNoReview({ snippet: 'x', review: 'full text' })).toThrow();
  });

  it('throws if review field is nested', () => {
    expect(() => assertNoReview({ games: { id1: { snippet: 'x', review: 'text' } } })).toThrow();
  });

  it('does not throw when review is absent', () => {
    expect(() => assertNoReview({ games: { id1: { snippet: 'x' } } })).not.toThrow();
  });
});
```

### social Gist publish — no private fields

```ts
describe('publishSocial', () => {
  it('does not include review in the published content', async () => {
    const games = [buildGame({ review: 'Full text', shareLevel: 'public' })];
    await db.games.bulkPut(games);

    const patchCalls: unknown[] = [];
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      if (String(url).includes('api.github.com') && init?.method === 'PATCH') {
        patchCalls.push(JSON.parse(init.body as string));
      }
      return Promise.resolve(new Response('{}'));
    });

    await publishSocial(buildMeta());

    for (const call of patchCalls) {
      const content = JSON.parse((call as any).files['social-main.json'].content);
      // Walk the entire object tree — review must not appear
      expect(JSON.stringify(content)).not.toContain('"review"');
    }
  });
});
```

### chunk splitting

```ts
describe('distributeIntoChunks', () => {
  it('puts all games in main when under threshold', () => {
    const games = Array.from({ length: 5 }, () => buildGame());
    const result = distributeIntoChunks(games, 800 * 1024 * 0.85);
    expect(Object.keys(result)).toEqual(['main']);
  });

  it('creates a c1 chunk when main exceeds threshold', () => {
    // Create games large enough to overflow
    const bigReview = 'X'.repeat(10_000);
    const games = Array.from({ length: 100 }, () => buildGame({ review: bigReview }));
    const result = distributeIntoChunks(games, 50_000); // low threshold for test
    expect(Object.keys(result).length).toBeGreaterThan(1);
    expect(result.c1).toBeDefined();
  });

  it('never puts the same game in two chunks', () => {
    const games = Array.from({ length: 50 }, (_, i) => buildGame({ id: `id-${i}` }));
    const result = distributeIntoChunks(games, 10_000);
    const allIds = Object.values(result).flat().map(g => g.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
```

---

## `src/__tests__/firestoreRepositories.test.ts`

Mock Firestore with `vi.mock('firebase/firestore')`.

### assertNoPrivateFields

```ts
describe('assertNoPrivateFields', () => {
  const PRIVATE = ['uid', 'email', 'githubToken', 'gamesGistId',
                   'score', 'hours', 'steamDeck', 'retry', 'replayable',
                   'review', 'photoURL'];

  for (const field of PRIVATE) {
    it(`throws when "${field}" is present`, () => {
      expect(() => assertNoPrivateFields({ [field]: 'value' })).toThrow();
    });
  }

  it('does not throw for clean data', () => {
    expect(() => assertNoPrivateFields({
      profileId: 'abc', displayName: 'Bellanco', rating: 4
    })).not.toThrow();
  });
});
```

### FeedRepository.upsertCard

```ts
describe('FeedRepository.upsertCard', () => {
  it('throws if snippet exceeds 160 chars', async () => {
    const card = buildFeedCard({ snippet: 'X'.repeat(161) });
    await expect(feedRepository.upsertCard(card)).rejects.toThrow();
  });

  it('throws if review field is present', async () => {
    const card = { ...buildFeedCard(), review: 'full text' };
    await expect(feedRepository.upsertCard(card as any)).rejects.toThrow();
  });
});
```

---

## `src/__tests__/migration.test.ts`

### Format detection

```ts
describe('detectOldFormat', () => {
  it('detects arrays format', () => {
    expect(detectOldFormat({ c: [], v: [], e: [], p: [] })).toBe('arrays');
  });

  it('detects normalized-v1 (integer ids)', () => {
    expect(detectOldFormat({ games: { 1: { _list: 'completed' } } })).toBe('normalized-v1');
  });

  it('detects normalized-v2 (uuid ids)', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(detectOldFormat({ games: { [uuid]: { status: 'completed' } } })).toBe('normalized-v2');
  });
});
```

### Game transformation

```ts
describe('migrateGame', () => {
  it('moves review text to review field', () => {
    const old = buildOldGame({ reviewText: 'text', review: undefined });
    const migrated = migrateGame(old);
    expect(migrated.review).toBe('text');
    expect(migrated).not.toHaveProperty('reviewText');
  });

  it('removes snippet field if present', () => {
    const old = buildOldGame({ snippet: 'short', review: 'long text' });
    const migrated = migrateGame(old);
    expect(migrated).not.toHaveProperty('snippet');
    expect(migrated.review).toBe('long text');
  });

  it('assigns a UUID when old id is a number', () => {
    const old = buildOldGame({ id: 42 });
    const migrated = migrateGame(old);
    expect(migrated.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets shareLevel to private by default', () => {
    const migrated = migrateGame(buildOldGame({}));
    expect(migrated.shareLevel).toBe('private');
  });
});
```

### Idempotency

```ts
describe('runMigration idempotency', () => {
  it('returns skipped=true on second run', async () => {
    await runMigration();
    const second = await runMigration();
    expect(second.skipped).toBe(true);
  });
});
```

---

## Test helpers (put in `src/__tests__/helpers.ts`)

```ts
export function buildGame(overrides: Partial<Game> = {}): Game {
  return {
    id: crypto.randomUUID(),
    name: 'Test Game',
    genres: ['JRPG'],
    platforms: ['Steam'],
    strengths: [],
    weaknesses: [],
    reasons: [],
    years: [2025],
    steamDeck: false,
    replayable: false,
    retry: false,
    review: '',
    score: null,
    hours: null,
    status: 'pending',
    shareLevel: 'public',
    socialSynced: null,
    _created: 1000000,
    _modified: 1000000,
    _v: 1,
    _hash: 'abc',
    ...overrides,
  };
}

export function buildMeta(overrides: Partial<LocalMeta> = {}): LocalMeta { /* … */ }
export function buildFeedCard(overrides: Partial<FirestoreFeedCard> = {}): FirestoreFeedCard { /* … */ }
export function buildOldGame(overrides: Record<string, unknown>): Record<string, unknown> { /* … */ }
```

## Constraints
- Tests must not make real network calls — mock all `fetch` and Firebase calls.
- The `assertNoReview` and `assertNoPrivateFields` tests are mandatory — do not skip them.
- Coverage target: 80% for `src/models/`, `src/gist/`, `src/firebase/`, `src/migration/`.
- Add a `vitest.config.ts` that fails the build if coverage drops below 80% on those paths.
