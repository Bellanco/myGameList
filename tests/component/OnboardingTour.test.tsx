import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingTour } from '../../src/view/components/onboarding/OnboardingTour';
import { offeredTour, parseTourState, type TourState } from '../../src/core/onboarding/tourState';
import { MISSIONS, type TourContext } from '../../src/core/onboarding/tourSteps';
import { onboardingStore } from '../../src/model/repository/onboardingStore';
import { TOUR_UI } from '../../src/core/constants/onboardingLabels';
import { INVITE_UI } from '../../src/core/constants/inviteLabels';

const CTX: TourContext = {
  path: '/completados',
  gameCount: 0,
  syncConnected: false,
  socialStatus: 'inactive',
  socialSignedIn: false,
  hasSocialSpace: false,
  settingsMenuOpen: false,
  inboxCount: 0,
};

const saved = (): TourState | null => parseTourState(onboardingStore.get() || null);

/** El control que señala la guía, con caja de verdad: jsdom no maqueta y todo mediría 0×0. */
function plantAnchor(tour: string, tag: 'button' | 'div' = 'button'): HTMLElement {
  const element = document.createElement(tag);
  element.dataset.tour = tour;
  element.getBoundingClientRect = () => ({ x: 300, y: 690, left: 300, top: 690, width: 58, height: 58, right: 358, bottom: 748, toJSON: () => ({}) });
  document.body.appendChild(element);
  return element;
}

