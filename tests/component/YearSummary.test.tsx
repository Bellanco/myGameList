// La vista del resumen del año (`YearSummary`): lo que no se ve en el cálculo puro. La composición de carátulas de
// la portada solo aparece con tres cargadas y quita las que fallan; «contigo» lleva de fondo la del mejor juego en
// común; cada capítulo lleva su icono y la tarjeta social del tema, salvo la portada.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YearSummary } from '../../src/view/components/socialhub/YearSummary';
import { YEAR_SUMMARY_UI } from '../../src/core/constants/yearSummaryLabels';
import { buildYearSummary } from '../../src/core/stats/yearSummary';
import type { FinishedGame } from '../../src/core/utils/finishDates';

/* La preferencia de carátulas se replica a la nube cuando hay sesión; aquí no hay ninguna. */
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

const voice = { own: false, name: 'Ada' };

function game(id: number, name: string, grade: number): FinishedGame {
  return { id, _ts: 1, name, platforms: ['PC'], genres: ['RPG'], steamDeck: false, review: '', years: [2025], grade };
}

const completed = [game(1, 'Uno', 95), game(2, 'Dos', 90), game(3, 'Tres', 85), game(4, 'Cuatro', 80)];
const summary = buildYearSummary({ completed, year: 2025, precision: 'month', viewerCompleted: [game(9, 'Dos', 70)] })!;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('YearSummary — composición de la portada', () => {
  it('sin la preferencia de carátulas no hay composición ni fondo', () => {
    const { container } = render(<YearSummary summary={summary} voice={voice} />);
    expect(container.querySelector('.ys-collage')).toBeNull();
    expect(container.querySelector('.ys-card-cover')).toBeNull();
  });

  it('aparece cuando cargan tres, y la que falla se quita sin dejar hueco', () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const { container } = render(<YearSummary summary={summary} voice={voice} />);
    const collage = container.querySelector('.ys-collage') as HTMLElement;
    const tiles = () => [...collage.querySelectorAll('img')];
    expect(tiles()).toHaveLength(4);
    expect(collage.classList.contains('is-ready')).toBe(false);

    fireEvent.error(tiles()[3]);
    expect(tiles()).toHaveLength(3);
    tiles().forEach((img) => fireEvent.load(img));
    expect(collage.classList.contains('is-ready')).toBe(true);
  });

  it('si fallan tantas que no quedan tres, desaparece', () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const { container } = render(<YearSummary summary={summary} voice={voice} />);
    fireEvent.error(container.querySelectorAll('.ys-collage img')[0]);
    fireEvent.error(container.querySelectorAll('.ys-collage img')[0]);
    expect(container.querySelector('.ys-collage')).toBeNull();
  });

  it('«contigo» lleva de fondo la carátula del mejor juego en común', () => {
    localStorage.setItem('mis-listas-covers', 'on');
    const { container } = render(<YearSummary summary={summary} voice={voice} />);
    const cover = container.querySelector('.ys-card.is-common .ys-card-cover') as HTMLElement;
    expect(cover.style.getPropertyValue('--ys-cover')).toContain(encodeURIComponent('Dos'));
  });
});

describe('YearSummary — tarjetas', () => {
  it('cada capítulo lleva su icono, y todas menos la portada son la tarjeta social del tema', () => {
    const { container } = render(<YearSummary summary={summary} voice={voice} />);
    const cards = [...container.querySelectorAll('.ys-card')];
    expect(container.querySelectorAll('.ys-kicker-icon')).toHaveLength(cards.length);
    expect(cards[0].classList.contains('hub-feed-card')).toBe(false);
    expect(cards.slice(1).every((card) => card.classList.contains('hub-feed-card'))).toBe(true);
    expect(screen.getByRole('region', { name: YEAR_SUMMARY_UI.common.kicker })).toBeInTheDocument();
  });
});
