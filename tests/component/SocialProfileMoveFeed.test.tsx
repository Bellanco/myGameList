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

import { TAB_ORDER, TAB_TOOLTIPS } from '../../src/core/constants/labels';
import { moveTabsFromValue } from '../../src/core/social/moveTabsFilter';
import type { TabId } from '../../src/model/types/game';
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

const toggleOf = (tab: TabId) =>
  screen.getByLabelText(TAB_TOOLTIPS[tab]) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('bloque de movimientos del editor de perfil', () => {
  it('arranca con las cinco listas encendidas, deseos incluida', () => {
    renderScreen();

    for (const tab of TAB_ORDER) expect(toggleOf(tab).checked).toBe(true);
    expect(TAB_ORDER).toEqual(['c', 'v', 'e', 'p', 'd']);
    expect(screen.queryByText(SOCIAL_UI.profile.moveFeedAllOff)).not.toBeInTheDocument();
  });

  it('apagar deseos se guarda con la marca, y volver a encenderla la quita', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(toggleOf('d'));
    // La marca es la que distingue «la apagué» de un valor guardado antes de que existiera la lista.
    expect(feedMoveTabsPreference.get()).toBe('cvep~');
    expect(toggleOf('d').checked).toBe(false);

    await user.click(toggleOf('d'));
    expect(feedMoveTabsPreference.get()).toBe('cvepd');
    expect(toggleOf('d').checked).toBe(true);
  });

  it('apagar una lista se guarda al instante, sin pasar por «Guardar»', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(toggleOf('v'));

    expect(feedMoveTabsPreference.get()).toBe('cepd');
    expect(toggleOf('v').checked).toBe(false);
    // El resto sigue igual, y el guardado del perfil no se ha invocado: esto no toca el gist.
    expect(toggleOf('c').checked).toBe(true);
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it('apagarlo todo avisa de que el feed conserva reseñas y publicaciones', async () => {
    const user = userEvent.setup();
    renderScreen();

    for (const tab of TAB_ORDER) {
      await user.click(toggleOf(tab));
    }

    // Apagadas todas las que se ENSEÑAN: las que la interfaz aún no muestra no cuentan para el aviso.
    expect(moveTabsFromValue(feedMoveTabsPreference.get()).filter((tab) => TAB_ORDER.includes(tab))).toEqual([]);
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
