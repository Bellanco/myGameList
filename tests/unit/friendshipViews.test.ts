import { describe, expect, it } from 'vitest';
import { buildFriendshipViews, toFriendshipRequestView } from '../../src/viewmodel/social/friendshipViews';
import type { FriendshipView, MyFriendships } from '../../src/model/types/social';

/**
 * Filas de la bandeja y de la gestión de amistades.
 *
 * Esta lógica vivía dentro de `useSocialViewModel` como un `useCallback` entre otros noventa valores, así que
 * comprobarla exigía montar el hub entero. Al salir a una función pura se puede fijar lo que de verdad importa,
 * que son dos reglas de PRIVACIDAD fáciles de romper sin darse cuenta:
 *
 *  - el nombre sale SOLO del nick denormalizado en el documento de amistad, nunca del `displayName` del
 *    directorio, que puede ser el nombre real de la cuenta de Google;
 *  - la foto pasa por la reciprocidad, así que la cara de quien te manda una solicitud NO se ve todavía.
 */

const viewer = { showsOwnPhoto: true, tier: 'silver' as const };

function makeView(over: Partial<FriendshipView> = {}): FriendshipView {
  return {
    docId: 'uid-a__uid-b',
    otherUid: 'uid-b',
    otherName: 'Ada',
    otherPhoto: '',
    state: 'incoming',
    ...over,
  } as FriendshipView;
}

describe('friendshipViews', () => {
  const deps = (over: Partial<Parameters<typeof toFriendshipRequestView>[1]> = {}) => ({
    directory: [],
    friendUids: new Set<string>(),
    viewer,
    ...over,
  });

  it('usa el nick del documento de amistad, no el nombre del directorio', () => {
    const row = toFriendshipRequestView(
      makeView({ otherName: 'Nick público' }),
      deps({ directory: [{ uid: 'uid-b', photoURL: '' }] }),
    );

    expect(row.name).toBe('Nick público');
  });

  it('cae a un genérico cuando el documento no trae nick, nunca al correo ni al nombre real', () => {
    const row = toFriendshipRequestView(makeView({ otherName: '' }), deps());

    expect(row.name).toBeTruthy();
    expect(row.name).not.toContain('@');
  });

  it('oculta la cara de quien solo ha enviado una solicitud', () => {
    // Sin amistad aceptada no hay foto: una petición pendiente no es amistad.
    const row = toFriendshipRequestView(
      makeView({ otherPhoto: 'https://lh3.googleusercontent.com/a/cara' }),
      deps({ friendUids: new Set<string>() }),
    );

    expect(row.photo).toBe('');
  });

  it('enseña la cara cuando la amistad ya está aceptada', () => {
    const row = toFriendshipRequestView(
      makeView({ otherPhoto: 'https://lh3.googleusercontent.com/a/cara' }),
      deps({ friendUids: new Set(['uid-b']) }),
    );

    expect(row.photo).toBe('https://lh3.googleusercontent.com/a/cara');
  });

  it('completa la foto desde el directorio cuando el documento de amistad aún no la trae', () => {
    // Una petición ENVIADA no guarda los datos del destinatario hasta que acepta.
    const row = toFriendshipRequestView(
      makeView({ otherPhoto: '' }),
      deps({ directory: [{ uid: 'uid-b', photoURL: 'https://lh3.googleusercontent.com/a/dir' }], friendUids: new Set(['uid-b']) }),
    );

    expect(row.photo).toBe('https://lh3.googleusercontent.com/a/dir');
  });

  it('reparte las tres listas conservando el orden de cada una', () => {
    const friendships = {
      incoming: [makeView({ otherUid: 'in-1', otherName: 'Entrante' })],
      outgoing: [makeView({ otherUid: 'out-1', otherName: 'Saliente' })],
      friends: [makeView({ otherUid: 'fr-1', otherName: 'Amiga' }), makeView({ otherUid: 'fr-2', otherName: 'Amigo' })],
      byOtherUid: {},
    } as unknown as MyFriendships;

    const views = buildFriendshipViews(friendships, deps());

    expect(views.incoming.map((r) => r.name)).toEqual(['Entrante']);
    expect(views.outgoing.map((r) => r.name)).toEqual(['Saliente']);
    expect(views.friends.map((r) => r.name)).toEqual(['Amiga', 'Amigo']);
  });
});
