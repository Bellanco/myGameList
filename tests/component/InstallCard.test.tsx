import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { INSTALL_CARD } from '../../src/core/constants/installCardLabels';
import { INSTALL_HINT_KEY } from '../../src/core/constants/storageKeys';

/**
 * LA TARJETA DE INSTALAR DE AJUSTES › DISEÑO: botón cuando el navegador lo ofrece, instrucciones cuando no, y nada
 * cuando la app ya está instalada. A diferencia del aviso del principio, el «Ahora no» no la apaga.
 *
 * Como en `InstallBanner.test.tsx`, el repositorio guarda la oferta en una variable suya: cada caso lo reimporta
 * limpio para que la oferta de uno no se cuele en el siguiente.
 */
describe('InstallCard — instalar desde Ajustes', () => {
  const agenteOriginal = navigator.userAgent;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: agenteOriginal, configurable: true });
    vi.unstubAllGlobals();
  });

  async function montar({ oferta }: { oferta: boolean }) {
    const repo = await import('../../src/model/repository/installPromptRepository');
    const { InstallCard } = await import('../../src/view/components/settings/InstallCard');
    repo.listenForInstallPrompt();

    const prompt = vi.fn(async () => {});
    if (oferta) {
      const event = new Event('beforeinstallprompt') as Event & { prompt: unknown; userChoice: unknown };
      event.prompt = prompt;
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    }
    return { ...render(<InstallCard />), prompt };
  }

  const tarjeta = () => screen.queryByRole('heading', { name: INSTALL_CARD.title });
  const boton = () => screen.queryByRole('button', { name: INSTALL_CARD.add });

  it('con oferta del navegador hay botón, aunque se dijera «Ahora no» en el aviso', async () => {
    localStorage.setItem(INSTALL_HINT_KEY, 'off');
    await montar({ oferta: true });

    expect(tarjeta()).toBeInTheDocument();
    expect(boton()).toBeInTheDocument();
    expect(screen.queryByText(INSTALL_CARD.manual)).not.toBeInTheDocument();
  });

  it('el botón abre el diálogo del navegador; gastada la oferta sin instalar, explica cómo hacerlo a mano', async () => {
    const { prompt } = await montar({ oferta: true });

    fireEvent.click(boton()!);
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(INSTALL_CARD.manual)).toBeInTheDocument());
    expect(boton()).not.toBeInTheDocument();
  });

  it('sin oferta explica el camino del menú del navegador', async () => {
    await montar({ oferta: false });

    expect(tarjeta()).toBeInTheDocument();
    expect(boton()).not.toBeInTheDocument();
    expect(screen.getByText(INSTALL_CARD.manual)).toBeInTheDocument();
  });

  it('en un iPhone explica el de Compartir', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    await montar({ oferta: false });

    expect(screen.getByText(INSTALL_CARD.ios)).toBeInTheDocument();
  });

  it('abierta como app instalada no se pinta', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)', media: query, addEventListener() {}, removeEventListener() {} }));
    await montar({ oferta: false });

    expect(tarjeta()).not.toBeInTheDocument();
  });

  it('se retira en cuanto el navegador avisa de que se ha instalado', async () => {
    await montar({ oferta: true });
    expect(tarjeta()).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(tarjeta()).not.toBeInTheDocument();
  });
});
