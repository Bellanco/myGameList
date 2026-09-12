import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateNotice } from '../../src/view/components/UpdateNotice';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import { APP_UPDATE_EVENT } from '../../src/core/utils/appUpdate';
import { markDirty, clearDirty } from '../../src/model/repository/syncStateRepository';
import { acquireSyncLock, type SyncLock } from '../../src/model/repository/syncMachineRepository';

// La regla que se prueba: recargar sola solo cuando NO cuesta nada (pestaña oculta, nada a medias) y preguntar
// en cualquier otro caso. Recargar bajo los pies de quien está mirando la app pierde scroll, filtros y lo que
// tenga escrito a medias, así que el caso "visible" no admite excepciones.

const reloadNow = vi.fn();
vi.mock('../../src/core/utils/appUpdate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/utils/appUpdate')>()),
  reloadNow: () => reloadNow(),
}));

const U = UI_MESSAGES.update;

/** jsdom no cambia `visibilityState` por su cuenta: se fija a mano y se avisa como haría el navegador. */
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function announceNewVersion(): void {
  act(() => {
    window.dispatchEvent(new CustomEvent(APP_UPDATE_EVENT));
  });
}

beforeEach(() => {
  reloadNow.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  clearDirty();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

afterEach(() => {
  document.querySelectorAll('dialog, textarea').forEach((element) => element.remove());
  // El mutex de sync es estado de MÓDULO: un test que lo deje tomado apagaría la recarga en todos los siguientes.
  candado?.release();
  candado = null;
});

/** Candado de sync tomado por el test de turno, para poder soltarlo pase lo que pase. */
let candado: SyncLock | null = null;

describe('aviso de versión nueva', () => {
  it('no enseña nada mientras no haya versión nueva', () => {
    render(<UpdateNotice />);
    expect(screen.queryByText(U.title)).toBeNull();
    // La región viva SÍ está montada aunque esté vacía: es lo que le permite anunciar el aviso cuando llegue.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('con la app en primer plano pregunta en vez de recargar sola', async () => {
    render(<UpdateNotice />);
    announceNewVersion();

    expect(screen.getByText(U.title)).toBeInTheDocument();
    expect(reloadNow).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: U.action }));
    expect(reloadNow).toHaveBeenCalledTimes(1);
  });

  it('con la app en segundo plano y nada a medias recarga sola', () => {
    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).toHaveBeenCalledTimes(1);
  });

  it('recarga sola en cuanto el usuario deja la app, si el aviso llegó con ella en primer plano', () => {
    render(<UpdateNotice />);
    announceNewVersion();
    expect(reloadNow).not.toHaveBeenCalled();

    act(() => setVisibility('hidden'));
    expect(reloadNow).toHaveBeenCalledTimes(1);
  });

  it('con un modal abierto no recarga ni estando en segundo plano: puede haber una reseña a medio escribir', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).not.toHaveBeenCalled();
    expect(screen.getByText(U.title)).toBeInTheDocument();
  });

  it('con un post a medio escribir en el feed tampoco: el compositor no es un modal y va suelto en la pantalla', () => {
    const draft = document.createElement('textarea');
    draft.value = 'lo que llevaba escrito';
    document.body.appendChild(draft);

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).not.toHaveBeenCalled();
    draft.remove();
  });

  it('un textarea vacío no bloquea la recarga: no hay nada que perder', () => {
    document.body.appendChild(document.createElement('textarea'));

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚑ «VISIBLE» NO ES «EN USO». La app se queda abierta en una pestaña durante horas, y ahí el aviso esperaba un
   * clic que no llegaba nunca. Pasado el rato sin tocar nada, recargar no le quita nada a nadie.
   */
  it('con la app a la vista pero quieta un buen rato, se recarga sola', () => {
    vi.useFakeTimers();
    render(<UpdateNotice />);
    announceNewVersion();
    expect(reloadNow).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(6 * 60 * 1000); });
    expect(reloadNow).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('pero no mientras haya alguien tocándola', () => {
    vi.useFakeTimers();
    render(<UpdateNotice />);
    announceNewVersion();

    // Cada par de minutos, una señal de vida: la cuenta vuelve a empezar y no se recarga por la espalda.
    for (let i = 0; i < 5; i += 1) {
      act(() => { vi.advanceTimersByTime(2 * 60 * 1000); });
      act(() => { window.dispatchEvent(new Event('pointerdown')); });
    }

    expect(reloadNow).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('y tampoco si lo que está quieto es un formulario a medio escribir', () => {
    vi.useFakeTimers();
    const draft = document.createElement('textarea');
    draft.value = 'una reseña a medias';
    document.body.appendChild(draft);

    render(<UpdateNotice />);
    announceNewVersion();
    act(() => { vi.advanceTimersByTime(6 * 60 * 1000); });

    expect(reloadNow).not.toHaveBeenCalled();

    // Y en cuanto deja de haber nada que perder, la siguiente vuelta del reloj sí recarga.
    draft.remove();
    act(() => { vi.advanceTimersByTime(31 * 1000); });
    expect(reloadNow).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  /**
   * LO QUE BLOQUEA ES EL CICLO EN MARCHA, NO LA MARCA DE PENDIENTE. Aquí se miraba `isDirty`, que responde a
   * «¿queda algo por subir?» y puede ser cierta para siempre: solo se limpia tras una escritura correcta del
   * gist. Quien no tiene sincronización configurada la deja puesta con su primera edición —no hay ciclo que la
   * limpie— y quien la tiene rota, igual; a los dos se les apagaba la recarga automática entera. Y el caso
   * feo: la persona con la sincronización averiada es justo la que necesita la versión que la arregla.
   */
  it('con cambios pendientes de subir SÍ recarga sola: no hay nada que perder', () => {
    markDirty();

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).toHaveBeenCalledTimes(1);
  });

  it('pero con un ciclo de sincronización en vuelo espera: cortarlo obliga a repetirlo', () => {
    candado = acquireSyncLock();

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).not.toHaveBeenCalled();
  });

  it('y en cuanto ese ciclo termina, la siguiente ocasión sí recarga', () => {
    candado = acquireSyncLock();

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();
    expect(reloadNow).not.toHaveBeenCalled();

    // El ciclo acaba y el usuario vuelve a dejar la app: la comprobación se repite al ocultarse la pestaña.
    candado.release();
    candado = null;
    setVisibility('visible');
    setVisibility('hidden');

    expect(reloadNow).toHaveBeenCalledTimes(1);
  });
});
