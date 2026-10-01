import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ANALYTICS_UI, INSTALL_UI } from '../../src/core/constants/consentLabels';
import { ANALYTICS_CONSENT_KEY } from '../../src/core/constants/storageKeys';

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  hasStoredAuthSession: () => false,
  enableAnalyticsAfterConsent: vi.fn(async () => {}),
  reportHandledError: vi.fn(),
}));

/**
 * LA PUERTA DE LOS DOS AVISOS DEL CARRIL. Los avisos llegan por `lazy()` y aquí solo se decide SI se piden: lo que
 * hay que fijar es que el caso normal —consentimiento decidido, sin oferta de instalar— no descarga ninguno, y que
 * cada uno se pide cuando su condición se cumple, también si se cumple después de montar.
 *
 * El repositorio de instalación guarda la oferta en una variable suya, así que cada caso lo reimporta limpio.
 */
describe('LaneBanners — cuándo se piden los avisos del carril', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  async function montar(consentimiento: 'granted' | 'denied' | null) {
    if (consentimiento) localStorage.setItem(ANALYTICS_CONSENT_KEY, consentimiento);
    const repo = await import('../../src/model/repository/installPromptRepository');
    const { LaneBanners } = await import('../../src/view/components/LaneBanners');
    repo.listenForInstallPrompt();
    render(<MemoryRouter><LaneBanners /></MemoryRouter>);
  }

  function ofrecerInstalar(): void {
    const event = new Event('beforeinstallprompt') as Event & { prompt: unknown; userChoice: unknown };
    event.prompt = vi.fn(async () => {});
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  }

  it('con el consentimiento pendiente, pinta su aviso', async () => {
    await montar(null);
    expect(await screen.findByRole('region', { name: ANALYTICS_UI.bannerAria })).toBeInTheDocument();
  });

  it('con todo decidido y sin oferta, no pinta nada', async () => {
    await montar('denied');
    // Lo que se comprueba es una ausencia: se da tiempo a que un `lazy()` resolviera si se hubiera pedido.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('la oferta que llega después de montar pide la invitación', async () => {
    await montar('denied');
    ofrecerInstalar();
    expect(await screen.findByRole('region', { name: INSTALL_UI.bannerAria })).toBeInTheDocument();
  });

  it('con el consentimiento pendiente, la invitación espera aunque haya oferta', async () => {
    await montar(null);
    ofrecerInstalar();
    await screen.findByRole('region', { name: ANALYTICS_UI.bannerAria });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('region', { name: INSTALL_UI.bannerAria })).not.toBeInTheDocument();
  });
});
