# Prompt 09 — Migration validation tests

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12 · Vitest 4). Diseño destino conservado.
>
> **Punto de partida real:** los tests viven en `tests/{unit,integration,e2e}/` (+ tests colocados en `src/`).
> `npm run test` corre `tests/unit` + `src`; `npm run test:all` incluye integration/e2e; `npm run test:coverage` mide.
> Tipos reales: `GameItem` (`id: number`, reloj `_ts`, `shared`), sin `_created`/`_hash`/`status`/`shareLevel`.

## Prerequisites
Prompts 01–08 completos. Runner: Vitest.

## Task
Tests que validan los invariantes críticos de la migración (regresión anti-fuga de datos y de corrupción de sync).

## Output files (rutas reales)
- `tests/unit/models.test.ts`
- `tests/unit/gistManagers.test.ts`
- `tests/unit/migration.test.ts`
- `tests/unit/firestoreRepositories.test.ts`
- `tests/unit/helpers.ts`

---

## `tests/unit/models.test.ts` — `toPublicGame`
```ts
describe('toPublicGame', () => {
  it('quita campos privados de PublicGame', () => {
    const pub = toPublicGame(buildGame({ review: 'texto', score: 4, hours: 10, shared: true }));
    for (const f of ['review','score','hours','steamDeck','retry','replayable']) expect(pub).not.toHaveProperty(f);
  });
  it('snippet = primeros 160 chars del review', () => {
    const long = 'A'.repeat(300);
    const pub = toPublicGame(buildGame({ review: long, shared: true }));
    expect(pub.snippet.length).toBeLessThanOrEqual(160);
    expect(pub.snippet).toBe(long.slice(0, 160));
  });
  it('hasFullReview según review no vacío', () => {
    expect(toPublicGame(buildGame({ review: 'x', shared: true })).hasFullReview).toBe(true);
    expect(toPublicGame(buildGame({ review: '', shared: true })).hasFullReview).toBe(false);
  });
  it('lanza si shared !== true', () => {
    expect(() => toPublicGame(buildGame({ shared: false }))).toThrow();
  });
});
describe('snippet ≤ 160', () => {
  it('siempre', () => {
    for (const len of [0,1,100,160,161,500,1000])
      expect(toPublicGame(buildGame({ review: 'X'.repeat(len), shared: true })).snippet.length).toBeLessThanOrEqual(160);
  });
});
```

## `tests/unit/gistManagers.test.ts`
Mockear la API de GitHub con `vi.spyOn(global,'fetch')` o `msw`.
```ts
describe('assertNoPrivateFields', () => {
  it('lanza si review está en raíz', () => expect(() => assertNoPrivateFields({ snippet:'x', review:'full' })).toThrow());
  it('lanza si review está anidado', () => expect(() => assertNoPrivateFields({ games:{ 1:{ snippet:'x', review:'t' } } })).toThrow());
  it('no lanza sin campos privados', () => expect(() => assertNoPrivateFields({ games:{ 1:{ snippet:'x' } } })).not.toThrow());
});

describe('publishSocial', () => {
  it('no incluye review en el contenido publicado', async () => {
    await seedGames([buildGame({ review:'full', shared:true })]);   // helper que escribe en IndexedDB
    const patchCalls: unknown[] = [];
    vi.spyOn(global,'fetch').mockImplementation((url, init) => {
      if (String(url).includes('api.github.com') && init?.method === 'PATCH') patchCalls.push(JSON.parse(init!.body as string));
      return Promise.resolve(new Response('{}'));
    });
    await publishSocial(buildMeta());
    for (const call of patchCalls) {
      const content = JSON.parse((call as any).files['myGameList.social.json'].content);
      expect(JSON.stringify(content)).not.toContain('"review"');
    }
  });
});

describe('distributeIntoChunks', () => {
  it('todo en main bajo umbral', () => {
    const r = distributeIntoChunks(Array.from({length:5}, () => buildGame()), 800*1024*0.85);
    expect(Object.keys(r)).toEqual(['main']);
  });
  it('crea c1 al superar umbral', () => {
    const big = 'X'.repeat(10_000);
    const r = distributeIntoChunks(Array.from({length:100}, () => buildGame({ review: big })), 50_000);
    expect(Object.keys(r).length).toBeGreaterThan(1); expect(r.c1).toBeDefined();
  });
  it('nunca el mismo juego en dos chunks', () => {
    const r = distributeIntoChunks(Array.from({length:50}, (_,i) => buildGame({ id: i })), 10_000);
    const ids = Object.values(r).flat().map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

## `tests/unit/firestoreRepositories.test.ts`
Mockear con `vi.mock('firebase/firestore')`.
```ts
const PRIVATE = ['uid','email','githubToken','gamesGistId','score','hours','steamDeck','retry','replayable','review'];
describe('assertNoPrivateFields', () => {
  for (const f of PRIVATE) it(`lanza con "${f}"`, () => expect(() => assertNoPrivateFields({ [f]:'v' })).toThrow());
  it('no lanza con datos limpios', () => expect(() => assertNoPrivateFields({ profileId:'a', displayName:'B', rating:4 })).not.toThrow());
});
describe('upsertFeedCard', () => {
  it('lanza si snippet > 160', async () => await expect(upsertFeedCard(buildFeedCard({ snippet:'X'.repeat(161) }))).rejects.toThrow());
  it('lanza si hay review', async () => await expect(upsertFeedCard({ ...buildFeedCard(), review:'full' } as any)).rejects.toThrow());
});
```

## `tests/unit/migration.test.ts`
```ts
describe('detectFormat', () => {
  it('detecta TabData (arrays c/v/e/p)', () => expect(detectFormat({ c:[],v:[],e:[],p:[],deleted:[],updatedAt:0 })).toBe('tabdata'));
  it('marca desconocido', () => expect(detectFormat({ foo:1 })).toBe('unknown'));
});
describe('migrateGame', () => {
  it('conserva id numérico (no UUID)', () => expect(typeof migrateGame(buildOldGame({ id:42 })).id).toBe('number'));
  it('quita snippet si aparece', () => {
    const m = migrateGame(buildOldGame({ snippet:'short', review:'long' }));
    expect(m).not.toHaveProperty('snippet'); expect(m.review).toBe('long');
  });
  it('shared = false por defecto', () => expect(migrateGame(buildOldGame({})).shared).toBe(false));
});
describe('runMigration idempotente', () => {
  it('skipped=true en la 2ª pasada', async () => { await runMigration(); expect((await runMigration()).skipped).toBe(true); });
});
```

## `tests/unit/helpers.ts`
```ts
export function buildGame(o: Partial<GameItem> = {}): GameItem {
  return { id: 1, _ts: 1_000_000, name: 'Test', platforms: ['Steam'], genres: ['JRPG'],
    steamDeck: false, review: '', score: undefined, years: [2025],
    strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: null,
    _v: 1, shared: true, ...o };
}
export function buildMeta(o: Partial<LocalMeta> = {}): LocalMeta { /* … */ }
export function buildFeedCard(o: Partial<FirestoreFeedCard> = {}): FirestoreFeedCard { /* … */ }
export function buildOldGame(o: Record<string, unknown>): Record<string, unknown> { /* forma legacy */ }
```

## Constraints
- Sin red real: mockear todo `fetch` y Firebase.
- Los tests de `assertNoPrivateFields` son obligatorios — no skip.
- Cobertura objetivo 80% en `src/model/`, `src/model/repository/`, `src/viewmodel/` (ajustar `vitest.config`).
- `tsc --noEmit` y `npm run test` deben pasar tras este paso.
