import { describe, expect, it } from 'vitest';
import {
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildGamesFiles,
  buildGamesMainFile,
  buildReviewSnippet,
  distributeIntoChunks,
  leanTabData,
  remapSocialActorIds,
  toPublicGame,
  upsertReviewActivity,
} from '../../src/model/repository/gistRepository';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';
import { assembleChunkedGames, gamesGistNeedsRewrite, unwrapGamesFile } from '../../src/model/migration/legacyGamesFormat';
import { pickLegacyActorId, pickLegacyFromId, socialGistNeedsRewrite } from '../../src/model/migration/legacySocialFormat';
import { localStateNeedsUpgrade } from '../../src/model/migration/legacyLocalStorage';
import { LOCAL_SCHEMA_VERSION } from '../../src/core/constants/storageKeys';
import { decryptFromString, encryptToString } from '../../src/core/security/crypto';
import type { GameItem, TabData } from '../../src/model/types/game';

function makeGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 1,
    _ts: 1000,
    name: 'Test',
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: true,
    review: 'una reseña',
    score: 4,
    years: [2025],
    hours: 12,
    retry: true,
    replayable: false,
    ...overrides,
  };
}

describe('buildReviewSnippet', () => {
  it('recorta a 160 chars como máximo', () => {
    expect(buildReviewSnippet('X'.repeat(300)).length).toBeLessThanOrEqual(160);
    expect(buildReviewSnippet('X'.repeat(300))).toBe('X'.repeat(160));
  });
  it('devuelve cadena vacía si no hay review', () => {
    expect(buildReviewSnippet('')).toBe('');
  });
});

describe('toPublicGame', () => {
  it('omite TODOS los campos privados', () => {
    const pub = toPublicGame(makeGame(), 'c');
    for (const f of ['review', 'score', 'hours', 'steamDeck', 'retry', 'replayable']) {
      expect(pub).not.toHaveProperty(f);
    }
  });
  it('deriva snippet, rating, tab y updatedAt', () => {
    const pub = toPublicGame(makeGame({ review: 'A'.repeat(200), score: 5, _ts: 777 }), 'v');
    expect(pub.snippet.length).toBeLessThanOrEqual(160);
    expect(pub.hasFullReview).toBe(true);
    expect(pub.rating).toBe(5);
    expect(pub.tab).toBe('v');
    expect(pub.updatedAt).toBe(777);
  });
  it('hasFullReview es false con review vacío y rating null sin score', () => {
    const pub = toPublicGame(makeGame({ review: '', score: undefined }), 'p');
    expect(pub.hasFullReview).toBe(false);
    expect(pub.rating).toBeNull();
  });
});

describe('assertNoSocialPrivateFields', () => {
  it('lanza si hay review/reviewText/score (incluso anidado)', () => {
    expect(() => assertNoSocialPrivateFields({ games: { 1: { snippet: 'x', review: 'full' } } })).toThrow();
    expect(() => assertNoSocialPrivateFields({ activity: [{ reviewText: 'full' }] })).toThrow();
    expect(() => assertNoSocialPrivateFields({ score: 5 })).toThrow();
  });
  it('no lanza con datos públicos limpios', () => {
    expect(() => assertNoSocialPrivateFields({ profile: { displayName: 'B' }, games: { 1: { snippet: 'x', rating: 4 } } })).not.toThrow();
  });
});

describe('unwrapGamesFile (lectura retrocompatible)', () => {
  it('deja pasar el formato plano TabData tal cual', () => {
    const flat: TabData = { c: [makeGame()], v: [], e: [], p: [], deleted: [], updatedAt: 5 };
    expect(unwrapGamesFile(flat)).toBe(flat);
  });

  it('reconstruye TabData desde el envoltorio GamesMainFile', () => {
    const wrapper = {
      schemaVersion: 3,
      fileType: 'games-main',
      updatedAt: 100,
      games: { 1: { ...makeGame({ id: 1 }), _tab: 'c' }, 2: { ...makeGame({ id: 2 }), _tab: 'p' } },
      deletedIndex: { 9: { deletedAt: 50 } },
    };
    const result = unwrapGamesFile(wrapper) as TabData;
    expect(result.c.map((g) => g.id)).toEqual([1]);
    expect(result.p.map((g) => g.id)).toEqual([2]);
    expect(result.c[0]).not.toHaveProperty('_tab');
    expect(result.deleted).toEqual([{ id: 9, _ts: 50, deletedAt: 50 }]);
  });

  it('salvaguarda anti-pérdida: lanza si el envoltorio trae juegos sin tab ubicable', () => {
    const wrapper = { schemaVersion: 3, fileType: 'games-main', games: { 1: makeGame({ id: 1 }) } };
    expect(() => unwrapGamesFile(wrapper)).toThrow();
  });
});

