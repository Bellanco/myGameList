import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// El panel enlaza a la pantalla de reseñas del hub social, así que necesita un router alrededor.
import { MemoryRouter } from 'react-router-dom';
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
    render(<StatsHub games={tabData()} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('heading', { name: L.empty.title })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: L.years.title })).not.toBeInTheDocument();
  });

  it('pinta las cifras destacadas de la biblioteca', () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

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
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    // Hay dos tablas alternativas en la pantalla (año a año y evolución): se pide la del gráfico anual.
    const rows = within(screen.getByRole('table', { name: L.years.chartAria(L.years.metricGames) })).getAllByRole('row');
    // Cabecera + 2024 + 2023: la serie va del más reciente al más antiguo.
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('2024');
    expect(rows[2]).toHaveTextContent('2023');
    expect(rows[2]).toHaveTextContent('30');
  });

  it('cambia el gráfico anual de juegos a horas', async () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    const games = screen.getByRole('button', { name: L.years.metricGames });
    const hours = screen.getByRole('button', { name: L.years.metricHours });
    expect(games).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(hours);

    expect(hours).toHaveAttribute('aria-pressed', 'true');
    expect(games).toHaveAttribute('aria-pressed', 'false');
    // Con la métrica de horas, la escala del gráfico pasa de "1" (juego) a "30" (horas).
    expect(document.querySelector('.year-trend')).toHaveTextContent('30');
  });

  it('rotula el eje de la distribución según la escala de la cuenta', () => {
    const { unmount } = render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });
    const eje = () => document.querySelector('.beeswarm-axis') as HTMLElement;
    expect(eje()).toHaveTextContent('★★★★★');
    unmount();

    scale = 'grade';
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });
    expect(eje()).toHaveTextContent('75');
    expect(eje()).not.toHaveTextContent('★');
    scale = 'stars';
  });

  it('describe el cuadro de completados con su reparto', () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('img', { name: L.ratio.gaugeAria(67, 2, 1) })).toBeInTheDocument();
  });
});

// ── Pestañas de año, figura de géneros y apartados de listas sin año ─────────────────────────────────────

describe('StatsHub · periodos', () => {
  it('ofrece General y solo los años en los que completaste algo', () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    expect(screen.getByRole('button', { name: L.scope.general })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.scope.yearAria(2023) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: L.scope.yearAria(2024) })).toBeInTheDocument();
    // 2022 no tiene ningún juego completado: no hay pestaña que lleve a una pantalla vacía.
    expect(screen.queryByRole('button', { name: L.scope.yearAria(2022) })).not.toBeInTheDocument();
  });

  it('al elegir un año enseña solo lo de ese año, y las listas sin año se quedan en General', async () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('button', { name: L.scope.yearAria(2023) }));

    expect(screen.getByRole('heading', { name: L.year.gamesTitle(2023) })).toBeInTheDocument();
    // "Uno" se completó en 2023; "Dos" es de 2024 y no debe aparecer.
    const listado = document.querySelector('.game-cards');
    expect(listado).toHaveTextContent('Uno');
    expect(listado).not.toHaveTextContent('Dos');
    // Y la lista de la vergüenza se queda en General.
    expect(screen.queryByRole('heading', { name: L.shame.title })).not.toBeInTheDocument();
  });

  it('vuelve a General', async () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('button', { name: L.scope.yearAria(2024) }));
    await userEvent.click(screen.getByRole('button', { name: L.scope.general }));

    expect(screen.getByRole('heading', { name: L.shame.title })).toBeInTheDocument();
  });
});

