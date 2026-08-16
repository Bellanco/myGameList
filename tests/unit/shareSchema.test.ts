import { describe, it, expect, vi } from 'vitest';
import { assertValidSharedReview } from '../../src/model/schemas/shareSchema';
import { readSharedReview } from '../../src/model/repository/publicShareRepository';
import type { SharedReview } from '../../src/model/types/share';

function article(over: Partial<SharedReview> = {}): SharedReview {
  return {
    v: 1,
    gameId: 1,
    gameName: 'Hollow Knight',
    grade: 96,
    rating: 5,
    review: 'Un metroidvania enorme, con un mundo que se abre poco a poco y una dirección artística impecable.',
    platforms: ['PC', 'Switch'],
    genres: ['Metroidvania'],
    strengths: ['Ritmo', 'Ambientación'],
    weaknesses: [],
    authorNick: 'Bellanco',
    reviewedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_001,
    expiresAt: 1_700_600_000_000,
    ...over,
  };
}

describe('shareSchema — lo legítimo valida', () => {
  it('accepts a complete article', () => {
    expect(() => assertValidSharedReview(article())).not.toThrow();
  });

  it('accepts an article without score', () => {
    expect(() => assertValidSharedReview(article({ grade: null, rating: null }))).not.toThrow();
  });

  it('accepts empty metadata lists', () => {
    const bare = article({ platforms: [], genres: [], strengths: [], weaknesses: [] });
    expect(() => assertValidSharedReview(bare)).not.toThrow();
  });

  // El texto completo es justamente lo que se publica: no puede estar acotado a los 160 del canal social.
  it('accepts a review far longer than the social snippet', () => {
    expect(() => assertValidSharedReview(article({ review: 'a'.repeat(20_000) }))).not.toThrow();
  });
});

describe('shareSchema — campos privados y de identidad (falla cerrado)', () => {
  // `hours` es el caso realista: el componente de detalle que se reutiliza para la página pública lo recibe,
  // así que un descuido al construir el artículo lo colaría. Está en la denylist por eso.
  it('rejects hours', () => {
    expect(() => assertValidSharedReview({ ...article(), hours: 42.5 })).toThrow(/hours/);
  });

  it('rejects every private game field', () => {
    for (const field of ['score', 'steamDeck', 'retry', 'replayable', 'enteredAt', 'gradedAt']) {
      expect(() => assertValidSharedReview({ ...article(), [field]: 1 })).toThrow(new RegExp(field));
    }
  });

  it('rejects anything that identifies the author beyond the nick', () => {
    for (const field of ['uid', 'email', 'authorProfileId', 'profileId', 'gistId', 'socialGistId', 'token']) {
      expect(() => assertValidSharedReview({ ...article(), [field]: 'x' })).toThrow(new RegExp(field));
    }
  });

  // La foto se decidió que no viaja: ocultarla al pintar no evitaría que llegase al navegador del visitante.
  it('rejects the author photo', () => {
    expect(() => assertValidSharedReview({ ...article(), authorPhoto: 'https://x/y.png' })).toThrow(/authorPhoto/);
    expect(() => assertValidSharedReview({ ...article(), photoURL: 'https://x/y.png' })).toThrow(/photoURL/);
  });

  it('rejects a private field nested inside another object', () => {
    // El mensaje nombra el objeto que lo contiene, igual que `assertNoSocialPrivateFields`.
    expect(() => assertValidSharedReview({ ...article(), meta: { hours: 3 } })).toThrow(/'hours' en meta/);
  });

  it('rejects unknown fields even when they look harmless', () => {
    expect(() => assertValidSharedReview({ ...article(), color: 'azul' })).toThrow(/color/);
  });
});

describe('shareSchema — cotas y tipos', () => {
  it('rejects a review beyond the hard ceiling', () => {
    expect(() => assertValidSharedReview(article({ review: 'a'.repeat(100_001) }))).toThrow(/review/);
  });

  it('rejects an out-of-range score', () => {
    expect(() => assertValidSharedReview(article({ grade: 150 }))).toThrow(/grade/);
    expect(() => assertValidSharedReview(article({ rating: 9 }))).toThrow(/rating/);
  });

  it('rejects a flooded metadata list', () => {
    expect(() => assertValidSharedReview(article({ genres: Array(51).fill('x') }))).toThrow(/genres/);
  });

  it('rejects a missing required field', () => {
    const { authorNick: _omitted, ...withoutNick } = article();
    expect(() => assertValidSharedReview(withoutNick)).toThrow(/authorNick/);
  });

  it('rejects a future schema version', () => {
    expect(() => assertValidSharedReview({ ...article(), v: 2 })).toThrow();
  });
});

describe('lectura de la página pública', () => {
  const responder = (body: unknown, ok = true) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));

  it('returns the article when it is a version this screen can paint', async () => {
    responder(article());
    expect((await readSharedReview('TOKEN1234567890abcd'))?.gameName).toBe('Hollow Knight');
  });

  // Un artículo corrupto, vacío o de una versión futura no puede romperle la página a un visitante: se le enseña
  // lo mismo que si el enlace hubiera caducado.
  it('returns null for anything it cannot paint', async () => {
    for (const cuerpo of [null, {}, 'texto', { ...article(), v: 2 }]) {
      responder(cuerpo);
      expect(await readSharedReview('TOKEN1234567890abcd')).toBeNull();
    }
  });

  it('returns null when the request fails', async () => {
    responder({ error: 'no' }, false);
    expect(await readSharedReview('TOKEN1234567890abcd')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin red')));
    expect(await readSharedReview('TOKEN1234567890abcd')).toBeNull();
  });

  it('does not even ask without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await readSharedReview('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
