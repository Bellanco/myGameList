// RENOVAR TAMBIÉN DESDE AJUSTES.
//
// El detalle de una reseña compartida ya ofrecía «Renovar enlace»; la lista de Ajustes, que es donde se ven todos
// los enlaces juntos con su caducidad, solo dejaba copiar o retirar. Renovar desde aquí tiene que publicar lo
// MISMO que desde el detalle —el texto de ahora, sacado de la biblioteca— y no ofrecerse cuando la reseña ya no
// está: sin texto no hay con qué rehacer el enlace.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GameItem, TabData } from '../../src/model/types/game';

const share = (gameId: number, gameName: string) => ({
  token: `tok-${gameId}`, gameId, gameName, createdAt: Date.now(), expiresAt: Date.now() + 3 * 86_400_000,
});

const listMyShares = vi.hoisted(() => vi.fn());
const publishShare = vi.hoisted(() => vi.fn());

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  hasStoredAuthSession: () => false,
  getCurrentSocialAuthUser: async () => ({ uid: 'u1', displayName: 'Cuenta' }),
}));
vi.mock('../../src/model/repository/gistConfigRepository', () => ({ getSocialSyncConfig: () => null }));
vi.mock('../../src/model/repository/shareRepository', () => ({ listMyShares, publishShare, removeShare: vi.fn() }));

const { SharedReviewsCard } = await import('../../src/view/components/SharedReviewsCard');

const juego = { id: 1, name: 'Hades', review: '  Texto de ahora  ', grade: 90, score: 5, platforms: ['PC'], genres: [], _ts: 10 } as unknown as GameItem;
const biblioteca: TabData = { c: [juego], v: [], e: [], p: [], deleted: [], updatedAt: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  listMyShares.mockResolvedValue({
    // El 2 ya no está en la biblioteca.
    shares: [share(1, 'Hades'), share(2, 'Borrado')],
    quota: { maxActive: 5, ttlDays: 7 }, ban: null, nick: 'Yo', tier: 'bronze',
  });
  publishShare.mockResolvedValue({ token: 'tok-1', url: 'https://x/r/tok-1', expiresAt: Date.now(), renewed: true });
});

const fila = async (nombre: string) => (await screen.findByText(nombre)).closest('li') as HTMLElement;

describe('la lista de reseñas compartidas de Ajustes', () => {
  it('renueva con el texto de la biblioteca y lo acusa', async () => {
    render(<SharedReviewsCard enabled games={biblioteca} />);
    fireEvent.click(within(await fila('Hades')).getByRole('button', { name: 'Renovar enlace' }));

    await waitFor(() => expect(publishShare).toHaveBeenCalledTimes(1));
    expect(publishShare.mock.calls[0][0]).toMatchObject({ gameId: 1, gameName: 'Hades', review: 'Texto de ahora', grade: 90 });
    expect(await within(await fila('Hades')).findByRole('status')).toHaveTextContent('Enlace actualizado');
  });

  it('no ofrece renovar un enlace cuya reseña ya no está', async () => {
    render(<SharedReviewsCard enabled games={biblioteca} />);
    expect(within(await fila('Borrado')).queryByRole('button', { name: 'Renovar enlace' })).toBeNull();
    expect(within(await fila('Borrado')).getByRole('button', { name: 'Dejar de compartir' })).toBeTruthy();
  });
});
