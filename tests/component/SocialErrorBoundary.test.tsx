import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// La telemetría toca Firebase; se neutraliza para el test del boundary.
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  reportHandledError: vi.fn(async () => {}),
}));

import { SocialErrorBoundary } from '../../src/view/components/socialhub/SocialErrorBoundary';
import { SOCIAL_UI } from '../../src/core/constants/labels';

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

    // Se ve el aviso, no el contenido, y el botón está deshabilitado con la cuenta atrás (15 min).
    expect(screen.getByText(SOCIAL_UI.errorBoundary.title)).toBeInTheDocument();
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(SOCIAL_UI.errorBoundary.retryIn(15));

    // Aunque se pulse, no reintenta (guardia dura): sigue el fallback.
    control.crash = false; // aunque el hijo ya no fallaría, el cooldown impide el reintento.
    fireEvent.click(btn);
    expect(screen.getByText(SOCIAL_UI.errorBoundary.title)).toBeInTheDocument();
    expect(screen.queryByText('contenido recuperado')).not.toBeInTheDocument();
  });

  it('tras 15 min habilita el reintento y recupera si el hijo ya no falla', () => {
    render(
      <SocialErrorBoundary>
        <Child />
      </SocialErrorBoundary>,
    );

    // Avanza el cooldown completo: la cuenta atrás habilita el botón.
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    const btn = screen.getByRole('button');
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent(SOCIAL_UI.errorBoundary.retry);

    // El hijo ya no falla → al reintentar se recupera el contenido.
    control.crash = false;
    fireEvent.click(btn);
    expect(screen.getByText('contenido recuperado')).toBeInTheDocument();
  });
});
