import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';

// docs/plan-notificaciones-y-buscador.md, B2 — el buscador general: atajos, resultados y adónde lleva.

vi.mock('../../src/viewmodel/search/searchSources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/viewmodel/search/searchSources')>();
  return {
    ...actual,
    loadSocialSearchSources: vi.fn(async () => ({
      reviews: [{ id: 'review:m:1', title: 'Celeste', detail: 'Reseña de Marta', path: '/social/user/pm/game/7/review' }],
      friends: [{ id: 'friend:m', title: 'Marta', detail: 'Perfil de tu amistad', path: '/social/profiles/uid-marta' }],
      hasSocial: true,
    })),
  };
});

const { GlobalSearch, SEARCH_LAUNCHER_SLOT_ID: SLOT_EN_EL_BUSCADOR } = await import('../../src/view/components/search/GlobalSearch');
const { SEARCH_UI } = await import('../../src/core/constants/searchLabels');
const { SEARCH_LAUNCHER_SLOT_ID } = await import('../../src/view/components/FloatingControls');

const game = (id: number, name: string): GameItem =>
  ({ id, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review: '' }) as GameItem;
const GAMES = { c: [game(1, 'Hades')], v: [], e: [game(2, 'Pokémon Escarlata')], p: [], d: [], deleted: [], updatedAt: 0 } as unknown as TabData;

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

/** Con `slot`, el hueco de `FloatingControls` donde va la lupa; sin él, no hay dónde ponerla. */
function renderSearch(slot = true) {
  return render(
    <MemoryRouter initialEntries={['/completados']}>
      {slot ? <div className="floating-controls"><span id={SEARCH_LAUNCHER_SLOT_ID} /></div> : null}
      <GlobalSearch games={GAMES} visibleTabs={['c', 'v', 'e', 'p']} />
      <input aria-label="otra caja" />
      <Where />
    </MemoryRouter>,
  );
}

const dialog = () => document.querySelector('dialog.search-dialog') as HTMLDialogElement;
const input = () => screen.getByRole('combobox');

describe('GlobalSearch', () => {
  // El id va escrito en los dos sitios para no compartir módulo con el arranque (ver la nota del componente).
  it('busca el hueco con el mismo id que pone FloatingControls', () => {
    expect(SLOT_EN_EL_BUSCADOR).toBe(SEARCH_LAUNCHER_SLOT_ID);
  });

  it('la lupa va en los controles flotantes, junto al tema, y abre el buscador', () => {
    const { unmount } = renderSearch(false);
    expect(document.querySelector('.search-launcher')).toBeNull();
    unmount();

    renderSearch(true);
    const lupa = document.querySelector('.floating-controls .search-launcher') as HTMLElement;
    expect(lupa).toHaveAccessibleName(SEARCH_UI.launcher(false));
    fireEvent.click(lupa);
    expect(dialog().open).toBe(true);
  });

  it('Ctrl+K lo abre y lo cierra', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(dialog().open).toBe(true);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(dialog().open).toBe(false);
  });

  it('⌘K también', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(dialog().open).toBe(true);
  });

  it('«/» lo abre, salvo escribiendo en una caja', () => {
    renderSearch();
    fireEvent.keyDown(screen.getByLabelText('otra caja'), { key: '/' });
    expect(dialog().open).toBe(false);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(dialog().open).toBe(true);
  });

  it('Esc lo cierra', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    act(() => {
      dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(dialog().open).toBe(false);
  });

  it('encuentra sin acentos y lleva el juego a su lista filtrada', async () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(input(), { target: { value: 'pokemon' } });

    expect(screen.getByRole('option', { name: /Pokémon Escarlata/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(dialog().open).toBe(false);
    expect(screen.getByTestId('where')).toHaveTextContent('/en-curso?q=Pok%C3%A9mon%20Escarlata');
  });

  it('las flechas mueven la opción activa y el foco se queda en la caja', async () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(input(), { target: { value: 'e' } });
    await screen.findByRole('option', { name: /Celeste/ });

    const first = input().getAttribute('aria-activedescendant');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input().getAttribute('aria-activedescendant')).not.toBe(first);
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input().getAttribute('aria-activedescendant')).toBe(first);
  });

  it('trae las reseñas y las amistades del social guardado', async () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(input(), { target: { value: 'celeste' } });

    const review = await screen.findByRole('option', { name: /Celeste.*Reseña de Marta/ });
    fireEvent.click(review);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/social/user/pm/game/7/review'));
  });

  it('dice cuando no hay nada', () => {
    renderSearch();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(input(), { target: { value: 'zzzz' } });
    expect(screen.getByText(SEARCH_UI.empty('zzzz'))).toBeInTheDocument();
  });
});
