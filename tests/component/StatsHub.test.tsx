import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatsHub } from '../../src/view/components/stats/StatsHub';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import type { GameItem, TabData } from '../../src/model/types/game';

// La escala de puntuación se sirve desde un store que se hidrata de Firestore; aquí se fija a mano para no
// arrastrar el gateway a un test de pintado. El CÁLCULO tiene su propio test en tests/unit/stats.test.ts:
// esto comprueba el cableado de la pantalla (cifras, cambio de métrica y alternativa accesible).
let scale: 'stars' | 'grade' = 'stars';
vi.mock('../../src/model/repository/scorePreferenceRepository', () => ({
  getScoreScale: () => scale,
  subscribeScoreScale: () => () => {},
}));

// El histórico mensual vive en IndexedDB (no en los datos), así que aquí se sirve a mano: sin él, el panel
// enseña la curva DERIVADA de `listedAt`, y con dos puntos o más el histórico real la sustituye.
let history: Array<{ m: string; c: number; v: number; e: number; p: number }> = [];
vi.mock('../../src/model/repository/statsSnapshotRepository', () => ({
  loadBacklogHistory: () => Promise.resolve(history),
}));

const L = UI_MESSAGES.stats;

function game(overrides: Partial<GameItem> & { name: string }): GameItem {
  return { id: 1, _ts: 0, platforms: [], genres: [], steamDeck: false, review: '', ...overrides };
}

function tabData(overrides: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...overrides };
}

// `listedAt` (fecha de llegada a la lista actual) va explícito: es lo que alimenta la curva de evolución, y en
// la app real `normalizeGame` garantiza que siempre tenga valor.
const ENERO = new Date(2026, 0, 12).getTime();
const FEBRERO = new Date(2026, 1, 8).getTime();

const SAMPLE = tabData({
  c: [
    game({ id: 1, name: 'Uno', hours: 30, grade: 90, genres: ['RPG'], years: [2023], listedAt: ENERO }),
    game({ id: 2, name: 'Dos', hours: 10, grade: 60, genres: ['RPG', 'Acción'], years: [2024], listedAt: FEBRERO }),
  ],
  v: [game({ id: 3, name: 'Tres', hours: 2, genres: ['Acción'], listedAt: FEBRERO })],
  e: [game({ id: 4, name: 'Cuatro', hours: 5, listedAt: FEBRERO })],
  p: [game({ id: 5, name: 'Cinco', listedAt: ENERO })],
});

describe('StatsHub', () => {
  it('sin juegos muestra el estado vacío en vez de una pantalla de ceros', () => {
    render(<StatsHub games={tabData()} />);

    expect(screen.getByRole('heading', { name: L.empty.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: L.years.title })).not.toBeInTheDocument();
  });

  it('pinta las cifras destacadas de la biblioteca', () => {
    render(<StatsHub games={SAMPLE} />);

    // Se busca DENTRO de las cifras destacadas: "Juegos" es además la etiqueta del selector de métrica del
    // gráfico anual, así que a nivel de pantalla el texto está repetido a propósito.
    const tiles = within(document.querySelector('.stats-tiles') as HTMLElement);
    const tile = (label: string) => tiles.getByText(label).closest('.stat-tile');

    // 5 juegos en total; 47 h jugadas (próximos no cuenta); nota media 75 → 3,8 sobre 5 en escala de estrellas.
    expect(tile(L.tiles.games)).toHaveTextContent('5');
    expect(tile(L.tiles.hours)).toHaveTextContent('47');
    expect(tile(L.tiles.avgGrade)).toHaveTextContent('3,8');
    expect(tile(L.tiles.longest)).toHaveTextContent('Uno');
  });

  it('ofrece los datos anuales como tabla, no solo como barras', () => {
    render(<StatsHub games={SAMPLE} />);

    // Hay dos tablas alternativas en la pantalla (año a año y evolución): se pide la del gráfico anual.
    const rows = within(screen.getByRole('table', { name: L.years.chartAria(L.years.metricGames) })).getAllByRole('row');
    // Cabecera + 2023 + 2024.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('2023');
    expect(rows[1]).toHaveTextContent('30');
  });

  it('cambia el gráfico anual de juegos a horas', async () => {
    render(<StatsHub games={SAMPLE} />);

    const games = screen.getByRole('button', { name: L.years.metricGames });
    const hours = screen.getByRole('button', { name: L.years.metricHours });
    expect(games).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(hours);

    expect(hours).toHaveAttribute('aria-pressed', 'true');
    expect(games).toHaveAttribute('aria-pressed', 'false');
    // Con la métrica de horas, la columna de 2023 pasa de "1" (juego) a "30" (horas).
    expect(document.querySelector('.year-chart')).toHaveTextContent('30');
  });

  it('etiqueta el histograma según la escala de la cuenta', () => {
    // El tramo se rotula con estrellas (o con el rango de nota) y su nombre completo va en el texto accesible.
    const { unmount } = render(<StatsHub games={SAMPLE} />);
    expect(screen.getByText(new RegExp(`^${L.grades.starsLabel(5)}:`))).toBeInTheDocument();
    unmount();

    scale = 'grade';
    render(<StatsHub games={SAMPLE} />);
    expect(screen.getByText(new RegExp(`^${L.grades.gradeLabel(90, 100)}:`))).toBeInTheDocument();
    scale = 'stars';
  });

  it('describe el aro de completados con su reparto', () => {
    render(<StatsHub games={SAMPLE} />);

    expect(screen.getByRole('img', { name: L.ratio.donutAria(67, 2, 1) })).toBeInTheDocument();
  });
});

