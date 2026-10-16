import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameItem } from '../../src/model/types/game';
import type { ShareViewModel } from '../../src/viewmodel/useShareViewModel';

// El botón trae su propio view-model (habla con `/api/share` y con Firebase). Aquí se prueba QUÉ se pinta en cada
// estado de ese view-model, así que se sustituye entero.
const shareMocks = vi.hoisted(() => ({ useShareViewModel: vi.fn() }));

vi.mock('../../src/viewmodel/useShareViewModel', () => shareMocks);

import { ShareReviewButton } from '../../src/view/components/stats/ShareReviewButton';
import { SHARE_UI } from '../../src/core/constants/shareLabels';
import { SHARE_INVITE_DECLINED_KEY, SHARE_TIP_SEEN_KEY } from '../../src/core/constants/storageKeys';
import { declineShareInvite } from '../../src/model/repository/shareInviteStore';

const game = {
  id: 99,
  name: 'Elden Ring',
  review: 'Enorme de principio a fin',
  score: 5,
  grade: 100,
  platforms: [],
  genres: [],
  strengths: [],
  weaknesses: [],
  reasons: [],
  hours: 0,
  _ts: 1,
} as unknown as GameItem;

function withViewModel(overrides: Partial<ShareViewModel>) {
  shareMocks.useShareViewModel.mockReturnValue({
    shares: [],
    quota: { maxActive: 5, ttlDays: 7 },
    ban: null,
    available: true,
    hasSocialSpace: true,
    loading: false,
    serviceDown: false,
    busyToken: null,
    error: '',
    errorDetails: {},
    refresh: vi.fn(async () => {}),
    share: vi.fn(async () => null),
    revoke: vi.fn(async () => false),
    shareOf: () => null,
    clearError: vi.fn(),
    ...overrides,
  } satisfies ShareViewModel);
}

/**
 * Qué ve el usuario cuando NO se le puede ofrecer compartir.
 *
 * Regresión de producto: sin sesión de Google el componente devolvía `null`, así que el botón simplemente no
 * estaba y no había forma de saber por qué. El síntoma que llegó fue «no me sale el botón de compartir», sin más
 * pistas. Ahora se dice qué falta; solo el estado "aún no se sabe" sigue sin pintar nada.
 */
