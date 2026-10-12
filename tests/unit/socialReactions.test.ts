import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REACTIONS_FILE_VERSION,
  canRewriteReactionsFile,
  indexReactionsByTarget,
  mergeReactions,
  normalizeReactions,
  pruneReactions,
  reactionTargetKey,
  setReaction,
  type SocialReactionEntry,
} from '../../src/core/social/reactions';
import {
  SOCIAL_ID_MAX,
  SOCIAL_REACTION_TOMBSTONE_DAYS,
  SOCIAL_REACTION_TOMBSTONES_MAX,
  SOCIAL_REACTIONS_MAX,
} from '../../src/core/constants/socialLimits';
import { SOCIAL_REACTIONS_FILENAME } from '../../src/model/repository/socialProjection';
import { writeSocialGist, type SocialGistData } from '../../src/model/repository/socialGistRepository';
import { assertValidSocialReactions } from '../../src/model/schemas/socialReactionsSchema';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);

const REVIEW = { on: 'activity', to: 'perfil-marta', item: 'perfil-marta:42:review' } as const;
const POST = { on: 'post', to: 'perfil-ivan', item: 'perfil-ivan:1728720000000' } as const;

function like(target: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>, at: number): SocialReactionEntry {
  return { ...target, kind: 'like', at };
}
function tombstone(target: Pick<SocialReactionEntry, 'on' | 'to' | 'item'>, at: number): SocialReactionEntry {
  return { ...target, kind: 'like', at, del: true };
}
function nthTarget(n: number) {
  return { on: 'activity', to: 'perfil-x', item: `perfil-x:${n}:review` } as const;
}

// ─── Compatibilidad con las versiones ya desplegadas ─────────────────────────────────────────────────────────────
describe('el fichero de «me gusta» y las versiones ya desplegadas', () => {
  // COPIA LITERAL, no una referencia al código: es la expresión con la que las versiones que ya están en los
  // dispositivos de la gente borran ficheros del gist social (`writeSocialGist`). Aunque el código de hoy cambie,
  // esas versiones no cambian, así que esta copia no se toca.
  const DEPLOYED_CHUNK_DELETE = /^myGameList\.social-chunk-.+\.json$/;
  const DEPLOYED_MAIN_FILE = 'myGameList.social.json';

  it('no casa con la expresión de borrado de chunks ni es el fichero principal', () => {
    expect(DEPLOYED_CHUNK_DELETE.test(SOCIAL_REACTIONS_FILENAME)).toBe(false);
    expect(SOCIAL_REACTIONS_FILENAME).not.toBe(DEPLOYED_MAIN_FILE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('publicar por el camino de siempre no nombra el fichero, que sigue intacto en el gist', async () => {
    const reactions = JSON.stringify({ v: 1, updatedAt: NOW, items: [like(REVIEW, NOW)] });
    const store: Record<string, { content: string }> = {
      [DEPLOYED_MAIN_FILE]: { content: '{}' },
      [SOCIAL_REACTIONS_FILENAME]: { content: reactions },
    };
    const patchedNames: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
      if ((init.method || 'GET').toUpperCase() === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
        for (const [name, file] of Object.entries(body.files)) {
          patchedNames.push(name);
          if (file === null) delete store[name];
          else store[name] = file;
        }
      }
      return new Response(JSON.stringify({ files: store }), { status: 200, headers: { etag: 'W/"e"' } });
    }));

    const data = {
      profile: {
        name: 'Yo',
        private: false,
        visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
        sharedLists: {},
      },
      activity: [],
      updatedAt: 1,
      schemaVersion: 2,
    } as unknown as SocialGistData;
    await writeSocialGist('ghp_0123456789abcdefghij', 'abcdef99', data);

    expect(patchedNames).toContain(DEPLOYED_MAIN_FILE);
    expect(patchedNames).not.toContain(SOCIAL_REACTIONS_FILENAME);
    expect(store[SOCIAL_REACTIONS_FILENAME]?.content).toBe(reactions);
  });
});

