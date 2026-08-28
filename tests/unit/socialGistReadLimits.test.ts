import { describe, expect, it } from 'vitest';
import { normalizeSocialGistForTests } from '../../src/model/repository/socialGistRepository';
import { SOCIAL_ID_MAX, SOCIAL_NAME_MAX } from '../../src/core/constants/socialLimits';
import { POST_HARD_CEILING } from '../../src/core/constants/tiers';

/**
 * El gist de un AMIGO se lee, se normaliza, se cachea en IndexedDB y se pinta en tu feed — y no pasa por el
 * esquema Zod, que solo corre al publicar el propio. Sin topes en la lectura, cualquiera con quien tengas
 * amistad puede poner en SU gist un nombre de juego de un megabyte y hacer que lo descargues, lo guardes y lo
 * pintes.
 *
 * No es inyección: React escapa el texto y las URLs se validan aparte. Es coste, y es el mismo agujero que la
 * allowlist de subclaves cerró en el perfil de Firestore.
 */
const BOMBA = 'x'.repeat(50_000);

describe('lectura de un gist social ajeno — cotas de longitud', () => {
  it('acota el nombre del perfil', () => {
    const data = normalizeSocialGistForTests({ profile: { name: BOMBA } });

    expect(data.profile.name.length).toBe(SOCIAL_NAME_MAX);
  });

  it('acota el nombre del juego y el del actor en la actividad', () => {
    const data = normalizeSocialGistForTests({
      activity: [
        { type: 'review', actorProfileId: 'p1', gameId: 7, gameName: BOMBA, actorName: BOMBA, createdAt: 1, updatedAt: 1 },
      ],
    });

    expect(data.activity).toHaveLength(1);
    expect(data.activity[0].gameName.length).toBe(SOCIAL_NAME_MAX);
    expect(data.activity[0].actorName.length).toBe(SOCIAL_NAME_MAX);
  });

  it('acota los identificadores, que acaban de clave de React y en la caché', () => {
    const data = normalizeSocialGistForTests({
      activity: [
        { type: 'review', actorProfileId: 'p1', gameId: 7, gameName: 'Juego', id: BOMBA, key: BOMBA, createdAt: 1, updatedAt: 1 },
      ],
    });

    expect(data.activity[0].id.length).toBeLessThanOrEqual(SOCIAL_ID_MAX);
    expect(data.activity[0].key.length).toBeLessThanOrEqual(SOCIAL_ID_MAX);
  });

  it('acota el nombre del autor de una publicación', () => {
    const data = normalizeSocialGistForTests({
      posts: [{ authorProfileId: 'p1', authorName: BOMBA, text: 'hola', createdAt: 1, updatedAt: 1 }],
    });

    expect(data.posts).toHaveLength(1);
    expect(data.posts?.[0].authorName.length).toBe(SOCIAL_NAME_MAX);
  });

  it('acota el texto de una publicación al techo absoluto del producto', () => {
    // `POST_HARD_CEILING` y no el tope genérico de texto: oro publica hasta 10.000 caracteres y mithril hasta
    // 100.000, así que recortar a 5.000 al leer mutilaría publicaciones legítimas de esos rangos.
    const enorme = 'x'.repeat(POST_HARD_CEILING + 10_000);
    const data = normalizeSocialGistForTests({
      posts: [{ authorProfileId: 'p1', authorName: 'Ada', text: enorme, createdAt: 1, updatedAt: 1 }],
    });

    expect(data.posts?.[0].text.length).toBe(POST_HARD_CEILING);
  });

  it('acota el nombre del juego en un mensaje de lista', () => {
    const data = normalizeSocialGistForTests({
      moves: [{ fromProfileId: 'p1', gameId: 7, gameName: BOMBA, tab: 'c', at: 1_700_000_000_000 }],
    });

    expect(data.moves).toHaveLength(1);
    expect(data.moves?.[0].gameName.length).toBe(SOCIAL_NAME_MAX);
  });

  it('no toca lo que ya cabe', () => {
    const data = normalizeSocialGistForTests({
      profile: { name: 'Ada Lovelace' },
      activity: [
        { type: 'review', actorProfileId: 'p1', gameId: 7, gameName: 'Hollow Knight', actorName: 'Ada', createdAt: 1, updatedAt: 1 },
      ],
    });

    expect(data.profile.name).toBe('Ada Lovelace');
    expect(data.activity[0].gameName).toBe('Hollow Knight');
    expect(data.activity[0].actorName).toBe('Ada');
  });
});
