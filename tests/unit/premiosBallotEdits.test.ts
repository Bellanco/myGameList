import { describe, expect, it } from 'vitest';
import {
  MAX_BALLOT_EDITS,
  canEditBallot,
  getRemainingEdits,
} from '../../src/core/premios/ballotEdits';
import type { PremiosBallot, PremiosVotingConfig } from '../../src/model/types/premios';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const DAY = 24 * 3_600_000;

const openConfig: PremiosVotingConfig = {
  isOpen: true,
  opensAtMillis: NOW - DAY,
  closesAtMillis: NOW + DAY,
  resultsAtMillis: null,
};

const papeleta = (partial: Partial<PremiosBallot>): PremiosBallot => ({
  userId: 'u',
  selections: {},
  ...partial,
});

describe('getRemainingEdits', () => {
  it('descuenta las correcciones ya usadas', () => {
    expect(getRemainingEdits(papeleta({ editCount: 0 }))).toBe(MAX_BALLOT_EDITS);
    expect(getRemainingEdits(papeleta({ editCount: 2 }))).toBe(MAX_BALLOT_EDITS - 2);
    expect(getRemainingEdits(papeleta({ editCount: MAX_BALLOT_EDITS }))).toBe(0);
  });

  it('nunca devuelve un número negativo', () => {
    expect(getRemainingEdits(papeleta({ editCount: MAX_BALLOT_EDITS + 3 }))).toBe(0);
  });

  // Las papeletas emitidas antes de existir el contador no pueden quedarse sin derecho a corrección.
  it('trata una papeleta antigua sin contador como recién enviada', () => {
    expect(getRemainingEdits(papeleta({}))).toBe(MAX_BALLOT_EDITS);
  });
});

describe('canEditBallot', () => {
  it('deja corregir con cupo y votación abierta', () => {
    expect(canEditBallot(papeleta({ editCount: 1 }), openConfig, NOW)).toBe(true);
  });

  it('no deja corregir sin papeleta previa', () => {
    expect(canEditBallot(null, openConfig, NOW)).toBe(false);
  });

  it('no deja corregir con el cupo agotado', () => {
    expect(canEditBallot(papeleta({ editCount: MAX_BALLOT_EDITS }), openConfig, NOW)).toBe(false);
  });

  // Las reglas rechazan igualmente la corrección pasada la fecha: la interfaz no puede ofrecer un botón que va a
  // fallar.
  it('no deja corregir fuera de plazo aunque quede cupo', () => {
    expect(canEditBallot(papeleta({ editCount: 0 }), { ...openConfig, closesAtMillis: NOW - 1 }, NOW)).toBe(false);
  });

  it('no deja corregir con el cierre forzado', () => {
    expect(canEditBallot(papeleta({ editCount: 0 }), { ...openConfig, isOpen: false }, NOW)).toBe(false);
  });
});