// ── Pestañas de año, figura de géneros y apartados de listas sin año ─────────────────────────────────────

describe('StatsHub · periodos', () => {
  it('ofrece General y solo los años en los que completaste algo', () => {
    render(<StatsHub games={SAMPLE} />);

    expect(screen.getByRole('button', { name: L.scope.general })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.scope.yearAria(2023) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.scope.yearAria(2024) })).toBeInTheDocument();
    // 2022 no tiene ningún juego completado: no hay pestaña que lleve a una pantalla vacía.
    expect(screen.queryByRole('button', { name: L.scope.yearAria(2022) })).not.toBeInTheDocument();
  });

  it('al elegir un año enseña solo lo de ese año y avisa de que abandonados y próximos no llevan año', async () => {
    render(<StatsHub games={SAMPLE} />);

    await userEvent.click(screen.getByRole('button', { name: L.scope.yearAria(2023) }));

    expect(screen.getByRole('heading', { name: L.year.gamesTitle(2023) })).toBeInTheDocument();
    expect(screen.getByText(L.year.note)).toBeInTheDocument();
    // "Uno" se completó en 2023; "Dos" es de 2024 y no debe aparecer.
    const listado = screen.getByRole('list', { name: '' }) ? document.querySelector('.game-ref-list') : null;
    expect(listado).toHaveTextContent('Uno');
    expect(listado).not.toHaveTextContent('Dos');
    // Y la lista de la vergüenza se queda en General.
    expect(screen.queryByRole('heading', { name: L.shame.title })).not.toBeInTheDocument();
  });

  it('vuelve a General', async () => {
    render(<StatsHub games={SAMPLE} />);

    await userEvent.click(screen.getByRole('button', { name: L.scope.yearAria(2024) }));
    await userEvent.click(screen.getByRole('button', { name: L.scope.general }));

    expect(screen.getByRole('heading', { name: L.shame.title })).toBeInTheDocument();
  });
});

describe('StatsHub · figura de géneros', () => {
  it('dibuja el hexágono con los géneros y sus cuentas', () => {
    render(<StatsHub games={tabData({
      c: [
        game({ id: 1, name: 'A', genres: ['RPG', 'Acción'], years: [2024] }),
        game({ id: 2, name: 'B', genres: ['RPG', 'Puzles'], years: [2024] }),
        game({ id: 3, name: 'C', genres: ['Plataformas'], years: [2024] }),
      ],
    })} />);

    expect(screen.getByRole('img', { name: /RPG: 2/ })).toBeInTheDocument();
  });

  it('con menos de tres géneros cae al reparto en barras en vez de dibujar un segmento', () => {
    render(<StatsHub games={tabData({ c: [game({ id: 1, name: 'Solo', genres: ['RPG'], years: [2024] })] })} />);

    // Se mira DENTRO de su tarjeta: el mosaico de "Géneros más jugados" también es una imagen que nombra RPG.
    const card = screen.getByRole('heading', { name: L.radar.title }).closest('.stats-card') as HTMLElement;
    expect(within(card).getByText(L.radar.tooFew)).toBeInTheDocument();
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('StatsHub · listas sin año', () => {
  it('resume los abandonados con sus razones y su índice de abandono', () => {
    render(<StatsHub games={tabData({
      c: [game({ id: 1, name: 'Acabado', genres: ['RPG'] }), game({ id: 2, name: 'Acabado 2', genres: ['RPG'] })],
      v: [
        game({ id: 3, name: 'Dejado', hours: 5, genres: ['RPG'], reasons: ['Repetitivo'], retry: true }),
        game({ id: 4, name: 'Dejado 2', genres: ['RPG'], reasons: ['Repetitivo'] }),
      ],
    })} />);

    const card = screen.getByRole('heading', { name: L.shame.title }).closest('.stats-card') as HTMLElement;
    expect(within(card).getByText('Repetitivo')).toBeInTheDocument();
    expect(within(card).getByText(L.shame.rateValue(50, 2, 4))).toBeInTheDocument();
    expect(within(card).getByText('Dejado')).toBeInTheDocument();
  });

  it('resume los próximos separando el interés de las valoraciones', () => {
    render(<StatsHub games={tabData({
      p: [game({ id: 1, name: 'Deseado', genres: ['RPG'], grade: 80, listedAt: 1000 })],
    })} />);

    const card = screen.getByRole('heading', { name: L.wishlist.title }).closest('.stats-card') as HTMLElement;
    expect(within(card).getByText(L.wishlist.interest)).toBeInTheDocument();
    expect(within(card).getByText('Deseado')).toBeInTheDocument();
    // Con tan pocos juegos, "los últimos en llegar" repetiría la misma lista al revés: no se pinta.
    expect(within(card).queryByText(L.wishlist.recent)).not.toBeInTheDocument();
  });
});

describe('StatsHub · evolución del backlog', () => {
  it('enseña la curva derivada mientras el histórico real no tenga puntos suficientes', async () => {
    render(<StatsHub games={SAMPLE} />);

    expect(await screen.findByText(L.backlog.derivedNote)).toBeInTheDocument();
  });

  it('el histórico real sustituye a la aproximación en cuanto hay dos meses registrados', async () => {
    history = [
      { m: '2026-01', c: 1, v: 0, e: 0, p: 2 },
      { m: '2026-02', c: 2, v: 1, e: 0, p: 2 },
    ];
    render(<StatsHub games={SAMPLE} />);

    expect(await screen.findByText(L.backlog.realNote)).toBeInTheDocument();
    expect(screen.queryByText(L.backlog.derivedNote)).not.toBeInTheDocument();
    history = [];
  });
});
