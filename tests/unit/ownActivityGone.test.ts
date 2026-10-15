// MI PROPIO BORRADO SE VE AL INSTANTE: el hub deja de pintar mi reseña o mi juego en cuanto mis listas lo borran,
// sin esperar a que el gist social se reescriba. Lo que se fija aquí es el criterio (qué cuenta como borrado) y que
// sea conservador: nada que mis listas no desmientan con un sello posterior —una reseña escrita en otro dispositivo
// que aún no ha llegado aquí— desaparece.
import { describe, expect, it } from 'vitest';
import { ownActivityGone } from '../../src/core/social/ownActivityGone';
import { withOwnLiveActivity } from '../../src/viewmodel/social/ownLiveActivity';
import type { SocialActivityFeedItem, SocialMoveFeedItem } from '../../src/viewmodel/social/socialFeed';
import type { GameItem, TabData, TabId } from '../../src/model/types/game';

const T = Date.parse('2026-10-15T10:00:00.000Z');

function game(id: number, over: Partial<GameItem> = {}): GameItem {
  return { id, _ts: T, name: `Juego ${id}`, platforms: ['PC'], genres: ['RPG'], steamDeck: false, review: 'Muy bueno', ...over };
}

function lists(over: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: T, ...over };
}

function activity(gameId: number, updatedAt: number, type: 'review' | 'recommendation' = 'review'): SocialActivityFeedItem {
  return {
    id: `a-${gameId}`,
    key: `pid:${gameId}:${type}`,
    type,
    actorProfileId: 'pid',
    actorName: 'Yo',
    gameId,
    gameName: `Juego ${gameId}`,
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'Muy bueno',
    createdAt: updatedAt,
    updatedAt,
    profileId: 'me',
    profileDisplayName: 'Yo',
    socialGistId: 'gist',
    photoURL: '',
  };
}

function move(gameId: number, tab: TabId, at: number, reviewActorId?: string): SocialMoveFeedItem {
  return {
    id: `${gameId}:${tab}`, gameId, gameName: `Juego ${gameId}`, tab, at, updatedAt: at,
    profileId: 'me', profileDisplayName: 'Yo', socialGistId: 'gist', photoURL: '', reviewActorId,
  };
}

describe('ownActivityGone — qué dan por desaparecido mis listas', () => {
  it('un juego borrado después de publicar su reseña se va', () => {
    const gone = ownActivityGone(lists({ deleted: [{ id: 1, _ts: T + 10 }] }));
    expect(gone.activity(activity(1, T))).toBe(true);
    expect(gone.game(1, T)).toBe(true);
  });

  it('una lápida más vieja que la publicación es de otra vida de ese id y no cuenta', () => {
    const gone = ownActivityGone(lists({ deleted: [{ id: 1, _ts: T - 10 }] }));
    expect(gone.activity(activity(1, T))).toBe(false);
    expect(gone.game(1, T)).toBe(false);
  });

  it('un juego que no está en mis listas ni tiene lápida (escrito en otro dispositivo) se queda', () => {
    expect(ownActivityGone(lists()).activity(activity(1, T))).toBe(false);
  });

  it('si el juego volvió a las listas, la lápida no manda', () => {
    const gone = ownActivityGone(lists({ c: [game(1, { _ts: T + 20 })], deleted: [{ id: 1, _ts: T + 10 }] }));
    expect(gone.activity(activity(1, T))).toBe(false);
    expect(gone.game(1, T)).toBe(false);
  });

  it('vaciar la reseña la retira; el juego sigue', () => {
    const gone = ownActivityGone(lists({ c: [game(1, { review: '   ', _ts: T + 10 })] }));
    expect(gone.activity(activity(1, T))).toBe(true);
    expect(gone.game(1, T)).toBe(false);
  });

  it('pasar el juego a próximos o deseados retira la reseña (igual que al guardar)', () => {
    expect(ownActivityGone(lists({ p: [game(1, { _ts: T + 10 })] })).activity(activity(1, T))).toBe(true);
    expect(ownActivityGone(lists({ d: [game(1, { _ts: T + 10 })] })).activity(activity(1, T))).toBe(true);
  });

  it('una publicación más nueva que mi copia local del juego se respeta', () => {
    const gone = ownActivityGone(lists({ c: [game(1, { review: '', _ts: T - 10 })] }));
    expect(gone.activity(activity(1, T))).toBe(false);
  });

  it('con reseña en mis listas, se queda', () => {
    expect(ownActivityGone(lists({ c: [game(1, { _ts: T + 10 })] })).activity(activity(1, T))).toBe(false);
  });

  it('la recomendación antigua solo se va con el juego, no por la reseña', () => {
    const gone = ownActivityGone(lists({ c: [game(1, { review: '', _ts: T + 10 })], deleted: [{ id: 2, _ts: T + 10 }] }));
    expect(gone.activity(activity(1, T, 'recommendation'))).toBe(false);
    expect(gone.activity(activity(2, T, 'recommendation'))).toBe(true);
  });
});

describe('withOwnLiveActivity — la entrada propia del directorio al día', () => {
  const isOwn = (id: string) => id === 'me';
  const entry = (id: string, over: Partial<{ activity: SocialActivityFeedItem[]; moves: SocialMoveFeedItem[]; hiddenMoves: SocialMoveFeedItem[] }> = {}) => ({
    id,
    activity: [] as SocialActivityFeedItem[],
    moves: [] as SocialMoveFeedItem[],
    ...over,
  });

  it('quita la reseña y los mensajes de lista del juego que acabo de borrar', () => {
    const directory = [
      entry('me', { activity: [activity(1, T), activity(2, T)], moves: [move(1, 'c', T), move(2, 'c', T)], hiddenMoves: [move(1, 'v', T)] }),
      entry('amigo', { activity: [activity(1, T)], moves: [move(1, 'c', T)] }),
    ];
    const games = lists({ c: [game(2)], deleted: [{ id: 1, _ts: T + 5 }] });

    const next = withOwnLiveActivity(directory, isOwn, games);

    expect(next[0].activity.map((item) => item.gameId)).toEqual([2]);
    expect(next[0].moves.map((item) => item.gameId)).toEqual([2]);
    expect(next[0].hiddenMoves).toEqual([]);
    // Lo ajeno no se toca: el id 1 de un amigo es otro juego.
    expect(next[1]).toBe(directory[1]);
  });

  it('al vaciar la reseña, el mensaje de lista se queda pero ya no enlaza a ella', () => {
    const directory = [entry('me', { activity: [activity(1, T)], moves: [move(1, 'c', T, 'pid')] })];
    const next = withOwnLiveActivity(directory, isOwn, lists({ c: [game(1, { review: '', _ts: T + 5 })] }));

    expect(next[0].activity).toEqual([]);
    expect(next[0].moves).toHaveLength(1);
    expect(next[0].moves[0].reviewActorId).toBeUndefined();
  });

  it('sin nada que quitar devuelve la misma referencia (no recalcula el feed)', () => {
    const directory = [entry('me', { activity: [activity(1, T)], moves: [move(1, 'c', T, 'pid')] })];
    expect(withOwnLiveActivity(directory, isOwn, lists({ c: [game(1)] }))).toBe(directory);
    expect(withOwnLiveActivity(directory, isOwn, null)).toBe(directory);
    expect(withOwnLiveActivity(directory, () => false, lists({ deleted: [{ id: 1, _ts: T + 5 }] }))).toBe(directory);
  });
});
