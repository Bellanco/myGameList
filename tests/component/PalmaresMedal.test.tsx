import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PalmaresMedal } from '../../src/view/components/premios/PalmaresMedal';
import type { PalmaresEntry } from '../../src/model/types/premios';

const medalla = (rank: number) => {
  const entry: PalmaresEntry = { seasonId: '2025', seasonName: 'Game Awards 2025', rank, awardedAt: 1 };
  return render(<PalmaresMedal entry={entry} />).container.querySelector('.ach-medal') as HTMLElement;
};

// EL FILO DICE EL PUESTO: con un solo cobre del tercero en adelante, el tercero y el quinto eran la misma medalla.
describe('PalmaresMedal', () => {
  it.each([
    [1, 'is-temple-3'],
    [2, 'is-temple-2'],
    [3, 'is-bronce'],
    [4, 'is-cobre'],
    [5, 'is-cobre'],
    [0, 'is-participation'],
  ])('el puesto %i lleva el filo %s', (rank, clase) => {
    expect(medalla(rank)).toHaveClass(clase);
  });

  it('el bronce del tercero y el cobre del cuarto no se mezclan', () => {
    expect(medalla(3)).not.toHaveClass('is-cobre');
    expect(medalla(4)).not.toHaveClass('is-bronce');
  });

  it('la píldora lleva el puesto, y el año si es de participar', () => {
    expect(medalla(3).querySelector('.ach-step')?.textContent).toBe('3.º');
    expect(medalla(0).querySelector('.ach-step')?.textContent).toBe('’25');
  });
});
