import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatsHub } from '../../src/view/components/stats/StatsHub';
import { WishKinCard } from '../../src/view/components/stats/WishKinCard';
import { Dumbbell } from '../../src/view/components/stats/Dumbbell';
import { STATS_UI } from '../../src/core/constants/statsLabels';
import { friendStatsBlocks } from '../../src/core/stats/friendStats';
import { PROFILE_TIERS } from '../../src/core/constants/tiers';
import { WISHLIST_KEY } from '../../src/core/constants/storageKeys';
import type { WishKinSummary } from '../../src/core/stats/wishKin';
import type { GameItem, TabData } from '../../src/model/types/game';

// Mismo andamiaje que `StatsHub.test`: la escala y el histórico se sirven a mano para no tocar Firestore ni
// IndexedDB en un test de pintado.
vi.mock('../../src/model/repository/scorePreferenceRepository', () => ({
  getScoreScale: () => 'stars',
  subscribeScoreScale: () => () => {},
}));
vi.mock('../../src/model/repository/statsSnapshotRepository', () => ({
  loadBacklogHistory: () => Promise.resolve([]),
}));

const L = STATS_UI.kin;

const game = (overrides: Partial<GameItem> & { id: number; name: string }): GameItem =>
  ({ _ts: 0, platforms: [], genres: [], steamDeck: false, review: '', ...overrides }) as GameItem;

const tabData = (overrides: Partial<TabData> = {}): TabData =>
  ({ c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0, ...overrides });

const BIBLIOTECA = tabData({
  c: [game({ id: 1, name: 'Hades', genres: ['RogueLike'], years: [2024], grade: 87 })],
  p: [game({ id: 2, name: 'Ori and the Will of the Wisps', genres: ['Metroidvania', 'Plataformas'] })],
  d: [
    game({ id: 3, name: 'Silksong', genres: ['Metroidvania', 'Plataformas'], grade: 100 }),
    game({ id: 4, name: 'Forza Horizon 6', genres: ['Carreras'] }),
  ],
});

const tarjeta = () => screen.getByRole('heading', { name: L.title }).closest('.stats-card') as HTMLElement;

afterEach(() => {
  localStorage.clear();
});

describe('«Ya lo tienes en casa» en tu panel', () => {
  it('cuenta los deseos con pariente y lee cada pareja como una frase', () => {
    render(<StatsHub games={BIBLIOTECA} />, { wrapper: MemoryRouter });

    const card = within(tarjeta());
    expect(card.getByText(L.subtitle)).toBeInTheDocument();
    expect(card.getByText(L.tile).closest('.stat-tile')).toHaveTextContent(`1${L.tileUnit(2)}`);

    // Lo que oye un lector de pantalla: la flecha y los chips llevan sus conectores ocultos a la vista.
    const [pareja] = card.getAllByRole('listitem').filter((item) => item.classList.contains('kin-pair'));
    expect(pareja.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Silksong: ya tienes Ori and the Will of the Wisps, por Metroidvania, Plataformas',
    );

    // Carreras se desea y no hay nada esperando: es el hueco.
    expect(card.getByRole('heading', { name: L.gaps })).toBeInTheDocument();
    expect(card.getByText('Carreras', { selector: '.tag-chip-text' })).toBeInTheDocument();
  });

  it('con la lista de deseos oculta en Ajustes, el apartado no sale', () => {
    localStorage.setItem(WISHLIST_KEY, 'off');
    render(<StatsHub games={BIBLIOTECA} />, { wrapper: MemoryRouter });

    expect(screen.queryByRole('heading', { name: L.title })).not.toBeInTheDocument();
  });

  it('sin deseos, tampoco', () => {
    render(<StatsHub games={tabData({ ...BIBLIOTECA, d: [] })} />, { wrapper: MemoryRouter });

    expect(screen.queryByRole('heading', { name: L.title })).not.toBeInTheDocument();
  });

  it('no es un bloque del perfil de nadie más, en ningún rango', () => {
    for (const tier of PROFILE_TIERS) {
      const blocks = friendStatsBlocks(tier);
      // Que cada rango tenga bloques es lo que hace que esta comprobación pruebe algo.
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks).not.toContain('kin');
    }
  });
});

describe('la tarjeta', () => {
  const sinParejas: WishKinSummary = {
    wishes: 3,
    withKin: 0,
    pairs: [],
    genres: [{ tag: 'Carreras', wished: 1, waiting: 0 }],
    gaps: [{ tag: 'Carreras', wished: 1 }],
  };

  it('sin parejas lo dice, y la comparación sigue', () => {
    render(<WishKinCard kin={sinParejas} />);

    expect(screen.getByText(L.noPairs)).toBeInTheDocument();
    expect(screen.getByText(L.legendWished)).toBeInTheDocument();
  });

  it('con más parejas de las que caben, avisa de cuántas quedan', () => {
    const pair = { wish: { id: 1, name: 'A', grade: 0 }, kin: { id: 2, name: 'B', grade: 0 }, reason: { kind: 'saga' as const } };
    render(<WishKinCard kin={{ ...sinParejas, withKin: 7, pairs: [pair] }} />);

    expect(screen.getByText(L.more(6))).toBeInTheDocument();
    expect(screen.getByText(L.saga)).toBeInTheDocument();
  });
});

describe('mancuernas con dos series cualesquiera', () => {
  it('la vergüenza se pinta como siempre: abandonados a terminados, con su porcentaje', () => {
    const { container } = render(
      <Dumbbell
        rows={[{ tag: 'RPG', first: 2, second: 5, note: '29%' }]}
        series={[{ label: 'Abandonados', list: 'v' }, { label: 'Terminados', list: 'c' }]}
      />,
    );

    expect(container.querySelector('.dumbbell')).not.toHaveClass('is-plain');
    expect(container.querySelector('.dumbbell-rate')).toHaveTextContent('29%');
    expect([...container.querySelectorAll('.stats-legend li')].map((item) => item.textContent)).toEqual(['Terminados', 'Abandonados']);
    expect((container.querySelector('.dumbbell') as HTMLElement).style.getPropertyValue('--db-first')).toBe('var(--stats-v)');
  });

  it('con los dos valores iguales, un solo punto partido y una sola cifra', () => {
    const { container } = render(
      <Dumbbell rows={[{ tag: 'RPG', first: 1, second: 1 }]} series={[{ label: 'Próximos', list: 'p' }, { label: 'Deseos', list: 'd' }]} />,
    );

    expect(container.querySelector('.dumbbell li')).toHaveClass('is-tied');
  });

  it('sin cifra al final, la fila no le reserva hueco', () => {
    const { container } = render(
      <Dumbbell rows={[{ tag: 'RPG', first: 1, second: 2 }]} series={[{ label: 'Próximos', list: 'p' }, { label: 'Deseos', list: 'd' }]} />,
    );

    expect(container.querySelector('.dumbbell')).toHaveClass('is-plain');
    expect(container.querySelector('.dumbbell-rate')).toBeNull();
  });
});
