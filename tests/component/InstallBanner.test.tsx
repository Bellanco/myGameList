import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { INSTALL_UI } from '../../src/core/constants/labels';
import { ANALYTICS_CONSENT_KEY, INSTALL_HINT_KEY } from '../../src/core/constants/storageKeys';

/**
 * LA INVITACIÓN A INSTALAR, y sobre todo CUÁNDO NO SE ENSEÑA.
 *
 * Lo que hay que fijar aquí no es el aspecto del aviso: es la regla que evita el cuarto vecino del carril de
 * abajo a la izquierda —no sale mientras el consentimiento esté pendiente— y las dos señales que ese carril
 * necesita (`data-install` y `--install-h`), que son las mismas que publica el banner de consentimiento.
 *
 * El módulo del repositorio guarda la oferta en una variable suya, así que cada caso lo reimporta limpio: sin
 * eso, la oferta atrapada en un test se colaría en el siguiente.
 */
describe('InstallBanner — la invitación a instalar', () => {
  const root = () => document.documentElement;

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    root().removeAttribute('data-install');
    root().style.removeProperty('--install-h');
  });

  interface Montaje {
    /** ¿Ha dado el navegador la oportunidad de instalar? */
    oferta: boolean;
    /** Decisión ya guardada sobre la analítica; `null` = todavía sin decidir (el carril está ocupado). */
    consentimiento?: 'granted' | 'denied' | null;
  }

  /** Deja el consentimiento decidido (o pendiente) y devuelve el componente con su repositorio ya cargados. */
  async function montar({ oferta, consentimiento = 'denied' }: Montaje) {
    if (consentimiento) localStorage.setItem(ANALYTICS_CONSENT_KEY, consentimiento);

    const repo = await import('../../src/model/repository/installPromptRepository');
    const { InstallBanner } = await import('../../src/view/components/InstallBanner');
    repo.listenForInstallPrompt();

    const prompt = vi.fn(async () => {});
    if (oferta) {
      const event = new Event('beforeinstallprompt') as Event & { prompt: unknown; userChoice: unknown };
      event.prompt = prompt;
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    }

    return { ...render(<InstallBanner />), prompt, repo, InstallBanner };
  }

  const aviso = () => screen.queryByRole('region', { name: INSTALL_UI.bannerAria });

  it('sin oferta del navegador no enseña nada', async () => {
    await montar({ oferta: false });

    expect(aviso()).not.toBeInTheDocument();
    expect(root().hasAttribute('data-install')).toBe(false);
  });

  it('con el consentimiento aún sin decidir se calla, aunque haya oferta', async () => {
    await montar({ oferta: true, consentimiento: null });

    // El carril es de uno solo: primero se decide sobre la analítica, después se sugiere instalar.
    expect(aviso()).not.toBeInTheDocument();
    expect(root().hasAttribute('data-install')).toBe(false);
  });

  it('decidido el consentimiento y con oferta, se enseña y publica las dos señales del carril', async () => {
    await montar({ oferta: true });

    expect(aviso()).toBeInTheDocument();
    expect(root().getAttribute('data-install')).toBe('offered');
    // En jsdom toda caja mide cero: lo que se comprueba es que la medida se PUBLICA con su unidad, no cuánto
    // vale — el número real solo existe en un navegador.
    expect(root().style.getPropertyValue('--install-h')).toMatch(/^\d+px$/);
  });

  it('aparece en cuanto se decide el consentimiento, sin recargar', async () => {
    const { repo } = await montar({ oferta: true, consentimiento: null });
    expect(aviso()).not.toBeInTheDocument();

    const { persistAnalyticsConsent } = await import('../../src/model/repository/analyticsConsentRepository');
    persistAnalyticsConsent('denied');

    await waitFor(() => expect(aviso()).toBeInTheDocument());
    expect(repo.hasInstallOffer()).toBe(true);
  });

  it('«ahora no» lo retira, lo recuerda y retira las señales', async () => {
    await montar({ oferta: true });

    fireEvent.click(screen.getByRole('button', { name: INSTALL_UI.bannerReject }));

    expect(aviso()).not.toBeInTheDocument();
    expect(localStorage.getItem(INSTALL_HINT_KEY)).toBe('off');
    expect(root().hasAttribute('data-install')).toBe(false);
    expect(root().style.getPropertyValue('--install-h')).toBe('');
  });

  it('«añadir» cede el turno al diálogo del navegador y se retira después', async () => {
    const { prompt } = await montar({ oferta: true });

    fireEvent.click(screen.getByRole('button', { name: INSTALL_UI.bannerAccept }));

    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(aviso()).not.toBeInTheDocument());
    // Aceptar en el diálogo NO apunta el «ahora no»: lo que apaga la invitación es la instalación misma
    // (`appinstalled`), y la oferta ya se ha gastado de todas formas.
    expect(localStorage.getItem(INSTALL_HINT_KEY)).toBeNull();
  });

  it('ya instalada, no se ofrece instalar otra vez', async () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    await montar({ oferta: true });

    expect(aviso()).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
