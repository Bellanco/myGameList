// La caducidad de las cuentas sin uso (docs/plan-cuentas-inactivas.md). Lo que fijan estos tests son las
// decisiones del usuario del 15-10-2026: dos meses sin perfil, un año con él, contados desde el último uso, y quién
// no caduca nunca. El servidor vuelve a decidir con esta misma función antes de borrar.
import { describe, expect, it } from 'vitest';
import {
  EXPIRING_NOTICE_MS,
  NO_PROFILE_RETENTION_MS,
  PROFILE_RETENTION_MS,
  judgeRetention,
  lastUseOf,
  type RetentionFacts,
} from '../../src/core/admin/accountRetention';

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 9, 15);

function facts(patch: Partial<RetentionFacts> = {}): RetentionFacts {
  return {
    createdAt: AHORA - 400 * DIA,
    authLastUsedAt: 0,
    hasProfile: false,
    profileUpdatedAt: 0,
    hasBallot: false,
    premiosParticipant: false,
    admin: false,
    ...patch,
  };
}

describe('judgeRetention', () => {
  it('los plazos son los decididos: dos meses sin perfil, un año con él, y se avisa 30 días antes', () => {
    expect(NO_PROFILE_RETENTION_MS).toBe(60 * DIA);
    expect(PROFILE_RETENTION_MS).toBe(365 * DIA);
    expect(EXPIRING_NOTICE_MS).toBe(30 * DIA);
  });

  it('sin perfil caduca a los dos meses del último uso', () => {
    expect(judgeRetention(facts({ authLastUsedAt: AHORA - 59 * DIA }), AHORA).state).toBe('expiring');
    expect(judgeRetention(facts({ authLastUsedAt: AHORA - 60 * DIA }), AHORA).state).toBe('expired');
    expect(judgeRetention(facts({ authLastUsedAt: AHORA - 20 * DIA }), AHORA).state).toBe('active');
  });

  it('cuenta desde el último uso, no desde el alta: quien la usa a diario no caduca nunca', () => {
    const verdict = judgeRetention(facts({ createdAt: AHORA - 900 * DIA, authLastUsedAt: AHORA - DIA }), AHORA);
    expect(verdict.state).toBe('active');
    expect(verdict.expiresAt).toBe(AHORA - DIA + NO_PROFILE_RETENTION_MS);
  });

  it('con perfil (aunque esté suspendido) el plazo es un año', () => {
    const base = { hasProfile: true, authLastUsedAt: AHORA - 200 * DIA };
    expect(judgeRetention(facts(base), AHORA)).toMatchObject({ rule: 'profile', state: 'active' });
    expect(judgeRetention(facts({ ...base, authLastUsedAt: AHORA - 366 * DIA }), AHORA).state).toBe('expired');
  });

  it('la actividad del perfil cuenta como uso aunque Auth tenga una fecha más vieja', () => {
    const verdict = judgeRetention(facts({ hasProfile: true, authLastUsedAt: AHORA - 500 * DIA, profileUpdatedAt: AHORA - 10 * DIA }), AHORA);
    expect(verdict.lastUsedAt).toBe(AHORA - 10 * DIA);
    expect(verdict.state).toBe('active');
  });

  it('quien votó en los premios tiene el plazo de un año aunque no tenga perfil', () => {
    const verdict = judgeRetention(facts({ premiosParticipant: true, authLastUsedAt: AHORA - 100 * DIA }), AHORA);
    expect(verdict).toMatchObject({ rule: 'profile', state: 'active' });
  });

  it('el administrador y quien tiene una papeleta en curso no caducan', () => {
    const viejo = { authLastUsedAt: AHORA - 1000 * DIA };
    expect(judgeRetention(facts({ ...viejo, admin: true }), AHORA)).toMatchObject({ state: 'protected', protection: 'admin', expiresAt: 0 });
    expect(judgeRetention(facts({ ...viejo, hasBallot: true }), AHORA)).toMatchObject({ state: 'protected', protection: 'ballot' });
  });

  it('sin ninguna fecha no se da por caducada: sin dato no se borra nada', () => {
    expect(judgeRetention(facts({ createdAt: 0 }), AHORA)).toMatchObject({ state: 'active', expiresAt: 0 });
  });

  it('sin uso registrado cuenta desde el alta', () => {
    expect(lastUseOf({ createdAt: AHORA - 70 * DIA, authLastUsedAt: 0, profileUpdatedAt: 0 })).toBe(AHORA - 70 * DIA);
    expect(judgeRetention(facts({ createdAt: AHORA - 70 * DIA }), AHORA).state).toBe('expired');
  });
});