// ─── Poner y quitar ──────────────────────────────────────────────────────────────────────────────────────────────
describe('setReaction', () => {
  it('pone un «me gusta» y lo quita dejando una lápida', () => {
    const liked = setReaction([], REVIEW, true, NOW);
    expect(liked).toEqual([like(REVIEW, NOW)]);

    const unliked = setReaction(liked, REVIEW, false, NOW + 1000);
    expect(unliked).toEqual([tombstone(REVIEW, NOW + 1000)]);
  });

  it('devuelve la MISMA lista cuando no cambia nada (quien escribe puede saltarse el PATCH)', () => {
    const empty: SocialReactionEntry[] = [];
    expect(setReaction(empty, REVIEW, false, NOW)).toBe(empty);

    const liked = [like(REVIEW, NOW)];
    expect(setReaction(liked, REVIEW, true, NOW + 1)).toBe(liked);

    const removed = [tombstone(REVIEW, NOW)];
    expect(setReaction(removed, REVIEW, false, NOW + 1)).toBe(removed);
  });

  it('volver a dar «me gusta» sustituye la lápida, sin duplicar el destino', () => {
    const again = setReaction([tombstone(REVIEW, NOW)], REVIEW, true, NOW + 5);
    expect(again).toEqual([like(REVIEW, NOW + 5)]);
  });

  it('reseña y publicación con el mismo id son destinos distintos', () => {
    const clash = { on: 'post', to: REVIEW.to, item: REVIEW.item } as const;
    const both = setReaction(setReaction([], REVIEW, true, NOW), clash, true, NOW + 1);
    expect(both).toHaveLength(2);
  });
});

// ─── Fusión entre dos dispositivos ───────────────────────────────────────────────────────────────────────────────
describe('mergeReactions', () => {
  it('gana la decisión más reciente, sea poner o quitar', () => {
    expect(mergeReactions([like(REVIEW, NOW)], [tombstone(REVIEW, NOW + 1)], NOW)).toEqual([tombstone(REVIEW, NOW + 1)]);
    expect(mergeReactions([tombstone(REVIEW, NOW)], [like(REVIEW, NOW + 1)], NOW)).toEqual([like(REVIEW, NOW + 1)]);
  });

  it('a igual instante gana quitar, venga de donde venga', () => {
    expect(mergeReactions([like(REVIEW, NOW)], [tombstone(REVIEW, NOW)], NOW)).toEqual([tombstone(REVIEW, NOW)]);
    expect(mergeReactions([tombstone(REVIEW, NOW)], [like(REVIEW, NOW)], NOW)).toEqual([tombstone(REVIEW, NOW)]);
  });

  it('es conmutativa y une destinos distintos', () => {
    const a = [like(REVIEW, NOW - 10), tombstone(POST, NOW - 5)];
    const b = [like(POST, NOW - 1), like(nthTarget(7), NOW - 20)];
    expect(mergeReactions(a, b, NOW)).toEqual(mergeReactions(b, a, NOW));
    expect(mergeReactions(a, b, NOW).map(reactionTargetKey)).toHaveLength(3);
  });
});

// ─── Topes ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe('pruneReactions', () => {
  it('un «me gusta» vivo no caduca por fecha', () => {
    const old = like(REVIEW, NOW - 400 * DAY);
    expect(pruneReactions([old], NOW)).toEqual([old]);
  });

  it(`conserva los ${SOCIAL_REACTIONS_MAX} vivos más recientes`, () => {
    const many = Array.from({ length: SOCIAL_REACTIONS_MAX + 20 }, (_, n) => like(nthTarget(n), NOW - n * 1000));
    const kept = pruneReactions(many, NOW);
    expect(kept).toHaveLength(SOCIAL_REACTIONS_MAX);
    expect(kept[0].at).toBe(NOW);
    expect(kept.at(-1)?.at).toBe(NOW - (SOCIAL_REACTIONS_MAX - 1) * 1000);
  });

  it(`las lápidas caducan a los ${SOCIAL_REACTION_TOMBSTONE_DAYS} días y tienen su propio tope`, () => {
    const fresh = tombstone(REVIEW, NOW - (SOCIAL_REACTION_TOMBSTONE_DAYS - 1) * DAY);
    const stale = tombstone(POST, NOW - (SOCIAL_REACTION_TOMBSTONE_DAYS + 1) * DAY);
    expect(pruneReactions([fresh, stale], NOW)).toEqual([fresh]);

    const many = Array.from({ length: SOCIAL_REACTION_TOMBSTONES_MAX + 5 }, (_, n) => tombstone(nthTarget(n), NOW - n));
    expect(pruneReactions(many, NOW)).toHaveLength(SOCIAL_REACTION_TOMBSTONES_MAX);
  });

  it('las lápidas no le quitan sitio a los vivos', () => {
    const live = Array.from({ length: SOCIAL_REACTIONS_MAX }, (_, n) => like(nthTarget(n), NOW - 10_000 - n));
    const dead = Array.from({ length: 10 }, (_, n) => tombstone(nthTarget(1000 + n), NOW - n));
    const kept = pruneReactions([...dead, ...live], NOW);
    expect(kept.filter((entry) => !entry.del)).toHaveLength(SOCIAL_REACTIONS_MAX);
    expect(kept.filter((entry) => entry.del)).toHaveLength(10);
  });
});