describe('gamesGistNeedsRewrite (condicional de upgrade proactivo)', () => {
  it('false para un gist plano ya en formato actual (campos EN)', () => {
    const flat: TabData = { c: [makeGame()], v: [], e: [], p: [], deleted: [], updatedAt: 5 };
    expect(gamesGistNeedsRewrite(flat)).toBe(false);
  });

  it('true si viene en el envoltorio GamesMainFile (se rebaja a plano)', () => {
    const wrapper = { schemaVersion: 3, fileType: 'games-main', games: {}, updatedAt: 1 };
    expect(gamesGistNeedsRewrite(wrapper)).toBe(true);
  });

  it('true si un juego conserva claves legacy en español', () => {
    const legacy = { c: [{ id: 1, nombre: 'Viejo', puntuacion: 5 }], v: [], e: [], p: [] };
    expect(gamesGistNeedsRewrite(legacy)).toBe(true);
  });

  it('true si un juego carece de name', () => {
    const legacy = { c: [{ id: 1, platforms: ['Steam'] }], v: [], e: [], p: [] };
    expect(gamesGistNeedsRewrite(legacy)).toBe(true);
  });

  it('false para valores no-objeto', () => {
    expect(gamesGistNeedsRewrite(null)).toBe(false);
    expect(gamesGistNeedsRewrite('x')).toBe(false);
  });
});

describe('socialGistNeedsRewrite (condicional de upgrade proactivo social)', () => {
  it('false si activity ya es snippet-only', () => {
    const data = { activity: [{ gameId: 1, snippet: 'corto' }], recommendations: [] };
    expect(socialGistNeedsRewrite(data)).toBe(false);
  });

  it('true si activity conserva el texto de reseña completo legacy (reviewText)', () => {
    const data = { activity: [{ gameId: 1, reviewText: 'reseña completa' }] };
    expect(socialGistNeedsRewrite(data)).toBe(true);
  });

  it('true si recommendations conserva review legacy', () => {
    const data = { recommendations: [{ id: 1, review: 'texto' }] };
    expect(socialGistNeedsRewrite(data)).toBe(true);
  });

  it('6.2b: true si activity aún identifica por uid (actorUid sin actorProfileId)', () => {
    const data = { activity: [{ gameId: 1, snippet: 'corto', actorUid: 'firebase-uid' }] };
    expect(socialGistNeedsRewrite(data)).toBe(true);
  });

  it('6.2b: true si recommendations aún usa fromUid', () => {
    const data = { recommendations: [{ id: 1, fromUid: 'firebase-uid', gameId: 1, gameName: 'G' }] };
    expect(socialGistNeedsRewrite(data)).toBe(true);
  });

  it('6.2b: false si ya identifica por actorProfileId', () => {
    const data = { activity: [{ gameId: 1, snippet: 'corto', actorProfileId: 'pid' }], recommendations: [] };
    expect(socialGistNeedsRewrite(data)).toBe(false);
  });

  it('false para valores no-objeto', () => {
    expect(socialGistNeedsRewrite(null)).toBe(false);
  });
});