describe('StatsHub · selector de periodo con muchos años', () => {
  /** Ocho años completados: dos más de los que caben en la barra, así que el resto va al menú. */
  const OCHO_ANYOS = tabData({
    c: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019].map((year, index) => (
      game({ id: index + 1, name: `Juego ${year}`, grade: 80, years: [year] })
    )),
  });

  it('deja a la vista los años recientes y guarda el resto tras "Más años"', async () => {
    render(<StatsHub games={OCHO_ANYOS} />, { wrapper: MemoryRouter });

    // Los seis últimos, en la barra; 2020 y 2019 solo aparecen al abrir el menú.
    expect(screen.getByRole('button', { name: L.scope.yearAria(2021) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.scope.yearAria(2019) })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: L.scope.moreAria(2) }));

    const antiguo = screen.getByRole('button', { name: L.scope.yearAria(2019) });
    await userEvent.click(antiguo);

    // Al elegirlo, el año se queda anclado en la barra aunque sea de los antiguos, y el menú se cierra.
    expect(screen.getByRole('button', { name: L.scope.yearAria(2019) })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: L.scope.moreAria(1) })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('StatsHub · figura de géneros', () => {
  it('ordena el hexágono por afinidad y no por número de juegos', () => {
    render(<StatsHub games={tabData({
      c: [
        // Dos juegos flojos de RPG frente a uno excelente de Acción: manda la nota, no la cuenta.
        game({ id: 1, name: 'A', genres: ['RPG'], grade: 20, years: [2024] }),
        game({ id: 2, name: 'B', genres: ['RPG'], grade: 20, years: [2024] }),
        game({ id: 3, name: 'C', genres: ['Acción'], grade: 100, years: [2024] }),
        game({ id: 4, name: 'D', genres: ['Puzles'], grade: 60, years: [2024] }),
      ],
    })} />, { wrapper: MemoryRouter });

    const figure = screen.getByRole('img', { name: /Figura de géneros por afinidad/ });
    const label = figure.getAttribute('aria-label') || '';
    expect(label).toContain('Acción: afinidad 1');
    // Peso exponencial: dos juegos de 1★ suman 0,125, que redondeado a una decimal es 0,1.
    expect(label).toContain('RPG: afinidad 0,1 con 2 juegos y nota media 20');
    // Acción (un juego de 100) va por delante de RPG (dos de 20).
    expect(label.indexOf('Acción')).toBeLessThan(label.indexOf('RPG'));
  });

  it('con menos de tres géneros cae al reparto en barras en vez de dibujar un segmento', () => {
    render(<StatsHub games={tabData({ c: [game({ id: 1, name: 'Solo', genres: ['RPG'], years: [2024] })] })} />, { wrapper: MemoryRouter });

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
    })} />, { wrapper: MemoryRouter });

    const card = screen.getByRole('heading', { name: L.shame.title }).closest('.stats-card') as HTMLElement;
    expect(within(card).getByText('Repetitivo')).toBeInTheDocument();
    // Mancuernas: RPG con 2 terminados y 2 dejados → 50% de abandono.
    expect(within(card).getByRole('heading', { name: L.shame.rate })).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByText('Dejado')).toBeInTheDocument();
  });

  it('resume los próximos separando el interés de las valoraciones', () => {
    render(<StatsHub games={tabData({
      p: [game({ id: 1, name: 'Deseado', genres: ['RPG'], grade: 80, listedAt: 1000 })],
    })} />, { wrapper: MemoryRouter });

    const card = screen.getByRole('heading', { name: L.wishlist.title }).closest('.stats-card') as HTMLElement;
    expect(within(card).getByText(L.wishlist.interest)).toBeInTheDocument();
    expect(within(card).getByText('Deseado')).toBeInTheDocument();
    // Con tan pocos juegos, "los últimos en llegar" repetiría la misma lista al revés: no se pinta.
    expect(within(card).queryByText(L.wishlist.recent)).not.toBeInTheDocument();
  });
});

