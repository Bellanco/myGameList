import { describe, expect, it } from 'vitest';
import { upsertPost, type SocialGistData } from '../../src/model/repository/gistRepository';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';

function baseGist(): SocialGistData {
  return {
    profile: {
      name: 'Autor',
      private: false,
      favoriteGames: [],
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    updatedAt: 1000,
    schemaVersion: 2,
  };
}

describe('F3 — publicaciones del feed social', () => {
  it('upsertPost añade un post al principio y preserva el resto del gist', () => {
    const data = baseGist();
    const next = upsertPost(data, { authorProfileId: 'p1', authorName: 'Autor', text: 'Hola https://example.com', timestamp: 2000 });

    expect(next.posts).toHaveLength(1);
    expect(next.posts?.[0]).toMatchObject({ authorProfileId: 'p1', authorName: 'Autor', text: 'Hola https://example.com' });
    expect(next.posts?.[0].id).toBe('p1:2000');
    // No toca la actividad ni el perfil.
    expect(next.activity).toEqual(data.activity);
    expect(next.profile).toEqual(data.profile);

    const second = upsertPost(next, { authorProfileId: 'p1', authorName: 'Autor', text: 'Segundo', timestamp: 3000 });
    expect(second.posts).toHaveLength(2);
    expect(second.posts?.[0].text).toBe('Segundo'); // el más reciente primero
  });

  it('upsertPost es no-op sin autor o sin texto, y cota la longitud', () => {
    const data = baseGist();
    expect(upsertPost(data, { authorProfileId: '', authorName: 'X', text: 'algo' }).posts).toHaveLength(0);
    expect(upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: '   ' }).posts).toHaveLength(0);

    const long = upsertPost(data, { authorProfileId: 'p1', authorName: 'X', text: 'a'.repeat(2000), timestamp: 1 });
    expect(long.posts?.[0].text.length).toBe(1000);
  });

  it('el schema estricto acepta gists con y sin posts, y rechaza campos extra (allowlist)', () => {
    // Sin posts (campo opcional).
    const noPosts = baseGist();
    delete noPosts.posts;
    expect(() => assertValidSocialGist(noPosts)).not.toThrow();

    // Con un post válido.
    const withPost = upsertPost(baseGist(), { authorProfileId: 'p1', authorName: 'Autor', text: 'Noticia', timestamp: 5 });
    expect(() => assertValidSocialGist(withPost)).not.toThrow();

    // Un post con un campo fuera de la allowlist debe fallar.
    const hostile = baseGist();
    hostile.posts = [{
      id: 'p1:5', authorProfileId: 'p1', authorName: 'A', text: 'x', createdAt: 5, updatedAt: 5,
      // @ts-expect-error campo no permitido por el strictObject
      review: 'fuga',
    }];
    expect(() => assertValidSocialGist(hostile)).toThrow();
  });
});
