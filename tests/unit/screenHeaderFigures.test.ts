import { describe, expect, it } from 'vitest';
import { listHeaderFigures } from '../../src/viewmodel/screenHeaderFigures';
import type { GameItem } from '../../src/model/types/game';

/** Solo lo que lee la cuenta: nota, estrellas heredadas y horas. */
const juego = (campos: Partial<GameItem>) => ({ name: 'x', ...campos }) as GameItem;

describe('listHeaderFigures', () => {
  const lista = [
    juego({ grade: 80, hours: 10 }),
    juego({ grade: 60, hours: 2.5 }),
    // Sin `grade`, con estrellas de antes: cuenta como 4 × 20 = 80, igual que en el panel.
    juego({ score: 4, hours: null as unknown as number }),
    // Sin nota ninguna: no entra en la media, pero sí en el recuento.
    juego({ hours: 3 }),
  ];

  it('cuenta los juegos y suma las horas que se pueden leer', () => {
    const { count, hours } = listHeaderFigures('c', lista, 'grade');
    expect(count).toBe(4);
    expect(hours).toBe(15.5);
  });

  it('da la media solo de los puntuados, en la escala elegida', () => {
    expect(listHeaderFigures('c', lista, 'grade').avg).toBeCloseTo(220 / 3);
    expect(listHeaderFigures('c', lista, 'stars').avg).toBeCloseTo(220 / 3 / 20);
  });

  it('sin horas en Próximos y sin nota fuera de Completados', () => {
    expect(listHeaderFigures('p', lista, 'grade')).toMatchObject({ hours: null, avg: null });
    expect(listHeaderFigures('v', lista, 'grade')).toMatchObject({ hours: 15.5, avg: null });
    expect(listHeaderFigures('e', lista, 'grade').avg).toBeNull();
  });

  it('sin ningún juego puntuado no inventa una media de cero', () => {
    expect(listHeaderFigures('c', [juego({ hours: 1 })], 'grade').avg).toBeNull();
    expect(listHeaderFigures('c', [], 'grade')).toEqual({ count: 0, hours: 0, avg: null });
  });
});