// docs/plan-degradacion-servicios.md, fase 3: con el servicio de compartir sin atender (cupo agotado), el botón no
// se ofrece. Antes seguía ahí y al abrirlo salía un error en rojo, y la marca «Compartida» desaparecía.
describe('ShareReviewButton — con el servicio de compartir sin atender', () => {
  it('no ofrece el botón', () => {
    withViewModel({ serviceDown: true });
    const { container } = render(<ShareReviewButton game={game} reviewText="Texto" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ShareReviewButton — cuando no se puede compartir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // La marca «Nuevo» tiene sus propias pruebas, abajo.
    localStorage.setItem(SHARE_TIP_SEEN_KEY, 'on');
  });

  it('a quien usa el espacio social y no tiene sesión le explica qué falta en vez de desaparecer', () => {
    withViewModel({ available: false, hasSocialSpace: true });
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(screen.getByText(SHARE_UI.signInRequired)).toBeInTheDocument();
    expect(screen.getByTitle(SHARE_UI.signInRequiredHint)).toBeInTheDocument();
    // Y no se ofrece un botón que solo llevaría a un 401.
    expect(screen.queryByRole('button', { name: SHARE_UI.actionAria })).not.toBeInTheDocument();
  });

  it('a quien nunca ha abierto el espacio social le ofrece el botón, y pulsarlo pide que se le explique', async () => {
    // Sin el botón no había forma de saber que compartir existe (12-10-2026). Al pulsarlo no se abre el diálogo de
    // publicar —sin identidad acabaría en un 401—: quien lo monta pide a la guía que cuente por qué.
    withViewModel({ available: false, hasSocialSpace: false });
    const onSocialInvite = vi.fn();
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" onSocialInvite={onSocialInvite} />);

    const button = screen.getByRole('button', { name: SHARE_UI.actionAria });
    expect(button).toHaveAttribute('data-tour', 'share-review');
    await userEvent.click(button);
    expect(onSocialInvite).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(SHARE_UI.signInRequired)).not.toBeInTheDocument();
  });

  it('tras contestar «Ahora no» a la explicación, el botón se va: sin lo social no hace nada', async () => {
    withViewModel({ available: false, hasSocialSpace: false });
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" onSocialInvite={vi.fn()} />);
    expect(screen.getByRole('button', { name: SHARE_UI.actionAria })).toBeInTheDocument();

    act(() => declineShareInvite());
    expect(screen.queryByRole('button', { name: SHARE_UI.actionAria })).not.toBeInTheDocument();
    expect(localStorage.getItem(SHARE_INVITE_DECLINED_KEY)).toBe('on');
  });

  it('con lo social, la respuesta de antes no esconde el botón de verdad', () => {
    localStorage.setItem(SHARE_INVITE_DECLINED_KEY, 'on');
    withViewModel({});
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" onSocialInvite={vi.fn()} />);
    expect(screen.getByRole('button', { name: SHARE_UI.actionAria })).toBeInTheDocument();
  });

  it('sin quien explique por qué, a quien nunca ha abierto el espacio social no le ofrece nada', () => {
    withViewModel({ available: false, hasSocialSpace: false });
    const { container } = render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('mientras no se sabe si hay sesión no pinta nada', () => {
    // Enseñar el aviso (o el botón) y quitarlo medio segundo después es peor que esperar a saberlo.
    withViewModel({ available: null });
    const { container } = render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('con veto sigue diciendo que es un veto, no una falta de sesión', () => {
    withViewModel({ ban: { bannedAt: 1, by: 'admin', reason: 'spam' } });
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(screen.getByText(SHARE_UI.bannedTitle)).toBeInTheDocument();
    expect(screen.queryByText(SHARE_UI.signInRequired)).not.toBeInTheDocument();
  });

  it('con sesión y sin veto ofrece el botón', () => {
    withViewModel({});
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(screen.getByRole('button', { name: SHARE_UI.actionAria })).toBeInTheDocument();
    expect(screen.queryByText(SHARE_UI.signInRequired)).not.toBeInTheDocument();
  });
});

/**
 * LA MARCA «NUEVO» (12-10-2026): quien ya tenía lo social no pasó por la guía, y nada le señalaba el botón. El chip
 * de cada tema lo marca junto al botón, solo a quien no tiene nada compartido, y UNA vez: en cuanto se ve, no vuelve.
 */
describe('ShareReviewButton — la marca «Nuevo»', () => {
  const nuevo = () => screen.queryByText(SHARE_UI.newBadge);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('sale a quien nunca ha compartido, con el chip del tema, y en cuanto se ve no vuelve a salir', () => {
    withViewModel({});
    const { unmount } = render(<ShareReviewButton game={game} reviewText="Texto" />);
    expect(nuevo()).toHaveClass('hub-feed-game-chip');
    expect(localStorage.getItem(SHARE_TIP_SEEN_KEY)).toBe('on');

    // Se va a otra reseña sin pulsar nada.
    unmount();
    render(<ShareReviewButton game={{ ...game, id: 100, name: 'Otro' } as GameItem} reviewText="Otro texto" />);
    expect(nuevo()).toBeNull();
  });

  it('pulsar «Compartir» la quita en el acto', async () => {
    withViewModel({});
    render(<ShareReviewButton game={game} reviewText="Texto" />);
    expect(nuevo()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: SHARE_UI.actionAria }));
    expect(nuevo()).toBeNull();
  });

  it('no sale a quien ya tiene algo compartido, ni mientras su lista no ha llegado, y no se gasta', () => {
    withViewModel({ shares: [{ token: 't', gameId: 1, gameName: 'Otro', createdAt: 1, expiresAt: Date.now() + 1e6 }] });
    const { unmount } = render(<ShareReviewButton game={game} reviewText="Texto" />);
    expect(nuevo()).toBeNull();
    unmount();

    withViewModel({ quota: null });
    render(<ShareReviewButton game={game} reviewText="Texto" />);
    expect(nuevo()).toBeNull();
    expect(localStorage.getItem(SHARE_TIP_SEEN_KEY)).toBeNull();
  });

  it('sin el botón de verdad (sin sesión, vetado o sin servicio) ni sale ni se gasta', () => {
    for (const estado of [{ available: false, hasSocialSpace: true }, { ban: { bannedAt: 1, by: 'admin', reason: 'x' } }, { serviceDown: true }]) {
      withViewModel(estado);
      const { unmount } = render(<ShareReviewButton game={game} reviewText="Texto" />);
      expect(nuevo()).toBeNull();
      unmount();
    }
    expect(localStorage.getItem(SHARE_TIP_SEEN_KEY)).toBeNull();
  });
});
