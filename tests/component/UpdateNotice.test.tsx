import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateNotice } from '../../src/view/components/UpdateNotice';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import { APP_UPDATE_EVENT } from '../../src/core/utils/appUpdate';
import { markDirty, clearDirty } from '../../src/model/repository/syncStateRepository';

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
});

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

  it('con cambios locales sin subir tampoco recarga sola: cortaría el ciclo de sincronización', () => {
    markDirty();

    render(<UpdateNotice />);
    setVisibility('hidden');
    announceNewVersion();

    expect(reloadNow).not.toHaveBeenCalled();
  });
});
