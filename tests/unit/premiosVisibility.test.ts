import { describe, expect, it } from 'vitest';
import { RESULTS_FRESH_MS, shouldOfferPremios } from '../../src/core/premios/visibility';
import type { PremiosVotingConfig } from '../../src/model/types/premios';

const AHORA = Date.parse('2026-06-15T12:00:00.000Z');
const DIA = 24 * 3_600_000;

const config = (extra: Partial<PremiosVotingConfig> = {}): PremiosVotingConfig => ({ season: 2026, ...extra });

describe('shouldOfferPremios', () => {
  it('sin calendario no se ofrece nada', () => {
    expect(shouldOfferPremios(null, AHORA)).toBe(false);
    expect(shouldOfferPremios(config(), AHORA)).toBe(false);
  });

  it('con la votación abierta, sí', () => {
    expect(shouldOfferPremios(config({ isOpen: true, closesAtMillis: AHORA + DIA }), AHORA)).toBe(true);
  });

  // El interruptor del administrador manda sobre el calendario, en los dos sentidos.
  it('el administrador puede esconderla aunque haya edición abierta', () => {
    const cfg = config({ isOpen: true, closesAtMillis: AHORA + DIA, visible: false });
    expect(shouldOfferPremios(cfg, AHORA)).toBe(false);
  });

  it('y puede enseñarla aunque no haya nada', () => {
    expect(shouldOfferPremios(config({ visible: true }), AHORA)).toBe(true);
  });

  it('tras publicar, sigue a la vista mientras los resultados son recientes', () => {
    const publicado = new Date(AHORA - 3 * DIA).toISOString();
    expect(shouldOfferPremios(config({ lastPublishedId: '2025', updatedAt: publicado }), AHORA)).toBe(true);
  });

  it('pasado el mes, se retira sola', () => {
    const viejo = new Date(AHORA - RESULTS_FRESH_MS - DIA).toISOString();
    expect(shouldOfferPremios(config({ lastPublishedId: '2025', updatedAt: viejo }), AHORA)).toBe(false);
  });

  // Ante la duda, se enseña: esconder unos resultados recién publicados es peor que enseñarlos de más.
  it('con un sello ilegible se enseña', () => {
    expect(shouldOfferPremios(config({ lastPublishedId: '2025', updatedAt: 'lo que sea' }), AHORA)).toBe(true);
  });

  it('sin edición publicada y sin votación, no', () => {
    expect(shouldOfferPremios(config({ updatedAt: new Date(AHORA).toISOString() }), AHORA)).toBe(false);
  });
});
