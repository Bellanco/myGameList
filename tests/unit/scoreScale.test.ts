import { describe, expect, it } from 'vitest';
import {
  GRADE_MAX,
  GRADE_PER_STAR,
  STARS_MAX,
  clampGrade,
  gradeFromStars,
  resolveGrade,
  resolveStars,
  starsFromGrade,
} from '../../src/core/utils/scoreScale';
import { toPublicGame } from '../../src/model/repository/socialProjection';
import type { GameItem } from '../../src/model/types/game';

describe('scoreScale — conversión estrellas ↔ nota 0–100', () => {
  it('clampGrade acota a [0,100] y 0 para no finitos', () => {
    expect(clampGrade(73)).toBe(73);
    expect(clampGrade(200)).toBe(GRADE_MAX);
    expect(clampGrade(-5)).toBe(0);
    expect(clampGrade('x')).toBe(0);
    expect(clampGrade(null)).toBe(0);
  });

  it('gradeFromStars: cada estrella son 20 puntos (mapeo pedido)', () => {
    expect(gradeFromStars(0)).toBe(0);
    expect(gradeFromStars(1)).toBe(GRADE_PER_STAR); // 20
    expect(gradeFromStars(3)).toBe(60);
    expect(gradeFromStars(STARS_MAX)).toBe(GRADE_MAX); // 100
    expect(gradeFromStars(9)).toBe(GRADE_MAX); // acota a 5 estrellas
  });

  it('starsFromGrade: redondea al medio-punto de estrella', () => {
    expect(starsFromGrade(0)).toBe(0);
    expect(starsFromGrade(60)).toBe(3);
    expect(starsFromGrade(100)).toBe(5);
    expect(starsFromGrade(73)).toBe(4); // round(73/20)
    expect(starsFromGrade(50)).toBe(3); // round(2.5) = 3
  });

  it('round-trip estrella→nota→estrella es estable (input actual = estrellas)', () => {
    for (let s = 0; s <= STARS_MAX; s++) {
      expect(starsFromGrade(gradeFromStars(s))).toBe(s);
    }
  });
});

describe('scoreScale — fallback grade ↔ score espejo', () => {
  it('resolveGrade usa grade si está presente', () => {
    expect(resolveGrade({ grade: 73, score: 5 })).toBe(73);
  });

  it('resolveGrade cae al score 0–5 (×20) cuando grade es null/ausente', () => {
    expect(resolveGrade({ grade: null, score: 3 })).toBe(60);
    expect(resolveGrade({ score: 4 })).toBe(80);
    expect(resolveGrade({})).toBe(0);
  });

  it('resolveStars devuelve la escala visual (0–5) desde el valor efectivo', () => {
    expect(resolveStars({ grade: 100 })).toBe(5);
    expect(resolveStars({ score: 2 })).toBe(2); // fallback: 40 → 2 estrellas
  });
});

function ownGame(extra: Partial<GameItem>): GameItem {
  return {
    id: 1,
    _ts: 1000,
    name: 'Juego',
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: 'reseña',
    ...extra,
  };
}

describe('proyección pública — el rating social sigue en 0–5', () => {
  it('deriva rating 0–5 desde grade sin exponer la nota fina', () => {
    const pub = toPublicGame(ownGame({ grade: 100, score: 5 }), 'c');
    expect(pub.rating).toBe(5);
    expect((pub as unknown as Record<string, unknown>).grade).toBeUndefined();
    expect((pub as unknown as Record<string, unknown>).score).toBeUndefined();
  });

  it('sin grade, usa el espejo score 0–5', () => {
    expect(toPublicGame(ownGame({ score: 3 }), 'c').rating).toBe(3);
  });

  it('un grade granular (73) se publica redondeado a estrellas (4), nunca 73', () => {
    expect(toPublicGame(ownGame({ grade: 73 }), 'c').rating).toBe(4);
  });
});
