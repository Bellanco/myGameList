import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FriendStats } from '../../src/view/components/stats/FriendStats';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import type { SocialSharedGame } from '../../src/model/repository/socialGistRepository';
import type { TabId } from '../../src/model/types/game';

// Misma razón que en StatsHub: la escala vive en un store hidratado desde Firestore y aquí solo se pinta.
vi.mock('../../src/model/repository/scorePreferenceRepository', () => ({
  getScoreScale: () => 'stars',
  subscribeScoreScale: () => () => {},
}));

const L = UI_MESSAGES.stats;

function shared(overrides: Partial<SocialSharedGame> & { id: number; name: string }): SocialSharedGame {
  return { platforms: ['PC'], genres: ['RPG'], rating: 4, grade: 80, snippet: '', ...overrides };
}

const LISTS: Partial<Record<TabId, SocialSharedGame[]>> = {
  c: [
    shared({ id: 1, name: 'Uno', grade: 90, years: [2024] }),
    shared({ id: 2, name: 'Dos', grade: 60, genres: ['Acción'], years: [2023] }),
  ],
  v: [shared({ id: 3, name: 'Tres', grade: 30, genres: ['Terror'] })],
};

const heading = (name: string) => screen.queryByRole('heading', { name });

describe('FriendStats · lo que ve cada rango', () => {
  it('bronce ve el retrato y nada más', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="bronze" viewerHiddenTabs={[]} />);

    expect(heading(L.top.title)).toBeInTheDocument();
    expect(heading(L.years.title)).toBeInTheDocument();
    expect(heading(L.radar.title)).toBeInTheDocument();
    expect(heading(L.genres.title)).toBeInTheDocument();
    // Lo que su rango no alcanza, con el aviso de por qué.
    expect(heading(L.grades.title)).not.toBeInTheDocument();
    expect(heading(L.ratio.title)).not.toBeInTheDocument();
    expect(screen.getByText(L.friend.tierMore)).toBeInTheDocument();
  });

  it('oro añade las notas y el ratio, y ya no se le avisa de que le falta rango', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);

    expect(heading(L.grades.title)).toBeInTheDocument();
    expect(heading(L.ratio.title)).toBeInTheDocument();
    expect(screen.queryByText(L.friend.tierMore)).not.toBeInTheDocument();
  });

  it('solo mithril puede cambiar de periodo', () => {
    const { unmount } = render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);
    expect(screen.queryByRole('button', { name: L.scope.general })).not.toBeInTheDocument();
    unmount();

    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);
    expect(screen.getByRole('button', { name: L.scope.general })).toBeInTheDocument();
    // Los años salen de lo publicado: el canal social sí trae `years`.
    expect(screen.getByRole('button', { name: L.scope.yearAria(2024) })).toBeInTheDocument();
  });

  it('no enseña horas por ninguna parte: no viajan por el canal social', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.queryByText(L.tiles.hours)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.years.metricHours })).not.toBeInTheDocument();
  });
});

describe('FriendStats · reciprocidad', () => {
  it('quien esconde una lista deja de verla, y se le dice', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={['v']} />);

    expect(screen.getByText(L.friend.blocked(L.backlog.lists.v.toLowerCase()))).toBeInTheDocument();
    // Sin los abandonados, las cifras cuentan solo los dos completados. Se busca dentro de las cifras
    // destacadas: "Juegos" también rotula cosas del gráfico anual.
    const tiles = within(document.querySelector('.stats-tiles') as HTMLElement);
    expect(tiles.getByText(L.tiles.games).closest('.stat-tile')).toHaveTextContent('2');
  });

  it('quien lo esconde todo se queda sin panel', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="silver" viewerHiddenTabs={['c', 'v', 'e', 'p']} />);

    expect(screen.getByText(L.friend.blockedAll)).toBeInTheDocument();
    expect(heading(L.top.title)).not.toBeInTheDocument();
  });

  it('la cuenta de administración ve el panel aunque lo esconda todo', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={['c', 'v', 'e', 'p']} />);

    expect(screen.queryByText(L.friend.blockedAll)).not.toBeInTheDocument();
    expect(heading(L.top.title)).toBeInTheDocument();
  });

  it('sin listas compartidas no hay nada que resumir', () => {
    render(<FriendStats sharedLists={{}} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.getByText(L.friend.empty)).toBeInTheDocument();
  });
});
