import { describe, it, expect } from 'vitest';
import { calendarDaysAgo, lastCompletedGame, rowActivity } from '../../src/core/social/directoryRow';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import type { TabId } from '../../src/model/types/game';

const move = (gameId: number, gameName: string, tab: TabId, at: number) => ({ gameId, gameName, tab, at });
const review = (gameName: string, createdAt: number, type = 'review') => ({ type, gameName, createdAt, updatedAt: createdAt });

describe('rowActivity — qué se cuenta de un amigo', () => {
  it('sin mensajes ni reseñas no hay nada que contar', () => {
    expect(rowActivity([])).toBeNull();
    expect(rowActivity([], [])).toBeNull();
  });

  it('1. lo más reciente entre «En curso» y «Completados»', () => {
    expect(rowActivity([move(1, 'Celeste', 'c', 100), move(2, 'Hades', 'e', 200)])).toEqual({ kind: 'e', gameName: 'Hades' });
    expect(rowActivity([move(1, 'Celeste', 'c', 300), move(2, 'Hades', 'e', 200)])).toEqual({ kind: 'c', gameName: 'Celeste' });
  });

  // Jugar o terminar dice más que apuntarse algo, aunque lo apuntado sea más nuevo.
  it('jugar o terminar va antes que lo añadido después', () => {
    expect(rowActivity([move(1, 'Hades', 'e', 100), move(2, 'Tunic', 'p', 900)])).toEqual({ kind: 'e', gameName: 'Hades' });
  });

  // Lo empezó y luego lo abandonó: el «empezó» sigue en el canal, pero ya no lo está jugando.
  it('cuenta el último mensaje de cada juego, no el último «empezó» suelto', () => {
    expect(rowActivity([move(1, 'Hades', 'e', 100), move(1, 'Hades', 'v', 200)])).toEqual({ kind: 'v', gameName: 'Hades' });
    expect(rowActivity([move(1, 'Hades', 'e', 100), move(1, 'Hades', 'v', 200), move(2, 'Tunic', 'c', 50)]))
      .toEqual({ kind: 'c', gameName: 'Tunic' });
  });

  it('2. si no jugó ni terminó nada, lo último que movió: añadido a Próximos o a Deseados, o abandonado', () => {
    expect(rowActivity([move(1, 'Hades', 'p', 100), move(2, 'Tunic', 'd', 200)])).toEqual({ kind: 'd', gameName: 'Tunic' });
    expect(rowActivity([move(1, 'Hades', 'p', 300), move(2, 'Tunic', 'd', 200)])).toEqual({ kind: 'p', gameName: 'Hades' });
  });

  it('3. si en 30 días no movió nada, su última reseña; las recomendaciones no cuentan', () => {
    expect(rowActivity([], [review('Celeste', 100), review('Hades', 300), review('Tunic', 900, 'recommendation')]))
      .toEqual({ kind: 'review', gameName: 'Hades' });
  });

  it('una reseña no se adelanta a un mensaje de lista, aunque sea más nueva', () => {
    expect(rowActivity([move(1, 'Hades', 'p', 100)], [review('Celeste', 900)])).toEqual({ kind: 'p', gameName: 'Hades' });
  });

  it('el orden de llegada no importa', () => {
    expect(rowActivity([move(1, 'Hades', 'v', 200), move(1, 'Hades', 'e', 100)])).toEqual({ kind: 'v', gameName: 'Hades' });
  });

  it('4. si no hay nada en su canal, su último completado (solo llega para la administración)', () => {
    expect(rowActivity([], [], 'Celeste')).toEqual({ kind: 'c', gameName: 'Celeste' });
    expect(rowActivity([], [review('Hades', 100)], 'Celeste')).toEqual({ kind: 'review', gameName: 'Hades' });
    expect(rowActivity([], [], '  ')).toBeNull();
  });
});

describe('lastCompletedGame — el último que terminó', () => {
  it('manda la fecha de fin, con el día (administración) o con el mes', () => {
    expect(lastCompletedGame([
      { name: 'Celeste', finishedOn: '2026-03-02' },
      { name: 'Hades', finishedOn: '2026-09-15' },
      { name: 'Tunic', finishedOn: '2026-09-01' },
    ])).toBe('Hades');
    expect(lastCompletedGame([{ name: 'Celeste', finishedOn: '2025-12' }, { name: 'Hades', finishedOn: '2026-01' }])).toBe('Hades');
  });

  it('sin fecha en ninguno, el del año más reciente; en un empate, el primero de la lista', () => {
    expect(lastCompletedGame([
      { name: 'Celeste', years: [2019] },
      { name: 'Hades', years: [2021, 2024] },
      { name: 'Tunic', years: [2024] },
    ])).toBe('Hades');
  });

  it('una lista vacía, o sin fechas ni años, no da nada', () => {
    expect(lastCompletedGame([])).toBeNull();
    expect(lastCompletedGame([{ name: 'Celeste' }])).toBeNull();
  });
});

describe('calendarDaysAgo — hace cuántos días de calendario', () => {
  const now = new Date(2026, 9, 14, 10, 0).getTime();

  it('sin dato no dice nada', () => {
    expect(calendarDaysAgo(0, now)).toBeNull();
    expect(calendarDaysAgo(Number.NaN, now)).toBeNull();
  });

  it('cuenta días de calendario, no bloques de 24 horas', () => {
    expect(calendarDaysAgo(new Date(2026, 9, 14, 0, 5).getTime(), now)).toBe(0);
    // Anoche a las once, dos horas antes de medianoche: «ayer», aunque no hayan pasado 24 horas.
    expect(calendarDaysAgo(new Date(2026, 9, 13, 23, 0).getTime(), now)).toBe(1);
    expect(calendarDaysAgo(new Date(2026, 9, 10, 12, 0).getTime(), now)).toBe(4);
  });

  it('una marca en el futuro (reloj adelantado) es «hoy», no un número negativo', () => {
    expect(calendarDaysAgo(now + 3 * 86_400_000, now)).toBe(0);
  });
});

describe('SOCIAL_UI.profiles.lastSeen — sin hora, solo la idea', () => {
  const { lastSeen } = SOCIAL_UI.profiles;

  it.each([
    [0, 'Última conexión: hoy'],
    [1, 'Última conexión: ayer'],
    [2, 'Última conexión: hace 2 días'],
    [29, 'Última conexión: hace 29 días'],
    [30, 'Última conexión: hace un mes'],
    [64, 'Última conexión: hace 2 meses'],
    [364, 'Última conexión: hace 12 meses'],
    [365, 'Última conexión: hace un año'],
    [800, 'Última conexión: hace 2 años'],
  ])('%i días → «%s»', (days, text) => {
    expect(lastSeen(days)).toBe(text);
  });
});
