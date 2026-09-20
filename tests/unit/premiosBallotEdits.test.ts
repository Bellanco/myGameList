import { describe, expect, it } from 'vitest';
import {
  PREMIOS_OPPORTUNITIES_BY_TIER,
  ballotIsUnchanged,
  PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL,
  canEditBallot,
  getMaxBallotEdits,
  getOpportunities,
  getRemainingOpportunities,
  type PremiosVoterStanding,
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

/** Quien tiene canal social, con el rango que se le quiera dar. */
const social = (tier: PremiosVoterStanding['tier']): PremiosVoterStanding => ({
  hasSocialAccount: true,
  tier,
});

/** La cuenta ligera que deja el propio voto: tiene perfil, pero no canal. */
const ligera: PremiosVoterStanding = { hasSocialAccount: false, tier: 'bronze' };

describe('getOpportunities', () => {
  it('reparte el cupo por rango a quien tiene cuenta social', () => {
    expect(getOpportunities(social('bronze'))).toBe(5);
    expect(getOpportunities(social('silver'))).toBe(10);
    expect(getOpportunities(social('gold'))).toBe(15);
    expect(getOpportunities(social('mithril'))).toBe(20);
  });

  // LA LÍNEA DEL REQUISITO: sin cuenta social se vota una vez, aunque el admin le haya puesto rango a la cuenta
  // ligera. Tener perfil no es tener canal.
  it('da una sola oportunidad sin cuenta social, sea cual sea el rango', () => {
    expect(getOpportunities(ligera)).toBe(PREMIOS_OPPORTUNITIES_WITHOUT_SOCIAL);
    expect(getOpportunities({ hasSocialAccount: false, tier: 'mithril' })).toBe(1);
    expect(getOpportunities(null)).toBe(1);
  });

  it('el tope de correcciones es una oportunidad menos: la del envío', () => {
    expect(getMaxBallotEdits(ligera)).toBe(0);
    expect(getMaxBallotEdits(social('bronze'))).toBe(PREMIOS_OPPORTUNITIES_BY_TIER.bronze - 1);
    expect(getMaxBallotEdits(social('mithril'))).toBe(19);
  });
});

describe('getRemainingOpportunities', () => {
  it('sin papeleta están todas por gastar', () => {
    expect(getRemainingOpportunities(null, social('silver'))).toBe(10);
  });

  it('descuenta el envío y las correcciones ya usadas', () => {
    expect(getRemainingOpportunities(papeleta({ editCount: 0 }), social('bronze'))).toBe(4);
    expect(getRemainingOpportunities(papeleta({ editCount: 2 }), social('bronze'))).toBe(2);
    expect(getRemainingOpportunities(papeleta({ editCount: 4 }), social('bronze'))).toBe(0);
  });

  it('quien vota sin cuenta social agota su cupo al enviar', () => {
    expect(getRemainingOpportunities(papeleta({ editCount: 0 }), ligera)).toBe(0);
  });

  it('nunca devuelve un número negativo', () => {
    expect(getRemainingOpportunities(papeleta({ editCount: 40 }), social('gold'))).toBe(0);
  });

  // Las papeletas emitidas antes de existir el contador no pueden quedarse sin derecho a corrección.
  it('trata una papeleta antigua sin contador como recién enviada', () => {
    expect(getRemainingOpportunities(papeleta({}), social('bronze'))).toBe(4);
  });
});

describe('canEditBallot', () => {
  it('deja corregir con cupo y votación abierta', () => {
    expect(canEditBallot(papeleta({ editCount: 1 }), openConfig, social('bronze'), NOW)).toBe(true);
  });

  it('no deja corregir sin papeleta previa', () => {
    expect(canEditBallot(null, openConfig, social('gold'), NOW)).toBe(false);
  });

  it('no deja corregir con el cupo agotado', () => {
    expect(canEditBallot(papeleta({ editCount: 4 }), openConfig, social('bronze'), NOW)).toBe(false);
  });

  // La papeleta enviada sin cuenta social queda como está: la interfaz no puede ofrecer un botón que las reglas
  // van a rechazar, porque su tope de correcciones es cero.
  it('no deja corregir a quien votó sin cuenta social', () => {
    expect(canEditBallot(papeleta({ editCount: 0 }), openConfig, ligera, NOW)).toBe(false);
  });

  // Las reglas rechazan igualmente la corrección pasada la fecha: la interfaz no puede ofrecer un botón que va a
  // fallar.
  it('no deja corregir fuera de plazo aunque quede cupo', () => {
    expect(
      canEditBallot(papeleta({ editCount: 0 }), { ...openConfig, closesAtMillis: NOW - 1 }, social('gold'), NOW),
    ).toBe(false);
  });

  it('no deja corregir con el cierre forzado', () => {
    expect(canEditBallot(papeleta({ editCount: 0 }), { ...openConfig, isOpen: false }, social('gold'), NOW)).toBe(
      false,
    );
  });
});

// MIRAR NO CUESTA UNA OPORTUNIDAD: quien entra a repasar su papeleta, no toca nada y pulsa enviar por inercia no
// gasta una de las veces que le quedan. Las reglas no pueden distinguirlo, así que lo decide esto.
describe('ballotIsUnchanged', () => {
  const guardada = papeleta({
    selections: { goty: 'goty_option_1', arte: 'arte_option_0' },
    userDisplayName: 'Ana',
  });

  it('reconoce la papeleta idéntica, con el mismo nombre', () => {
    expect(ballotIsUnchanged(guardada, { goty: 'goty_option_1', arte: 'arte_option_0' }, 'Ana')).toBe(true);
    // El orden de las claves no es un cambio.
    expect(ballotIsUnchanged(guardada, { arte: 'arte_option_0', goty: 'goty_option_1' }, 'Ana')).toBe(true);
    // Ni los espacios de alrededor del nombre.
    expect(ballotIsUnchanged(guardada, { goty: 'goty_option_1', arte: 'arte_option_0' }, '  Ana ')).toBe(true);
  });

  it('un voto distinto, uno de más o uno de menos SÍ son cambios', () => {
    expect(ballotIsUnchanged(guardada, { goty: 'goty_option_2', arte: 'arte_option_0' }, 'Ana')).toBe(false);
    expect(ballotIsUnchanged(guardada, { goty: 'goty_option_1' }, 'Ana')).toBe(false);
    expect(
      ballotIsUnchanged(guardada, { goty: 'goty_option_1', arte: 'arte_option_0', otra: 'otra_option_0' }, 'Ana'),
    ).toBe(false);
  });

  it('cambiar el nombre de la clasificación es un cambio', () => {
    expect(ballotIsUnchanged(guardada, { goty: 'goty_option_1', arte: 'arte_option_0' }, 'Anita')).toBe(false);
  });

  it('sin papeleta previa no hay nada que comparar: es un envío', () => {
    expect(ballotIsUnchanged(null, { goty: 'goty_option_1' }, 'Ana')).toBe(false);
  });
});