describe('6.2b: lectores de identidad y remapSocialActorIds (uid→profileId en el gist social)', () => {
  it('pickLegacyActorId prefiere el pseudónimo nuevo y cae al uid viejo', () => {
    expect(pickLegacyActorId({ actorProfileId: 'pid', actorUid: 'uid' })).toBe('pid');
    expect(pickLegacyActorId({ actorUid: 'uid' })).toBe('uid');
    expect(pickLegacyActorId({})).toBe('');
  });

  it('pickLegacyFromId prefiere fromProfileId y cae a fromUid', () => {
    expect(pickLegacyFromId({ fromProfileId: 'pid', fromUid: 'uid' })).toBe('pid');
    expect(pickLegacyFromId({ fromUid: 'uid' })).toBe('uid');
  });

  it('remapSocialActorIds reemplaza el uid propio por su profileId y reconstruye key/id', () => {
    const data = {
      profile: { name: '', private: false, favoriteGames: [], recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
      recommendations: [{ id: 1, fromProfileId: 'my-uid', gameId: 7, gameName: 'G', rating: 5, createdAt: 1, updatedAt: 1 }],
      activity: [{ id: 'my-uid:5:review', key: 'my-uid:5:review', type: 'review' as const, actorProfileId: 'my-uid', actorName: 'N', gameId: 5, gameName: 'G', rating: 5, recommendationText: '', snippet: 's', createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
      schemaVersion: 2,
    };
    const out = remapSocialActorIds(data, { 'my-uid': 'pid-123' });
    expect(out.activity[0].actorProfileId).toBe('pid-123');
    expect(out.activity[0].key).toBe('pid-123:5:review');
    expect(out.activity[0].id).toBe('pid-123:5:review');
    expect(out.recommendations[0].fromProfileId).toBe('pid-123');
  });

  it('remapSocialActorIds NO toca ids ajenos (mapa vacío) — degradación suave para otros usuarios', () => {
    const data = {
      profile: { name: '', private: false, favoriteGames: [], recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
      recommendations: [],
      activity: [{ id: 'other-uid:5:review', key: 'other-uid:5:review', type: 'review' as const, actorProfileId: 'other-uid', actorName: 'N', gameId: 5, gameName: 'G', rating: 5, recommendationText: '', snippet: 's', createdAt: 1, updatedAt: 1 }],
      updatedAt: 1,
      schemaVersion: 2,
    };
    const out = remapSocialActorIds(data, {});
    expect(out.activity[0].actorProfileId).toBe('other-uid');
    expect(out.activity[0]).toBe(data.activity[0]); // sin cambios → misma referencia
  });
});

describe('Auto-upgrade local: localStateNeedsUpgrade (detector del estado guardado)', () => {
  it('true si un item conserva campos legacy en español (nombre/generos/…)', () => {
    expect(localStateNeedsUpgrade({ c: [{ id: 1, nombre: 'Juego' }], schemaVersion: LOCAL_SCHEMA_VERSION })).toBe(true);
    expect(localStateNeedsUpgrade({ v: [{ id: 1, pf: ['x'] }] })).toBe(true);
  });

  it('true si hay datos pero falta la marca schemaVersion (upgrade único)', () => {
    expect(localStateNeedsUpgrade({ c: [{ id: 1, name: 'Juego', genres: [] }] })).toBe(true);
  });

  it('false si ya es formato nuevo con schemaVersion actual', () => {
    expect(localStateNeedsUpgrade({ c: [{ id: 1, name: 'Juego', genres: [] }], schemaVersion: LOCAL_SCHEMA_VERSION })).toBe(false);
  });

  it('false para estado vacío o no-objeto (no fuerza reescrituras espurias)', () => {
    expect(localStateNeedsUpgrade({ c: [], v: [], e: [], p: [] })).toBe(false);
    expect(localStateNeedsUpgrade(null)).toBe(false);
    expect(localStateNeedsUpgrade('x')).toBe(false);
  });

  it('soporta el envoltorio { data: {...} } de formatos antiguos', () => {
    expect(localStateNeedsUpgrade({ data: { c: [{ id: 1, puntuacion: 5 }] } })).toBe(true);
  });
});

describe('E1: leanTabData (serialización magra)', () => {
  it('omite opcionales vacíos/false y conserva los requeridos', () => {
    const td: TabData = {
      c: [{ id: 1, _ts: 5, name: 'A', platforms: ['PC'], genres: [], steamDeck: false, review: '',
        years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false }],
      v: [], e: [], p: [], deleted: [], updatedAt: 5,
    };
    const g = leanTabData(td).c[0] as unknown as Record<string, unknown>;
    expect(g).toMatchObject({ id: 1, _ts: 5, name: 'A', steamDeck: false, review: '' });
    for (const k of ['years', 'strengths', 'weaknesses', 'reasons', 'replayable', 'retry', 'score', 'hours']) {
      expect(k in g).toBe(false);
    }
  });

  it('conserva opcionales con contenido', () => {
    const td: TabData = {
      c: [{ id: 1, _ts: 5, name: 'A', platforms: ['PC'], genres: ['RPG'], steamDeck: true, review: 'r',
        score: 4, years: [2020], strengths: ['x'], replayable: true, retry: true, hours: 12 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 5,
    };
    const g = leanTabData(td).c[0] as unknown as Record<string, unknown>;
    expect(g).toMatchObject({ steamDeck: true, review: 'r', score: 4, years: [2020], strengths: ['x'], replayable: true, retry: true, hours: 12 });
  });
});

describe('F6.1: assertValidSocialGist (allowlist estricta Zod)', () => {
  const emptySocial = {
    profile: { name: '', private: false, favoriteGames: [], recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
    recommendations: [],
    activity: [],
    updatedAt: 0,
    schemaVersion: 2,
  };

  it('acepta un gist social normalizado válido', () => {
    expect(() => assertValidSocialGist(emptySocial)).not.toThrow();
  });

  it('acepta el resultado real de upsertReviewActivity (lo que se escribe)', () => {
    const next = upsertReviewActivity(emptySocial, { actorProfileId: 'pid-1', actorName: 'N', gameId: 1, gameName: 'G', reviewText: 'reseña larga'.repeat(30), rating: 5, timestamp: 1000 });
    expect(() => assertValidSocialGist(next)).not.toThrow();
    // 6.2b: identifica por profileId, nunca por el uid de Firebase
    expect(next.activity[0].actorProfileId).toBe('pid-1');
    expect(next.activity[0].key).toBe('pid-1:1:review');
    // y nunca debe contener el review completo
    expect(JSON.stringify(next)).not.toContain('reseña larga'.repeat(30));
  });

  it('rechaza un campo privado filtrado (review dentro de activity)', () => {
    const leaked = {
      ...emptySocial,
      activity: [{ id: 'p:1:review', key: 'p:1:review', type: 'review', actorProfileId: 'p', actorName: 'N', gameId: 1, gameName: 'G', rating: 5, recommendationText: '', snippet: 's', createdAt: 1, updatedAt: 1, review: 'FUGA' }],
    };
    expect(() => assertValidSocialGist(leaked)).toThrow(/schema/);
  });

  it('rechaza el campo legacy actorUid (ya no permitido en el canal público)', () => {
    const legacy = {
      ...emptySocial,
      activity: [{ id: 'u:1:review', key: 'u:1:review', type: 'review', actorUid: 'u', actorName: 'N', gameId: 1, gameName: 'G', rating: 5, recommendationText: '', snippet: 's', createdAt: 1, updatedAt: 1 }],
    };
    expect(() => assertValidSocialGist(legacy)).toThrow(/schema/);
  });
});

describe('E1: assertGistSizeWithinLimit (guarda de tamaño)', () => {
  it('no lanza para contenido pequeño', () => {
    expect(() => assertGistSizeWithinLimit('{"a":1}', 'gist de juegos')).not.toThrow();
  });

  it('lanza un error accionable al superar el umbral de bloqueo (~950 KB)', () => {
    const huge = 'x'.repeat(1_000_000); // ~1 MB > 950 KB
    expect(() => assertGistSizeWithinLimit(huge, 'gist de juegos')).toThrow(/límite seguro/);
  });
});

describe('Fase C (aditivo): buildGamesMainFile + distributeIntoChunks', () => {
  it('buildGamesMainFile → unwrapGamesFile reconstruye el TabData (round-trip)', () => {
    const td: TabData = {
      c: [makeGame({ id: 1 })], v: [makeGame({ id: 2 })], e: [], p: [makeGame({ id: 3 })],
      deleted: [{ id: 9, _ts: 50 }], updatedAt: 100,
    };
    const wrapper = buildGamesMainFile(td);
    expect(wrapper.schemaVersion).toBe(3);
    expect(wrapper.fileType).toBe('games-main');

    const back = unwrapGamesFile(wrapper) as TabData;
    expect(back.c.map((g) => g.id)).toEqual([1]);
    expect(back.v.map((g) => g.id)).toEqual([2]);
    expect(back.p.map((g) => g.id)).toEqual([3]);
    expect(back.c[0]).not.toHaveProperty('_tab');
    expect(back.deleted.map((d) => d.id)).toEqual([9]);
  });

  it('distributeIntoChunks: todo en main bajo umbral, crea c1 al superarlo, sin duplicar', () => {
    const small = Array.from({ length: 5 }, (_, i) => makeGame({ id: i + 1 }));
    expect(Object.keys(distributeIntoChunks(small, 800 * 1024))).toEqual(['main']);

    const big = Array.from({ length: 100 }, (_, i) => makeGame({ id: i + 1, review: 'X'.repeat(2000) }));
    const result = distributeIntoChunks(big, 20_000);
    expect(Object.keys(result).length).toBeGreaterThan(1);
    expect(result.c1).toBeDefined();
    const allIds = Object.values(result).flat().map((g) => g.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBe(100);
  });
});

const hasSubtle = typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;

describe('cifrado del token (recuperación cross-device)', () => {
  it.skipIf(!hasSubtle)('cifra y descifra con el mismo secreto (uid)', async () => {
    const enc = await encryptToString('ghp_tokensecreto', 'uid-123');
    expect(enc).not.toContain('ghp_tokensecreto');
    expect(await decryptFromString(enc, 'uid-123')).toBe('ghp_tokensecreto');
  });
  it.skipIf(!hasSubtle)('no descifra con un secreto distinto', async () => {
    const enc = await encryptToString('ghp_tokensecreto', 'uid-123');
    await expect(decryptFromString(enc, 'uid-otro')).rejects.toBeTruthy();
  });
});

describe('F8/E4: chunking multi-fichero del gist de juegos (gated, round-trip)', () => {
  it('con maxChunkKB pequeño reparte en overflow y el round-trip no pierde datos', () => {
    const data: TabData = { c: [], v: [], e: [], p: [], deleted: [{ id: 999, _ts: 5 }], updatedAt: 100 };
    for (let i = 1; i <= 40; i += 1) data.c.push(makeGame({ id: i, name: `C${i}`, review: 'x'.repeat(500) }));
    for (let i = 41; i <= 60; i += 1) data.p.push(makeGame({ id: i, name: `P${i}` }));

    const { anchorFile, chunkFiles } = buildGamesFiles(data, 5); // 5 KB → fuerza overflow
    expect(Object.keys(chunkFiles).length).toBeGreaterThan(0);
    expect(anchorFile.chunkIndex.chunks.length).toBeGreaterThan(1);

    // Simular la respuesta del gist (ancla + ficheros chunk en la misma respuesta).
    const files: Record<string, { content: string }> = {
      'myGames.json': { content: JSON.stringify(anchorFile) },
    };
    for (const [name, file] of Object.entries(chunkFiles)) files[name] = { content: JSON.stringify(file) };

    const assembled = assembleChunkedGames(JSON.parse(files['myGames.json'].content), files);
    const round = unwrapGamesFile(assembled) as TabData;
    const ids = (arr: Array<{ id: number }>) => arr.map((g) => g.id).sort((a, b) => a - b);
    expect(ids(round.c)).toEqual(ids(data.c));
    expect(ids(round.p)).toEqual(ids(data.p));
    expect(round.v).toHaveLength(0);
    expect(round.deleted.map((d) => d.id)).toContain(999);
  });

  it('con pocos juegos solo hay chunk main (sin ficheros de overflow) y el round-trip funciona', () => {
    const data: TabData = { c: [makeGame({ id: 1 })], v: [], e: [], p: [], deleted: [], updatedAt: 1 };
    const { anchorFile, chunkFiles } = buildGamesFiles(data); // umbral por defecto
    expect(Object.keys(chunkFiles)).toHaveLength(0);
    expect(anchorFile.chunkIndex.chunks).toHaveLength(1);
    expect(anchorFile.chunkIndex.chunks[0].chunkId).toBe('main');

    const assembled = assembleChunkedGames(anchorFile, { 'myGames.json': { content: JSON.stringify(anchorFile) } });
    const round = unwrapGamesFile(assembled) as TabData;
    expect(round.c.map((g) => g.id)).toEqual([1]);
  });
});
