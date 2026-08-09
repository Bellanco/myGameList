import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureAppCheck, isAppCheckConfigured, resetAppCheckForTests } from '../../src/model/repository/appCheckRepository';
import type { FirebaseApp } from 'firebase/app';

const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
  ReCaptchaV3Provider: class {
    constructor(key: string) {
      ReCaptchaV3Provider(key);
    }
  },
}));

const app = { name: 'test' } as FirebaseApp;

beforeEach(() => {
  resetAppCheckForTests();
  initializeAppCheck.mockClear();
  ReCaptchaV3Provider.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// Sin clave la app tiene que comportarse EXACTAMENTE como antes de existir App Check: es el interruptor de
// emergencia si Google retira reCAPTCHA v3 o empieza a cobrarlo (basta con vaciar la variable y reconstruir).
describe('App Check — apagado sin clave', () => {
  it('reports itself as not configured', () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '');
    expect(isAppCheckConfigured()).toBe(false);
  });

  it('does not load or initialize anything', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '');
    await ensureAppCheck(app);
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only key as absent', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '   ');
    expect(isAppCheckConfigured()).toBe(false);
    await ensureAppCheck(app);
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });
});

describe('App Check — encendido con clave', () => {
  it('initializes once with the site key and auto-refresh', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6Lc-clave-de-sitio');
    await ensureAppCheck(app);

    expect(ReCaptchaV3Provider).toHaveBeenCalledWith('6Lc-clave-de-sitio');
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck.mock.calls[0][1]).toMatchObject({ isTokenAutoRefreshEnabled: true });
  });

  it('is idempotent: several call sites must not initialize twice', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6Lc-clave-de-sitio');
    await Promise.all([ensureAppCheck(app), ensureAppCheck(app), ensureAppCheck(app)]);
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  // Falla ABIERTO: un bloqueador de scripts, un corte de red o Google caído no pueden impedir usar la app. Con la
  // exigencia activada el backend responderá 403, que es el comportamiento buscado y se diagnostica solo.
  it('never propagates a failure from the reCAPTCHA side', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6Lc-clave-de-sitio');
    initializeAppCheck.mockImplementationOnce(() => {
      throw new Error('reCAPTCHA bloqueado');
    });
    await expect(ensureAppCheck(app)).resolves.toBeUndefined();
  });
});
