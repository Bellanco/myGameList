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

const L = UI_MESSAGES.stats;

function game(overrides: Partial<GameItem> & { name: string }): GameItem {
  return { id: 1, _ts: 0, platforms: [], genres: [], steamDeck: false, review: '', ...overrides };
}

function tabData(overrides: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...overrides };
}

const SAMPLE = tabData({
  c: [
    game({ id: 1, name: 'Uno', hours: 30, grade: 90, genres: ['RPG'], years: [2023] }),
    game({ id: 2, name: 'Dos', hours: 10, grade: 60, genres: ['RPG', 'Acción'], years: [2024] }),
  ],
  v: [game({ id: 3, name: 'Tres', hours: 2, genres: ['Acción'] })],
  e: [game({ id: 4, name: 'Cuatro', hours: 5 })],
  p: [game({ id: 5, name: 'Cinco' })],
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

    const rows = within(screen.getByRole('table')).getAllByRole('row');
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
    const { unmount } = render(<StatsHub games={SAMPLE} />);
    expect(screen.getByText(L.grades.starsLabel(5))).toBeInTheDocument();
    unmount();

    scale = 'grade';
    render(<StatsHub games={SAMPLE} />);
    expect(screen.getByText(L.grades.gradeLabel(90, 100))).toBeInTheDocument();
    scale = 'stars';
  });

  it('describe el aro de completados con su reparto', () => {
    render(<StatsHub games={SAMPLE} />);

    expect(screen.getByRole('img', { name: L.ratio.donutAria(67, 2, 1) })).toBeInTheDocument();
  });
});
