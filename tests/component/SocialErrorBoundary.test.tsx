import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// La telemetría toca Firebase; se neutraliza para el test del boundary.
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  reportHandledError: vi.fn(async () => {}),
}));

import { SocialErrorBoundary } from '../../src/view/components/socialhub/SocialErrorBoundary';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

// Componente hijo que lanza según un flag mutable (para simular recuperación tras el reintento).
const control = { crash: true };
function Child() {
  if (control.crash) {
    throw new Error('boom');
  }
  return <div>contenido recuperado</div>;
}

describe('SocialErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    control.crash = true;
    vi.useFakeTimers();
    // React registra el error capturado en consola; lo silenciamos para no ensuciar la salida del test.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    consoleError.mockRestore();
  });

  it('muestra el fallback con el reintento BLOQUEADO 15 min y no reintenta antes de tiempo', () => {
    render(
      <SocialErrorBoundary>
        <Child />
      </SocialErrorBoundary>,
    );

    // Se ve el aviso, no el contenido, y el botón está deshabilitado. El texto del botón NO cambia (nada de
    // cuenta atrás): la espera se explica en una nota aparte, sin cifras.
    expect(screen.getByText(SOCIAL_UI.errorBoundary.titleByPalette.steam)).toBeInTheDocument();
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(SOCIAL_UI.errorBoundary.retry);
    expect(btn).toHaveAttribute('aria-label', SOCIAL_UI.errorBoundary.retryBlockedAria);
    // Ni cuenta atrás en el botón ni nota al pie: la espera no se cuenta en pantalla.
    expect(screen.queryByText(/\d+\s*min/)).not.toBeInTheDocument();

    // Aunque se pulse, no reintenta (guardia dura): sigue el fallback.
    control.crash = false; // aunque el hijo ya no fallaría, el cooldown impide el reintento.
    fireEvent.click(btn);
    expect(screen.getByText(SOCIAL_UI.errorBoundary.titleByPalette.steam)).toBeInTheDocument();
    expect(screen.queryByText('contenido recuperado')).not.toBeInTheDocument();
  });

  it('tras 15 min habilita el reintento y recupera si el hijo ya no falla', () => {
    render(
      <SocialErrorBoundary>
        <Child />
      </SocialErrorBoundary>,
    );

    // La espera sigue siendo de 15 min: el despertador la agota y habilita el botón, y la nota desaparece.
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    const btn = screen.getByRole('button');
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(SOCIAL_UI.errorBoundary.retry);
    expect(btn).not.toHaveAttribute('aria-label');

    // El hijo ya no falla → al reintentar se recupera el contenido.
    control.crash = false;
    fireEvent.click(btn);
    expect(screen.getByText('contenido recuperado')).toBeInTheDocument();
  });
});
