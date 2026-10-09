import { describe, expect, it } from 'vitest';
import { groupByLadder } from '../../src/core/achievements/ladderRows';
import { ACHIEVEMENTS_BY_LADDER } from '../../src/core/achievements/catalog';
import type { AchievementItem } from '../../src/core/achievements/types';

const pasos = ACHIEVEMENTS_BY_LADDER.get('completados')!;
const item = (i: number, level: number, value = 0, next: number | null = null, unlockedAt = 0): AchievementItem => ({
  def: pasos[i], state: { id: pasos[i].id, level, value, next, unlockedAt },
});

describe('groupByLadder — una fila por escalera', () => {
  it('la cara es el escalón más alto conseguido, con el camino hacia el siguiente', () => {
    const filas = groupByLadder([item(1, 1, 0, null, 2), item(0, 1, 0, null, 1), item(2, 0, 31, 50)]);
    expect(filas).toHaveLength(1);
    expect(filas[0].def.id).toBe(pasos[1].id);
    expect(filas[0].state).toMatchObject({ level: 1, value: 31, next: 50 });
  });

  it('sin escalón siguiente a la vista no hay camino', () => {
    const [fila] = groupByLadder([item(0, 1, 10, 10)]);
    expect(fila.state.next).toBeNull();
  });

  it('sin nada conseguido, el primer escalón que se ve, apagado y con su progreso', () => {
    const [fila] = groupByLadder([item(1, 0, 3, 25), item(0, 0, 3, 10)]);
    expect(fila.def.id).toBe(pasos[0].id);
    expect(fila.state).toMatchObject({ level: 0, value: 3, next: 10 });
  });

  it('cada escalera se queda en el sitio de su cara', () => {
    const otra = ACHIEVEMENTS_BY_LADDER.get('horas')![0];
    const filas = groupByLadder([
      item(0, 1), { def: otra, state: { id: otra.id, level: 1, value: 0, next: null, unlockedAt: 0 } }, item(1, 1),
    ]);
    expect(filas.map((f) => f.def.ladder)).toEqual(['horas', 'completados']);
  });
});
