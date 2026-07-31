import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_CONSENT_EVENT,
  persistAnalyticsConsent,
  readAnalyticsConsent,
} from '../../src/model/repository/analyticsConsentRepository';
import { ANALYTICS_CONSENT_KEY } from '../../src/core/constants/storageKeys';

// L2 — La analítica es opt-in: sin decisión guardada NO puede considerarse concedida. Es la condición que
// `firebaseClient.isAnalyticsEnabledInCurrentEnv` consulta antes de llamar a `getAnalytics()`, así que un
// `null` mal interpretado aquí equivaldría a cargar GA4 sin consentimiento.

beforeEach(() => {
  localStorage.clear();
});

describe('consentimiento de analítica', () => {
  it('sin decisión guardada devuelve null (no concedido)', () => {
    expect(readAnalyticsConsent()).toBeNull();
  });

  it('persiste y relee ambas decisiones', () => {
    persistAnalyticsConsent('granted');
    expect(readAnalyticsConsent()).toBe('granted');

    persistAnalyticsConsent('denied');
    expect(readAnalyticsConsent()).toBe('denied');
  });

  it('un valor corrupto en localStorage se trata como "sin decidir", nunca como concedido', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'yes');
    expect(readAnalyticsConsent()).toBeNull();
  });

  it('avisa con un evento para que banner y ajustes se sincronicen sin recargar', () => {
    const listener = vi.fn();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, listener);

    persistAnalyticsConsent('granted');

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, listener);
  });

  it('si localStorage no está disponible, sigue sin conceder en vez de romper', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    expect(readAnalyticsConsent()).toBeNull();
    expect(() => persistAnalyticsConsent('granted')).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
