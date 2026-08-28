// El mapa de constancia se lee por su rejilla: cuatro filas de trece que tienen que cubrir SIEMPRE el mismo año,
// terminando en la semana en curso. Lo que se comprueba aquí es justo eso —que la ventana no la fije el último
// apunte del usuario— y que la racha viva no diga lo contrario de lo que enseñan las celdas.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekStreak } from '../../src/view/components/stats/WeekStreak';
import { localWeekKey } from '../../src/core/utils/dateTime';
import { STATS_UI } from '../../src/core/constants/statsLabels';
import type { ActivitySummary, WeekActivity } from '../../src/core/stats/types';

const L = STATS_UI.activity;

/** Clave ISO de la semana que cayó `back` semanas antes de la actual. */
function weekKeyBack(back: number): string {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - back * 7);
  return localWeekKey(day);
}

/** Serie de semanas CON apuntes, indicadas por su distancia en semanas hasta hoy. */
function activityOf(backs: number[]): ActivitySummary {
  const weeks: WeekActivity[] = backs
    .slice()
    .sort((a, b) => b - a)
    .map((back) => ({ w: weekKeyBack(back), reviews: 1, moves: 1, total: 2 }));
  return {
    weeks,
    active: weeks.length,
    bestStreak: weeks.length,
    // A propósito, la cifra que traía el resumen: se cuenta desde el último apunte y por eso la vista la rehace.
    currentStreak: weeks.length,
    busiest: weeks[0] ?? null,
  };
}

const cells = (container: HTMLElement) => [...container.querySelectorAll('.week-heat-cell')];
const emptyCells = (container: HTMLElement) => cells(container).filter((cell) => cell.classList.contains('is-l0'));
/** El pie de "Racha viva": la mejor racha puede llevar la misma cifra, así que se busca por su rótulo. */
const liveStreak = () => screen.getByText(L.current).parentElement?.querySelector('dd')?.textContent;

describe('WeekStreak · la ventana del mapa de constancia', () => {
  it('dibuja el año entero aunque el último apunte sea de hace meses', () => {
    // Doce semanas seguidas de actividad que se cortan hace tres meses.
    const { container } = render(<WeekStreak activity={activityOf([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])} />);

    expect(cells(container)).toHaveLength(52);
    // El tramo sin tocar las listas no desaparece del mapa: es el dato.
    expect(emptyCells(container).length).toBe(40);
    expect(screen.getByText(L.activeHint(12, 52))).toBeInTheDocument();
  });

  it('rellena también las semanas anteriores al primer apunte', () => {
    // Historial corto: seis semanas, el mínimo para que el gráfico se monte.
    const { container } = render(<WeekStreak activity={activityOf([0, 1, 2, 3, 4, 5])} />);

    expect(cells(container)).toHaveLength(52);
    expect(emptyCells(container).length).toBe(46);
  });

  it('la racha viva se cuenta desde hoy, no desde el último apunte', () => {
    render(<WeekStreak activity={activityOf([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])} />);

    // El resumen traía 12; con tres meses sin apuntes, la racha está rota.
    expect(liveStreak()).toBe(L.weeks(0));
  });

  it('la semana en curso, todavía vacía, no rompe la racha', () => {
    render(<WeekStreak activity={activityOf([1, 2, 3, 4, 5, 6])} />);

    expect(liveStreak()).toBe(L.weeks(6));
  });

  it('sin semanas suficientes no hay mapa que enseñar', () => {
    const { container } = render(<WeekStreak activity={activityOf([0, 1, 2])} />);

    expect(cells(container)).toHaveLength(0);
    expect(screen.getByText(L.empty)).toBeInTheDocument();
  });
});