describe('guía de primeros pasos', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('la bienvenida lista las misiones y «Empezar» arranca la primera', async () => {
    render(<OnboardingTour state={offeredTour()} ctx={CTX} />);
    expect(screen.getByRole('dialog', { name: TOUR_UI.welcome.title })).toBeTruthy();
    for (const id of ['first-game', 'cloud', 'library', 'coop'] as const) {
      expect(screen.getByText(TOUR_UI.missions[id].name)).toBeTruthy();
    }
    expect(screen.getByText(TOUR_UI.menu.secondary)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: TOUR_UI.welcome.start }));
    expect(saved()).toMatchObject({ status: 'active', mission: 'first-game' });
  });

  it('«Ahora no» la pliega en el botón de la izquierda, dentro del carril de avisos', async () => {
    const lane = document.createElement('div');
    lane.className = 'ach-toast-stack';
    document.body.appendChild(lane);

    const { rerender } = render(<OnboardingTour state={offeredTour()} ctx={CTX} />);
    await userEvent.click(screen.getByRole('button', { name: TOUR_UI.welcome.later }));
    const paused = saved();
    expect(paused).toMatchObject({ status: 'paused' });

    rerender(<OnboardingTour state={paused!} ctx={CTX} />);
    const pill = await screen.findByRole('button', { name: TOUR_UI.pill.aria(0, 3) });
    expect(lane.contains(pill)).toBe(true);

    await userEvent.click(pill);
    expect(saved()).toMatchObject({ status: 'menu' });
  });

  it('el paso de añadir señala el «+» y no ofrece «Siguiente»: se cumple haciéndolo', async () => {
    plantAnchor('add-game');
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game', step: 2 };
    render(<OnboardingTour state={state} ctx={CTX} />);

    const bubble = await screen.findByRole('dialog', { name: TOUR_UI.steps.add.title });
    expect(bubble.textContent).toContain(TOUR_UI.steps.add.tap);
    expect(screen.queryByRole('button', { name: TOUR_UI.buttons.next })).toBeNull();
    expect(document.querySelector('.ob-ring.is-action')).not.toBeNull();
  });

  it('guardar el primer juego celebra la misión', async () => {
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game', step: 2 };
    render(<OnboardingTour state={state} ctx={{ ...CTX, gameCount: 1 }} />);
    await waitFor(() => expect(saved()).toMatchObject({ mission: 'first-game', step: 3 }));
  });

  it('con un diálogo abierto la guía se aparta entera', async () => {
    plantAnchor('add-game');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game', step: 2 };
    render(<OnboardingTour state={state} ctx={CTX} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('dialog', { name: TOUR_UI.steps.add.title })).toBeNull();
  });

  it('sin su control, el paso sale igualmente, sin flecha', async () => {
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game', step: 1 };
    render(<OnboardingTour state={state} ctx={CTX} />);
    const bubble = await screen.findByRole('dialog', { name: TOUR_UI.steps.lists.title }, { timeout: 3000 });
    expect(bubble.querySelector('.ob-caret')).toBeNull();
  });

  it('la invitación enseña la vista previa y la dirección completa, y copiarla la da por hecha', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const invite = MISSIONS.coop.steps.findIndex((candidate) => candidate.id === 'invite');
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'coop', step: invite, completed: ['first-game', 'cloud'] };
    render(<OnboardingTour state={state} ctx={{ ...CTX, path: '/social', socialStatus: 'active', syncConnected: true }} />);

    expect(screen.getByRole('img', { name: INVITE_UI.previewAlt })).toBeTruthy();
    expect(screen.getByText(INVITE_UI.url)).toBeTruthy();
    expect(INVITE_UI.url).toBe('https://mygamelist.pages.dev/completados');

    await userEvent.click(screen.getAllByRole('button', { name: INVITE_UI.copy })[0]);
    expect(writeText).toHaveBeenCalledWith(INVITE_UI.url);
    expect(await screen.findByText(INVITE_UI.copied)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: TOUR_UI.buttons.next }));
    expect(saved()).toMatchObject({ status: 'finale', completed: ['first-game', 'cloud', 'coop'] });
  });

  it('Escape pliega la guía', async () => {
    plantAnchor('add-game');
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game', step: 2 };
    render(<OnboardingTour state={state} ctx={CTX} />);
    const bubble = await screen.findByRole('dialog', { name: TOUR_UI.steps.add.title });
    bubble.querySelector<HTMLButtonElement>('.ob-close')!.focus();
    await userEvent.keyboard('{Escape}');
    expect(saved()).toMatchObject({ status: 'paused', mission: 'first-game' });
  });

  it('el ofrecimiento de lo social: «Enséñame» arranca solo esa misión y «No, gracias» no vuelve', async () => {
    const hint: TourState = { ...offeredTour(), status: 'hint', mission: 'coop', single: true };
    const { rerender } = render(<OnboardingTour state={hint} ctx={{ ...CTX, path: '/social' }} />);
    const bubble = await screen.findByRole('dialog', { name: TOUR_UI.hints.coop.title }, { timeout: 3000 });
    await userEvent.click(within(bubble).getByRole('button', { name: TOUR_UI.hints.yes }));
    expect(saved()).toMatchObject({ status: 'active', mission: 'coop', step: 0, single: true });

    rerender(<OnboardingTour state={hint} ctx={{ ...CTX, path: '/social' }} />);
    const again = await screen.findByRole('dialog', { name: TOUR_UI.hints.coop.title }, { timeout: 3000 });
    await userEvent.click(within(again).getByRole('button', { name: TOUR_UI.hints.no }));
    expect(saved()).toMatchObject({ status: 'dismissed', declined: ['coop'] });
  });

  it('el ofrecimiento no sale fuera de su pantalla', async () => {
    const hint: TourState = { ...offeredTour(), status: 'hint', mission: 'cloud', single: true };
    render(<OnboardingTour state={hint} ctx={{ ...CTX, path: '/stats' }} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('quien perdió la sesión con espacio ve «vuelve a entrar», aunque no tenga guía', async () => {
    render(<OnboardingTour state={null} relogin ctx={{ ...CTX, path: '/social', syncConnected: true, hasSocialSpace: true }} />);
    const bubble = await screen.findByRole('dialog', { name: TOUR_UI.relogin.title }, { timeout: 3000 });
    expect(bubble.textContent).toContain(TOUR_UI.relogin.text);
    expect(bubble.textContent).not.toContain('crea');
    await userEvent.click(within(bubble).getByRole('button', { name: TOUR_UI.buttons.close }));
    expect(screen.queryByRole('dialog', { name: TOUR_UI.relogin.title })).toBeNull();
    // Y no escribe nada: no es una guía, es un aviso.
    expect(saved()).toBeNull();
  });
});