// ─── Lectura defensiva del gist de otro ──────────────────────────────────────────────────────────────────────────
describe('normalizeReactions', () => {
  it('un fichero ausente o sin forma es una lista vacía, nunca un fallo', () => {
    for (const raw of [undefined, null, 'texto', 42, {}, { items: 'no' }]) {
      expect(normalizeReactions(raw, NOW)).toEqual([]);
    }
  });

  it('descarta entrada a entrada lo que no tiene forma, y los tipos que esta versión no conoce', () => {
    const raw = {
      v: 1,
      items: [
        like(REVIEW, NOW),
        { ...like(POST, NOW), kind: 'love' },
        { ...like(POST, NOW), on: 'move' },
        { ...like(POST, NOW), to: '' },
        { ...like(POST, NOW), at: 'ayer' },
        { ...like(POST, NOW), at: -5 },
        null,
        'basura',
      ],
    };
    expect(normalizeReactions(raw, NOW)).toEqual([like(REVIEW, NOW)]);
  });

  it('no arrastra campos de más y recorta los ids al tope del canal', () => {
    const long = 'x'.repeat(SOCIAL_ID_MAX + 50);
    const [entry] = normalizeReactions({ items: [{ ...like(REVIEW, NOW), item: long, extra: 'fuga' }] }, NOW);
    expect(entry).toEqual({ ...like(REVIEW, NOW), item: long.slice(0, SOCIAL_ID_MAX) });
  });

  it('deduplica destinos repetidos quedándose con el más reciente', () => {
    const raw = { items: [like(REVIEW, NOW - 5), tombstone(REVIEW, NOW)] };
    expect(normalizeReactions(raw, NOW)).toEqual([tombstone(REVIEW, NOW)]);
  });
});

describe('canRewriteReactionsFile', () => {
  it('no reescribe un fichero de una versión más nueva del formato', () => {
    expect(canRewriteReactionsFile({ v: REACTIONS_FILE_VERSION + 1, items: [] })).toBe(false);
  });

  it('sí reescribe el de su versión, uno anterior, uno sin versión o uno que no existe', () => {
    expect(canRewriteReactionsFile({ v: REACTIONS_FILE_VERSION, items: [] })).toBe(true);
    expect(canRewriteReactionsFile({ v: 0, items: [] })).toBe(true);
    expect(canRewriteReactionsFile({ items: [] })).toBe(true);
    expect(canRewriteReactionsFile(undefined)).toBe(true);
  });
});

// ─── Cruce para el feed ──────────────────────────────────────────────────────────────────────────────────────────
describe('indexReactionsByTarget', () => {
  it('lista quién ha dado «me gusta» a cada destino, sin lápidas ni repetidos', () => {
    const index = indexReactionsByTarget([
      { fromProfileId: 'perfil-nacho', items: [like(REVIEW, NOW), tombstone(POST, NOW)] },
      { fromProfileId: 'perfil-lucia', items: [like(REVIEW, NOW), like(POST, NOW)] },
      { fromProfileId: 'perfil-nacho', items: [like(REVIEW, NOW)] },
    ]);
    expect(index.get(reactionTargetKey(REVIEW))).toEqual(['perfil-nacho', 'perfil-lucia']);
    expect(index.get(reactionTargetKey(POST))).toEqual(['perfil-lucia']);
  });
});

// ─── Esquema de escritura ────────────────────────────────────────────────────────────────────────────────────────
describe('assertValidSocialReactions', () => {
  it('acepta lo que produce setReaction', () => {
    const items = setReaction(setReaction([], REVIEW, true, NOW), POST, true, NOW + 1);
    expect(() => assertValidSocialReactions({ v: REACTIONS_FILE_VERSION, updatedAt: NOW, items })).not.toThrow();
    const withTombstone = setReaction(items, REVIEW, false, NOW + 2);
    expect(() => assertValidSocialReactions({ v: REACTIONS_FILE_VERSION, updatedAt: NOW, items: withTombstone })).not.toThrow();
  });

  it('rechaza campos de más, otra versión y tipos de reacción que no existen', () => {
    expect(() => assertValidSocialReactions({ v: 1, updatedAt: NOW, items: [{ ...like(REVIEW, NOW), uid: 'firebase' }] })).toThrow();
    expect(() => assertValidSocialReactions({ v: 2, updatedAt: NOW, items: [] })).toThrow();
    expect(() => assertValidSocialReactions({ v: 1, updatedAt: NOW, items: [{ ...like(REVIEW, NOW), kind: 'love' }] })).toThrow();
    expect(() => assertValidSocialReactions({ v: 1, updatedAt: NOW, items: [], extra: true })).toThrow();
  });
});
