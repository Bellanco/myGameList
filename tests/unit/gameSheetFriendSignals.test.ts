import { describe, expect, it } from 'vitest';
import { friendSignalsFromDirectory, type CachedFriendEntry } from '../../src/viewmodel/gameSheet/gameSheetFriendSignals';
import { buildGameSheet } from '../../src/core/gameSheet/buildGameSheet';
import type { TabData } from '../../src/model/types/game';

// LAS AMISTADES DE LA FICHA SALEN DE LA COPIA DEL DIRECTORIO SOCIAL (F3): sus reseñas y sus avisos de lista, sin red.
// Lo que importa aquí es la regla 1 —solo amistades— y que lo que llega se lea bien: notas viejas en estrellas,
// avisos con una lista que no existe, entradas sin nombre.

const marta: CachedFriendEntry = {
  id: 'p-marta',
  uid: 'u-marta',
  displayName: 'Marta',
  photoURL: 'https://example.test/marta.jpg',
  activity: [{ gameName: 'Hollow Knight', grade: 92, rating: 5, snippet: 'Un mapa que se descubre a mano.', updatedAt: 10 }],
  moves: [{ gameName: 'Hades', tab: 'e', at: 20 }],
};
const desconocido: CachedFriendEntry = {
  id: 'p-otro',
  uid: 'u-otro',
  displayName: 'Alguien',
  activity: [{ gameName: 'Hollow Knight', grade: 10, snippet: 'No.', updatedAt: 5 }],
};
const yo: CachedFriendEntry = { id: 'p-yo', uid: 'u-yo', displayName: 'Yo', moves: [{ gameName: 'Hades', tab: 'c', at: 30 }] };

function biblioteca(): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 };
}

describe('friendSignalsFromDirectory', () => {
  it('con la huella de amistades, solo entran ellas: ni quien no lo es ni tú', () => {
    const signals = friendSignalsFromDirectory([marta, desconocido, yo], new Set(['u-marta', 'u-yo']), 'u-yo');
    expect(signals.map((signal) => signal.friend.name)).toEqual(['Marta', 'Marta']);
  });

  it('sin huella (copia vieja), cuenta quien trae algo de su canal, que solo se lee de amistades', () => {
    const callado: CachedFriendEntry = { id: 'p-callado', uid: 'u-callado', displayName: 'Callado' };
    const signals = friendSignalsFromDirectory([marta, callado, yo], null, 'u-yo');
    expect(new Set(signals.map((signal) => signal.friend.id))).toEqual(new Set(['p-marta']));
  });

  it('la amistad se identifica por el id del directorio, que es el que abre su perfil, y lleva su foto', () => {
    const [review] = friendSignalsFromDirectory([marta], new Set(['u-marta']), '');
    expect(review.friend).toEqual({ id: 'p-marta', name: 'Marta', photoURL: 'https://example.test/marta.jpg' });
  });

  it('la reseña trae su nota fina y, en la forma vieja, la de estrellas pasada a 0–100', () => {
    const vieja: CachedFriendEntry = { id: 'p-n', uid: 'u-n', displayName: 'Nacho', activity: [{ gameName: 'Celeste', rating: 4, snippet: 'x', updatedAt: 1 }] };
    const sinNota: CachedFriendEntry = { id: 'p-l', uid: 'u-l', displayName: 'Lucía', activity: [{ gameName: 'Celeste', snippet: 'y', updatedAt: 1 }] };
    const signals = friendSignalsFromDirectory([marta, vieja, sinNota], new Set(['u-marta', 'u-n', 'u-l']), '');
    const notas = signals.filter((signal) => signal.kind === 'review').map((signal) => (signal.kind === 'review' ? signal.grade : undefined));
    expect(notas).toEqual([92, 80, null]);
  });

  it('descarta avisos con una lista que no existe, entradas sin juego y amistades sin nombre', () => {
    const rara: CachedFriendEntry = {
      id: 'p-r',
      uid: 'u-r',
      displayName: 'Rara',
      activity: [{ snippet: 'sin juego', updatedAt: 1 }],
      moves: [{ gameName: 'Hades', tab: 'x', at: 1 }, { tab: 'c', at: 1 }],
    };
    const sinNombre: CachedFriendEntry = { id: 'p-s', uid: 'u-s', displayName: '  ', moves: [{ gameName: 'Hades', tab: 'c', at: 1 }] };
    expect(friendSignalsFromDirectory([rara, sinNombre], new Set(['u-r', 'u-s']), '')).toEqual([]);
  });

  it('montan la ficha: la reseña pone adelanto y nota, y el aviso dice dónde lo tiene', () => {
    const signals = friendSignalsFromDirectory([marta], new Set(['u-marta']), '');
    const hollow = buildGameSheet({ slug: 'hollow-knight', own: biblioteca(), signals });
    expect(hollow.friends).toEqual([
      expect.objectContaining({ name: 'Marta', tab: 'c', grade: 92, snippet: 'Un mapa que se descubre a mano.' }),
    ]);
    expect(hollow.average).toEqual({ grade: 92, count: 1 });
    const hades = buildGameSheet({ slug: 'hades', own: biblioteca(), signals });
    expect(hades.friends).toEqual([expect.objectContaining({ name: 'Marta', tab: 'e', grade: null, snippet: '' })]);
  });
});