describe('StatsHub · evolución del backlog', () => {
  // El modo ya no se anuncia con un texto al pie (se retiró la nota de la aproximación), así que se comprueba
  // por `data-mode`, que es el marcador que existe justamente para poder distinguirlos.
  it('enseña la curva derivada mientras el histórico real no tenga puntos suficientes', async () => {
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    await waitFor(() => expect(document.querySelector('.backlog')).toHaveAttribute('data-mode', 'derived'));
    expect(screen.queryByText(L.backlog.realNote)).not.toBeInTheDocument();
  });

  it('el histórico real sustituye a la aproximación en cuanto hay dos meses registrados', async () => {
    history = [
      { m: '2026-01', c: 1, v: 0, e: 0, p: 2 },
      { m: '2026-02', c: 2, v: 1, e: 0, p: 2 },
    ];
    render(<StatsHub games={SAMPLE} />, { wrapper: MemoryRouter });

    expect(await screen.findByText(L.backlog.realNote)).toBeInTheDocument();
    expect(document.querySelector('.backlog')).toHaveAttribute('data-mode', 'real');
    history = [];
  });
});

// ── Las dos figuras del podio se pueden tocar ───────────────────────────────────────────────────────────────

describe('StatsHub · figuras interactivas del podio', () => {
  /** Un top con géneros y plataformas repartidos, que es lo que alimenta el rosetón y el anillo. */
  const TOP = tabData({
    c: [
      game({ id: 1, name: 'Uno', grade: 90, genres: ['RPG'], platforms: ['PC'], years: [2024] }),
      game({ id: 2, name: 'Dos', grade: 80, genres: ['RPG'], platforms: ['PC'], years: [2024] }),
      game({ id: 3, name: 'Tres', grade: 70, genres: ['Acción'], platforms: ['Switch'], years: [2024] }),
      game({ id: 4, name: 'Cuatro', grade: 60, genres: ['Puzles'], platforms: ['PS5'], years: [2024] }),
    ],
  });

  it('el anillo de plataformas cuenta la parte señalada en su centro, y vuelve al total al soltarla', async () => {
    render(<StatsHub games={TOP} />, { wrapper: MemoryRouter });

    const center = document.querySelector('.donut-share-center') as HTMLElement;
    // Sin nada señalado, el centro lleva el tamaño del top y su rótulo.
    expect(center).toHaveTextContent('4');
    expect(center).toHaveTextContent(L.top.donutCenter);

    const pc = screen.getByRole('button', { name: /^PC/ });
    await userEvent.click(pc);

    // Señalada "PC": el centro pasa a contar SUS juegos y a rotularse con su nombre.
    expect(pc).toHaveAttribute('aria-pressed', 'true');
    expect(center).toHaveTextContent('2');
    expect(center).toHaveTextContent('PC');
    // Y el resto de segmentos se apartan en vez de competir por la mirada.
    expect(document.querySelectorAll('.donut-seg.is-dim').length).toBeGreaterThan(0);

    await userEvent.click(pc);
    expect(pc).toHaveAttribute('aria-pressed', 'false');
    expect(center).toHaveTextContent(L.top.donutCenter);
  });

  it('el rosetón de géneros dice la parte exacta de la porción señalada, y se alcanza con el teclado', async () => {
    render(<StatsHub games={TOP} />, { wrapper: MemoryRouter });

    const detail = document.querySelector('.burst-detail') as HTMLElement;
    // El pie está siempre (si apareciera al señalar, la tarjeta daría un salto): sin nada, el total.
    expect(detail).toHaveTextContent(L.genres.games(4));

    // Las porciones son botones: se activan con Intro, no solo con el ratón.
    const rpg = screen.getByRole('button', { name: /^RPG/ });
    rpg.focus();
    await userEvent.keyboard('{Enter}');

    expect(rpg).toHaveAttribute('aria-pressed', 'true');
    // Dos de los cuatro juegos del top son RPG: su parte es el 50%.
    expect(detail).toHaveTextContent('RPG');
    expect(detail).toHaveTextContent(L.genres.games(2));
    expect(detail).toHaveTextContent('50%');
    expect(document.querySelectorAll('.burst-piece.is-dim').length).toBeGreaterThan(0);
  });
});
