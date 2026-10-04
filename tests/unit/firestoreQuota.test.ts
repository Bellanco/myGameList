import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isFirestoreQuotaError,
  isFirestoreQuotaExhausted,
  msUntilPacificMidnight,
  noteFirestoreError,
  resetFirestoreQuotaForTests,
} from '../../src/model/repository/firestoreQuota';

// La cuota diaria de Firestore se reinicia a medianoche del Pacífico: hasta entonces, preguntar no sirve de nada.

afterEach(() => {
  vi.useRealTimers();
  resetFirestoreQuotaForTests();
});

describe('firestoreQuota', () => {
  it('calcula lo que falta hasta la medianoche del Pacífico, con horario de verano', () => {
    // 4 de octubre de 2026, 12:00 UTC = 05:00 en Los Ángeles (PDT, UTC-7): faltan 19 h.
    expect(msUntilPacificMidnight(Date.parse('2026-10-04T12:00:00Z'))).toBe(19 * 3_600_000);
    // 15 de enero, 12:00 UTC = 04:00 (PST, UTC-8): faltan 20 h.
    expect(msUntilPacificMidnight(Date.parse('2026-01-15T12:00:00Z'))).toBe(20 * 3_600_000);
  });

  it('solo la cuota agotada abre la espera, y dura hasta el reinicio', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-04T12:00:00Z'), toFake: ['Date'] });

    expect(noteFirestoreError({ code: 'permission-denied' })).toBe(false);
    expect(noteFirestoreError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isFirestoreQuotaExhausted()).toBe(false);

    expect(noteFirestoreError({ code: 'resource-exhausted', message: 'Quota exceeded.' })).toBe(true);
    expect(isFirestoreQuotaExhausted()).toBe(true);

    vi.setSystemTime(Date.parse('2026-10-05T06:59:00Z')); // 23:59 en Los Ángeles
    expect(isFirestoreQuotaExhausted()).toBe(true);
    vi.setSystemTime(Date.parse('2026-10-05T07:00:01Z')); // pasada la medianoche
    expect(isFirestoreQuotaExhausted()).toBe(false);
  });

  it('reconoce el código con y sin prefijo', () => {
    expect(isFirestoreQuotaError({ code: 'firestore/resource-exhausted' })).toBe(true);
    expect(isFirestoreQuotaError({ code: 'unavailable' })).toBe(false);
  });
});
