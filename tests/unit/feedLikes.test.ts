import { describe, expect, it } from 'vitest';
import { buildFeedLikes, likeTargetOf } from '../../src/core/social/feedLikes';
import type { SocialReactionEntry } from '../../src/core/social/reactions';

// FASE 3 de docs/plan-reacciones.md — a qué se le puede dar «me gusta» y quién se lo ha dado.

const REVIEW = { id: 'pm:42:review', type: 'review', actorProfileId: 'pm' };
const POST = { kind: 'post', id: 'pi:1728720000000', authorProfileId: 'pi' };

function like(on: 'activity' | 'post', to: string, item: string, at: number, del = false): SocialReactionEntry {
  return del ? { on, to, item, kind: 'like', at, del: true } : { on, to, item, kind: 'like', at };
}

describe('likeTargetOf', () => {
  it('reseñas y publicaciones admiten «me gusta», con el pseudónimo que firma en el gist', () => {
    expect(likeTargetOf(REVIEW)).toEqual({ on: 'activity', to: 'pm', item: 'pm:42:review' });
    expect(likeTargetOf(POST)).toEqual({ on: 'post', to: 'pi', item: 'pi:1728720000000' });
  });

  it('los avisos de lista, los logros, el resumen del año y las recomendaciones heredadas, no', () => {
    expect(likeTargetOf({ kind: 'move', id: '7:v', actorProfileId: 'pm' })).toBeNull();
    expect(likeTargetOf({ kind: 'achievements', id: 'x' })).toBeNull();
    expect(likeTargetOf({ kind: 'yearSummary', id: 'x' })).toBeNull();
    expect(likeTargetOf({ id: 'pm:42:recommendation', type: 'recommendation', actorProfileId: 'pm' })).toBeNull();
  });

  it('sin autor o sin id no hay destino', () => {
    expect(likeTargetOf({ ...REVIEW, actorProfileId: '' })).toBeNull();
    expect(likeTargetOf({ ...POST, authorProfileId: undefined })).toBeNull();
    expect(likeTargetOf({ ...REVIEW, id: '' })).toBeNull();
  });
});

describe('buildFeedLikes', () => {
  it('nombra a quien le ha dado «me gusta» por orden de llegada: los últimos son los que se quedan en «y a N más»', () => {
    const likesFor = buildFeedLikes(
      [
        { key: 'uid-lucia', name: 'Lucía', reactions: [like('activity', 'pm', REVIEW.id, 300)] },
        { key: 'uid-nacho', name: 'Nacho', reactions: [like('activity', 'pm', REVIEW.id, 100)] },
        { key: 'uid-ivan', name: 'Iván', reactions: [like('post', 'pi', POST.id, 200)] },
      ],
      [],
    );
    expect(likesFor(REVIEW)).toEqual({ names: ['Nacho', 'Lucía'], mine: false });
    expect(likesFor(POST)).toEqual({ names: ['Iván'], mine: false });
  });

  it('el administrador va el primero si le ha dado, aunque llegara el último', () => {
    const likesFor = buildFeedLikes(
      [
        { key: 'uid-nacho', name: 'Nacho', reactions: [like('activity', 'pm', REVIEW.id, 100)] },
        { key: 'uid-admin', name: 'Diego', admin: true, reactions: [like('activity', 'pm', REVIEW.id, 900)] },
        { key: 'uid-lucia', name: 'Lucía', reactions: [like('activity', 'pm', REVIEW.id, 300)] },
      ],
      [],
    );
    expect(likesFor(REVIEW).names).toEqual(['Diego', 'Nacho', 'Lucía']);
  });

  it('las lápidas no cuentan, y la misma persona no sale dos veces', () => {
    const likesFor = buildFeedLikes(
      [
        { key: 'uid-nacho', name: 'Nacho', reactions: [like('activity', 'pm', REVIEW.id, 100, true)] },
        { key: 'uid-lucia', name: 'Lucía', reactions: [like('activity', 'pm', REVIEW.id, 300)] },
        { key: 'uid-lucia', name: 'Lucía', reactions: [like('activity', 'pm', REVIEW.id, 400)] },
      ],
      [],
    );
    expect(likesFor(REVIEW).names).toEqual(['Lucía']);
  });

  it('lo tuyo va en `mine`, nunca entre los nombres', () => {
    const likesFor = buildFeedLikes([], [like('activity', 'pm', REVIEW.id, 100)]);
    expect(likesFor(REVIEW)).toEqual({ names: [], mine: true });
    expect(buildFeedLikes([], [like('activity', 'pm', REVIEW.id, 100, true)])(REVIEW).mine).toBe(false);
  });

  it('una reseña y una publicación con el mismo id no se mezclan', () => {
    const likesFor = buildFeedLikes([{ key: 'u', name: 'Marta', reactions: [like('post', 'pm', REVIEW.id, 1)] }], []);
    expect(likesFor(REVIEW).names).toEqual([]);
  });

  it('sin «me gusta», o en algo que no los admite, listas vacías', () => {
    const likesFor = buildFeedLikes([{ key: 'u', name: 'Marta', reactions: [like('activity', 'pm', 'otro', 1)] }], []);
    expect(likesFor(REVIEW)).toEqual({ names: [], mine: false });
    expect(likesFor({ kind: 'move', id: '7:v' })).toEqual({ names: [], mine: false });
  });
});
