import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APP_CHECK_TOKEN_TIMEOUT_MS, ensureAppCheck, getAppCheckToken, isAppCheckConfigured, resetAppCheckForTests } from '../../src/model/repository/appCheckRepository';
import type { FirebaseApp } from 'firebase/app';

const initializeAppCheck = vi.fn();
const ReCaptchaV3Provider = vi.fn();
const getToken = vi.fn();

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...args),
  getToken: (...args: unknown[]) => getToken(...args),
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

// docs/plan-degradacion-servicios.md, fase 5: si un bloqueador o la red impiden cargar reCAPTCHA, el SDK espera sin
// plazo y «Compartir» se quedaba colgado. Ahora, pasado el tope, se sigue sin token (falla abierto).
describe('App Check — token con tope de espera', () => {
  it('si reCAPTCHA no contesta, sigue sin token pasado el tope', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6Lc-clave-de-sitio');
      initializeAppCheck.mockReturnValue({ instancia: true });
      getToken.mockReturnValue(new Promise(() => {})); // nunca responde
      await ensureAppCheck(app);

      const token = getAppCheckToken();
      await vi.advanceTimersByTimeAsync(APP_CHECK_TOKEN_TIMEOUT_MS + 1);

      await expect(token).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('con respuesta a tiempo, devuelve el token', async () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6Lc-clave-de-sitio');
    initializeAppCheck.mockReturnValue({ instancia: true });
    getToken.mockResolvedValue({ token: 'tok' });
    await ensureAppCheck(app);

    await expect(getAppCheckToken()).resolves.toBe('tok');
  });
});

