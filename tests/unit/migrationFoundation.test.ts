import { describe, expect, it } from 'vitest';
import {
  assertNoSocialPrivateFields,
  buildGamesMainFile,
  buildReviewSnippet,
  distributeIntoChunks,
  toPublicGame,
} from '../../src/model/repository/gistRepository';
import { gamesGistNeedsRewrite, unwrapGamesFile } from '../../src/model/migration/legacyGamesFormat';
import { socialGistNeedsRewrite } from '../../src/model/migration/legacySocialFormat';
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

  it('false para valores no-objeto', () => {
    expect(socialGistNeedsRewrite(null)).toBe(false);
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
