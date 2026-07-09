import { describe, expect, it } from 'vitest';
import { upsertReviewActivity, type SocialGistData } from '../../src/model/repository/gistRepository';

// Regresión (bug reseña social): editar SOLO la nota/el nombre de un juego no debe recolocar la reseña al
// principio del feed (orden por `updatedAt`; solo se avanza cuando cambia el texto). Además, si la reseña aún
// no estaba publicada, cambiar solo nota/nombre NO debe estrenar una entrada nueva en el feed (opción B).
function baseData(): SocialGistData {
  return {
    profile: { name: 'Yo' },
    activity: [
      { type: 'review', key: 'p1:5:review', id: 'p1:5:review', actorProfileId: 'p1', actorName: 'Yo', gameId: 5, gameName: 'Celeste', rating: 4, snippet: 'me gustó', recommendationText: '', createdAt: 1_000, updatedAt: 1_000 },
    ],
    posts: [],
    updatedAt: 1_000,
  } as unknown as SocialGistData;
}

const input = {
  actorProfileId: 'p1',
  actorName: 'Yo',
  gameId: 5,
  gameName: 'Celeste',
  reviewText: 'me gustó',
  rating: 5, // nota distinta
};

describe('upsertReviewActivity — orden del feed al reeditar', () => {
  it('bumpOrder=false: sincroniza la nota pero CONSERVA updatedAt (no sube en el feed)', () => {
    const out = upsertReviewActivity(baseData(), { ...input, timestamp: 9_000, bumpOrder: false });
    const entry = out.activity.find((a) => a.gameId === 5)!;
    expect(entry.updatedAt).toBe(1_000); // posición original preservada
    expect(entry.rating).toBe(5); // dato sincronizado
  });

  it('bumpOrder=true (por defecto): la reseña se recoloca al principio con la nueva fecha', () => {
    const out = upsertReviewActivity(baseData(), { ...input, reviewText: 'me encantó', timestamp: 9_000, bumpOrder: true });
    const entry = out.activity.find((a) => a.gameId === 5)!;
    expect(entry.updatedAt).toBe(9_000);
  });

  it('bumpOrder=false + reseña NO publicada: no crea entrada y devuelve los datos intactos (no-op)', () => {
    const empty = { ...baseData(), activity: [] } as SocialGistData;
    const out = upsertReviewActivity(empty, { ...input, gameId: 7, gameName: 'Hades', reviewText: 'nuevo', timestamp: 9_000, bumpOrder: false });
    expect(out).toBe(empty); // misma referencia → publishReviewActivity se salta la reescritura del gist
    expect(out.activity.find((a) => a.gameId === 7)).toBeUndefined();
  });

  it('bumpOrder=true + reseña nueva: sí estrena la entrada en el feed', () => {
    const empty = { ...baseData(), activity: [] } as SocialGistData;
    const out = upsertReviewActivity(empty, { ...input, gameId: 7, gameName: 'Hades', reviewText: 'nuevo', timestamp: 9_000, bumpOrder: true });
    const entry = out.activity.find((a) => a.gameId === 7)!;
    expect(entry.updatedAt).toBe(9_000);
  });
});
