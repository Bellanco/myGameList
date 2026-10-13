import { describe, expect, it } from 'vitest';
import {
  buildLikeNotifications,
  likeSeenKey,
  ownLikeTargets,
  type LikeNotificationLiker,
} from '../../src/core/social/likeNotifications';
import type { SocialReactionEntry } from '../../src/core/social/reactions';

// docs/plan-notificaciones-y-buscador.md — los «me gusta» a lo tuyo, como filas de la campana.

const like = (on: 'activity' | 'post', to: string, item: string, at = 1, del?: true): SocialReactionEntry =>
  ({ on, to, item, kind: 'like', at, ...(del ? { del } : {}) });

const OWN = {
  activity: [
    { id: 'yo:7:review', type: 'review', actorProfileId: 'yo', gameId: 7, gameName: 'Hades' },
    { id: 'yo:8:recommendation', type: 'recommendation', actorProfileId: 'yo', gameId: 8, gameName: 'Celeste' },
  ],
  posts: [{ id: 'yo:p1', authorProfileId: 'yo', text: 'Maratón de Hades el finde' }],
};
const TARGETS = ownLikeTargets(OWN);
const ALL = { show: () => true, isNew: () => true };

const liker = (key: string, name: string, reactions: SocialReactionEntry[]): LikeNotificationLiker => ({ key, name, reactions });

describe('ownLikeTargets', () => {
  it('solo reseñas y publicaciones: la recomendación heredada no admite «me gusta»', () => {
    expect(TARGETS.map((target) => target.item)).toEqual(['yo:7:review', 'yo:p1']);
    expect(TARGETS[0]).toMatchObject({ on: 'activity', to: 'yo', gameId: 7, gameName: 'Hades' });
    expect(TARGETS[1]).toMatchObject({ on: 'post', to: 'yo', text: 'Maratón de Hades el finde' });
  });

  it('sin entrada propia no hay destinos', () => {
    expect(ownLikeTargets(null)).toEqual([]);
  });
});

describe('buildLikeNotifications', () => {
  it('una fila por destino, con los nombres del más reciente al más antiguo', () => {
    const rows = buildLikeNotifications([
      liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review', 10)]),
      liker('nacho', 'Nacho', [like('activity', 'yo', 'yo:7:review', 20), like('post', 'yo', 'yo:p1', 5)]),
    ], TARGETS, ALL);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ target: 'activity|yo|yo:7:review', names: ['Nacho', 'Marta'], hasNew: true, at: 20 });
    expect(rows[0].own.gameName).toBe('Hades');
    expect(rows[1]).toMatchObject({ target: 'post|yo|yo:p1', names: ['Nacho'] });
  });

  it('descarta lo que no es tuyo, las lápidas y los destinos que ya no existen', () => {
    const rows = buildLikeNotifications([
      liker('marta', 'Marta', [
        like('activity', 'otra', 'otra:7:review'), // de otra persona
        like('activity', 'yo', 'yo:7:review', 1, true), // quitado
        like('activity', 'yo', 'yo:99:review'), // reseña borrada
      ]),
    ], TARGETS, ALL);

    expect(rows).toEqual([]);
  });

  it('la clave de visto es persona + destino, sin el instante: quitar y volver a poner no avisa otra vez', () => {
    const seen = new Set([likeSeenKey('marta', { on: 'activity', to: 'yo', item: 'yo:7:review' })]);
    const rows = buildLikeNotifications(
      [liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review', 999)])],
      TARGETS,
      { show: (key) => !seen.has(key), isNew: (key) => !seen.has(key) },
    );

    expect(rows).toEqual([]);
  });

  it('solo lo nuevo: en una fila con alguien ya visto, sale solo quien no lo está', () => {
    const seen = new Set([likeSeenKey('marta', { on: 'activity', to: 'yo', item: 'yo:7:review' })]);
    const rows = buildLikeNotifications([
      liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review', 10)]),
      liker('nacho', 'Nacho', [like('activity', 'yo', 'yo:7:review', 5)]),
    ], TARGETS, { show: (key) => !seen.has(key), isNew: (key) => !seen.has(key) });

    expect(rows.map((row) => row.names)).toEqual([['Nacho']]);
  });

  it('lo ya enseñado en la visita sigue en la fila, pero no cuenta como nuevo', () => {
    const rows = buildLikeNotifications(
      [liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review')])],
      TARGETS,
      { show: () => true, isNew: () => false },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].hasNew).toBe(false);
  });

  it('la misma persona dos veces (deriva de gists) cuenta una sola vez', () => {
    const rows = buildLikeNotifications([
      liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review', 1)]),
      liker('marta', 'Marta', [like('activity', 'yo', 'yo:7:review', 3)]),
    ], TARGETS, ALL);

    expect(rows[0].names).toEqual(['Marta']);
    expect(rows[0].seenKeys).toHaveLength(1);
    expect(rows[0].at).toBe(3);
  });
});
