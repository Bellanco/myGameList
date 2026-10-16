import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsHub } from '../../src/view/components/SettingsHub';
import { TOUR_CARD } from '../../src/core/constants/onboardingCardLabels';
import { offeredTour, parseTourState } from '../../src/core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../src/model/repository/onboardingStore';

const noop = () => {};

function renderHub() {
  return render(
    <MemoryRouter>
      <SettingsHub onExport={noop} onImport={noop} onImportLibrary={noop} inboxCount={0} onOpenInbox={noop} />
    </MemoryRouter>,
  );
}

const saved = () => parseTourState(onboardingStore.get() || null);

describe('tarjeta «Primeros pasos» de Ajustes › Datos', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('quien nunca la vio (lo normal si ya usaba la app) puede abrirla desde aquí', async () => {
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: TOUR_CARD.open }));
    expect(saved()).toMatchObject({ status: 'offer' });
  });

  it('a medias, despliega la lista de misiones sin perder lo hecho', async () => {
    saveTourState({ ...offeredTour(), status: 'paused', mission: 'cloud', completed: ['first-game'] });
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: TOUR_CARD.resume }));
    expect(saved()).toMatchObject({ status: 'menu', mission: 'cloud', completed: ['first-game'] });
  });

  it('terminada, se puede repetir desde el principio', async () => {
    saveTourState({ ...offeredTour(), status: 'done', completed: ['first-game', 'cloud', 'coop'] });
    renderHub();
    expect(screen.getByText(TOUR_CARD.doneNote)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: TOUR_CARD.repeat }));
    expect(saved()).toMatchObject({ status: 'offer', completed: [] });
  });
});
