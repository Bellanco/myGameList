// F4 — el bloque «Movimientos en tu actividad» del editor de perfil.
//
// Lo que hay que dejar claro, y por eso se prueba: es un ajuste de LECTURA. No pasa por el guardado del perfil
// (no toca el gist ni lo que ven los demás) y surte efecto en el momento, sin pulsar «Guardar».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const gatewayMocks = vi.hoisted(() => ({
  getPublicConfig: vi.fn(async (): Promise<unknown> => null),
  setPublicConfig: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

import { TAB_TOOLTIPS } from '../../src/core/constants/labels';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';
import { feedMoveTabsPreference } from '../../src/view/hooks/preferences';

const onSaveProfile = vi.fn();
const setHideGameTime = vi.fn();

function renderScreen() {
  return render(
    <SocialProfileScreen
      SOCIAL_UI={SOCIAL_UI}
      profileName="Ada"
      setProfileName={() => {}}
      completedGames={[{ id: 1, name: 'Halo' }]}
      hydratingProfile={false}
      savingProfile={false}
      hasCreatedProfile
      onSaveProfile={onSaveProfile}
      onSignOut={() => {}}
      onBack={() => {}}
      status=""
      statusKind="ok"
      hiddenTabs={[]}
      onHiddenTabsChange={() => {}}
      hideReplayable={false}
      setHideReplayable={() => {}}
      hideRetry={false}
      setHideRetry={() => {}}
      hideGameTime={false}
      setHideGameTime={setHideGameTime}
      showPhoto
      setShowPhoto={() => {}}
      ownPhotoURL="https://f/ada.png"
    />,
  );
}

const toggleOf = (tab: 'c' | 'v' | 'e' | 'p') =>
  screen.getByLabelText(TAB_TOOLTIPS[tab]) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('bloque de movimientos del editor de perfil', () => {
  it('arranca con las cuatro listas encendidas', () => {
    renderScreen();

    expect(toggleOf('c').checked).toBe(true);
    expect(toggleOf('v').checked).toBe(true);
    expect(toggleOf('e').checked).toBe(true);
    expect(toggleOf('p').checked).toBe(true);
    expect(screen.queryByText(SOCIAL_UI.profile.moveFeedAllOff)).not.toBeInTheDocument();
  });

  it('apagar una lista se guarda al instante, sin pasar por «Guardar»', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(toggleOf('v'));

    expect(feedMoveTabsPreference.get()).toBe('cep');
    expect(toggleOf('v').checked).toBe(false);
    // El resto sigue igual, y el guardado del perfil no se ha invocado: esto no toca el gist.
    expect(toggleOf('c').checked).toBe(true);
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it('apagarlo todo avisa de que el feed conserva reseñas y publicaciones', async () => {
    const user = userEvent.setup();
    renderScreen();

    for (const tab of ['c', 'v', 'e', 'p'] as const) {
      await user.click(toggleOf(tab));
    }

    expect(feedMoveTabsPreference.get()).toBe('');
    expect(screen.getByText(SOCIAL_UI.profile.moveFeedAllOff)).toBeInTheDocument();
  });

  it('el texto dice que no cambia lo que ven los demás', () => {
    renderScreen();

    // El bloque va aparte del de visibilidad y su descripción tiene que sostener esa diferencia.
    expect(screen.getByText(SOCIAL_UI.profile.moveFeedDescription)).toBeInTheDocument();
    expect(SOCIAL_UI.profile.moveFeedDescription).toMatch(/no cambia lo que ven los demás/i);
  });

  it('no se mezcla con los interruptores de visibilidad: apagar uno no toca los del perfil', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(toggleOf('e'));

    expect(setHideGameTime).not.toHaveBeenCalled();
    expect((screen.getByLabelText(SOCIAL_UI.profile.hidePlayingList) as HTMLInputElement).checked).toBe(false);
  });
});
