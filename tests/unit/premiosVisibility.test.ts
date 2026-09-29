import { describe, expect, it } from 'vitest';
import { shouldOfferPremios } from '../../src/core/premios/visibility';
import type { PremiosVotingConfig } from '../../src/model/types/premios';

const AHORA = Date.parse('2026-06-15T12:00:00.000Z');
const DIA = 24 * 3_600_000;

const config = (extra: Partial<PremiosVotingConfig> = {}): PremiosVotingConfig => ({ season: 2026, ...extra });

describe('shouldOfferPremios', () => {
  it('sin calendario no se ofrece nada', () => {
    expect(shouldOfferPremios(null)).toBe(false);
    expect(shouldOfferPremios(config())).toBe(false);
  });

  // LO DECIDE SOLO EL ADMINISTRADOR: el calendario ya no enseña la sección por su cuenta.
  it('con la votación abierta pero sin encender, no', () => {
    expect(shouldOfferPremios(config({ isOpen: true, closesAtMillis: AHORA + DIA }))).toBe(false);
  });

  it('con resultados recién publicados pero sin encender, tampoco', () => {
    const publicado = new Date(AHORA - 3 * DIA).toISOString();
    expect(shouldOfferPremios(config({ lastPublishedId: '2025', updatedAt: publicado }))).toBe(false);
  });

  it('el administrador puede esconderla aunque haya edición abierta', () => {
    const cfg = config({ isOpen: true, closesAtMillis: AHORA + DIA, visible: false });
    expect(shouldOfferPremios(cfg)).toBe(false);
  });

  it('y enseñarla aunque no haya nada', () => {
    expect(shouldOfferPremios(config({ visible: true }))).toBe(true);
  });
});
