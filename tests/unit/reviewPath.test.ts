import { describe, expect, it } from 'vitest';
import {
  matchesReviewFingerprint,
  parseStatsReviewPath,
  reviewFingerprint,
  statsReviewPath,
} from '../../src/core/utils/reviewPath';

/**
 * La dirección de una reseña del panel lleva una huella del nombre (12-10-2026): el id se asigna por biblioteca, y
 * el 7 de una persona es otro juego en la de otra.
 */
describe('reviewPath', () => {
  it('construye `/stats/resenas/:id-huella`, con la huella siempre de seis caracteres', () => {
    expect(statsReviewPath(7, 'Hades')).toMatch(/^\/stats\/resenas\/7-[0-9a-z]{6}$/);
    expect(reviewFingerprint('a')).toHaveLength(6);
    expect(reviewFingerprint('The Legend of Zelda: Tears of the Kingdom — Collector\'s Edition'.repeat(10))).toHaveLength(6);
  });

  it('no deja el nombre a la vista: la ruta viaja a la analítica', () => {
    expect(statsReviewPath(7, 'Hades').toLowerCase()).not.toContain('hades');
  });

  it('es estable y no distingue mayúsculas ni espacios de los extremos', () => {
    expect(reviewFingerprint('Hades')).toBe(reviewFingerprint('  hades '));
    expect(reviewFingerprint('Hades')).toBe(reviewFingerprint('HADES'));
    // Valor fijado: cambiar la regla rompería las direcciones ya compartidas.
    expect(reviewFingerprint('Hades')).toBe('z6ayj6');
    expect(reviewFingerprint('Hades')).not.toBe(reviewFingerprint('Hades II'));
    expect(reviewFingerprint('Hades')).not.toBe(reviewFingerprint('Celeste'));
  });

  it('lee la forma nueva y la vieja', () => {
    const path = statsReviewPath(7, 'Hades');
    expect(parseStatsReviewPath(path)).toEqual({ gameId: 7, fingerprint: reviewFingerprint('Hades') });
    expect(parseStatsReviewPath('/stats/resenas/7')).toEqual({ gameId: 7, fingerprint: '' });
    expect(parseStatsReviewPath('/stats/resenas')).toEqual({ gameId: 0, fingerprint: '' });
    expect(parseStatsReviewPath('/stats/resenas/abc')).toEqual({ gameId: 0, fingerprint: '' });
  });

  it('casa solo con el juego de esa huella; sin huella (forma vieja), con cualquiera', () => {
    const { fingerprint } = parseStatsReviewPath(statsReviewPath(7, 'Hades'));
    expect(matchesReviewFingerprint(fingerprint, 'Hades')).toBe(true);
    expect(matchesReviewFingerprint(fingerprint, 'Celeste')).toBe(false);
    expect(matchesReviewFingerprint('', 'Celeste')).toBe(true);
  });
});
