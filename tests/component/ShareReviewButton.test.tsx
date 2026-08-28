import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GameItem } from '../../src/model/types/game';
import type { ShareViewModel } from '../../src/viewmodel/useShareViewModel';

// El botón trae su propio view-model (habla con `/api/share` y con Firebase). Aquí se prueba QUÉ se pinta en cada
// estado de ese view-model, así que se sustituye entero.
const shareMocks = vi.hoisted(() => ({ useShareViewModel: vi.fn() }));

vi.mock('../../src/viewmodel/useShareViewModel', () => shareMocks);

import { ShareReviewButton } from '../../src/view/components/stats/ShareReviewButton';
import { SHARE_UI } from '../../src/core/constants/shareLabels';

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
    nick: 'Me',
    nickIsAccountName: false,
    loading: false,
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
describe('ShareReviewButton — cuando no se puede compartir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a quien usa el espacio social y no tiene sesión le explica qué falta en vez de desaparecer', () => {
    withViewModel({ available: false, hasSocialSpace: true });
    render(<ShareReviewButton game={game} reviewText="Enorme de principio a fin" />);

    expect(screen.getByText(SHARE_UI.signInRequired)).toBeInTheDocument();
    expect(screen.getByTitle(SHARE_UI.signInRequiredHint)).toBeInTheDocument();
    // Y no se ofrece un botón que solo llevaría a un 401.
    expect(screen.queryByRole('button', { name: SHARE_UI.actionAria })).not.toBeInTheDocument();
  });

  it('a quien nunca ha abierto el espacio social no le dice nada', () => {
    // Esa persona no echa en falta ningún botón: el aviso sería ruido en su panel de reseñas sobre algo que no ha
    // pedido. Sin espacio social en este navegador, el componente sigue callado.
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
