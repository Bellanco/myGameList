import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_POPUP_RETURN_GRACE_MS, isSupersededSignIn, watchReturnToApp } from '../../src/core/utils/googleSignIn';

/**
 * EL BOTÓN DE GOOGLE Y LA VUELTA A LA APP. Firebase tarda hasta 10 s en dar por cerrado el popup (en el móvil,
 * indefinidamente si se vuelve sin cerrar la pestaña), y el botón se quedaba en «Entrando...» todo ese tiempo.
 */
let visibilidad: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibilidad = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidad });
});

afterEach(() => {
  vi.useRealTimers();
});

const volver = () => window.dispatchEvent(new Event('focus'));
const cambiarPestaña = (estado: DocumentVisibilityState) => {
  visibilidad = estado;
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('watchReturnToApp', () => {
  it('avisa si se vuelve a la app y pasado el margen sigue sin respuesta', () => {
    const aviso = vi.fn();
    watchReturnToApp(aviso);

    volver();
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS - 1);
    expect(aviso).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  // El caso bueno: al elegir cuenta, Google cierra el popup (vuelve el foco) y el resultado llega enseguida.
  it('no avisa si el inicio de sesión termina dentro del margen', () => {
    const aviso = vi.fn();
    const dejarDeVigilar = watchReturnToApp(aviso);

    volver();
    vi.advanceTimersByTime(500);
    dejarDeVigilar();
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS * 2);
    expect(aviso).not.toHaveBeenCalled();
  });

  // En el móvil: vuelve a la app un momento y regresa a la pestaña de Google antes del margen. No se ha rendido.
  it('si se vuelve a ir antes del margen, espera a la siguiente vuelta', () => {
    const aviso = vi.fn();
    watchReturnToApp(aviso);

    cambiarPestaña('visible');
    vi.advanceTimersByTime(1000);
    cambiarPestaña('hidden');
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS * 2);
    expect(aviso).not.toHaveBeenCalled();

    cambiarPestaña('visible');
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('avisa una sola vez', () => {
    const aviso = vi.fn();
    watchReturnToApp(aviso);

    volver();
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS);
    volver();
    vi.advanceTimersByTime(GOOGLE_POPUP_RETURN_GRACE_MS);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe('isSupersededSignIn', () => {
  it('reconoce el intento que Firebase cancela al abrir otro, y nada más', () => {
    expect(isSupersededSignIn({ code: 'auth/cancelled-popup-request' })).toBe(true);
    expect(isSupersededSignIn({ code: 'auth/popup-closed-by-user' })).toBe(false);
    expect(isSupersededSignIn(new Error('otra cosa'))).toBe(false);
    expect(isSupersededSignIn(null)).toBe(false);
  });
});
