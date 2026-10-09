// Los interruptores de visibilidad del perfil social dicen lo que SE COMPARTE: encendido = visible (09-10-2026).
//
// Decían «Ocultar lista de…» (encendido = oculto) en la misma pantalla que «Mostrarme movimientos de…» y «Mostrar mi
// foto», y un mismo gesto significaba cosas contrarias. Lo guardado no cambia —sigue siendo lo que se oculta
// (`hiddenTabs`, `hide*`)—: el interruptor se pinta y se escribe negado, y eso es lo que se fija aquí.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';
import type { TabId } from '../../src/model/types/game';

function renderScreen(over: { hiddenTabs?: TabId[]; hideGameTime?: boolean } = {}) {
  const onHiddenTabsChange = vi.fn();
  const setHideGameTime = vi.fn();
  render(
    <SocialProfileScreen
      SOCIAL_UI={SOCIAL_UI}
      profileName="Ada"
      setProfileName={() => {}}
      completedGames={[{ id: 1, name: 'Halo' }]}
      hydratingProfile={false}
      savingProfile={false}
      hasCreatedProfile
      onSaveProfile={() => {}}
      onSignOut={() => {}}
      onBack={() => {}}
      status=""
      statusKind="ok"
      hiddenTabs={over.hiddenTabs ?? []}
      onHiddenTabsChange={onHiddenTabsChange}
      hideReplayable={false}
      setHideReplayable={() => {}}
      hideRetry={false}
      setHideRetry={() => {}}
      hideGameTime={over.hideGameTime ?? false}
      setHideGameTime={setHideGameTime}
    />,
  );
  return { onHiddenTabsChange, setHideGameTime };
}

const casilla = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('interruptores de lo que compartes', () => {
  it('una lista oculta sale APAGADA, y una compartida, encendida', () => {
    renderScreen({ hiddenTabs: ['v'] });

    expect(casilla(SOCIAL_UI.profile.shareVisitedList).checked).toBe(false);
    expect(casilla(SOCIAL_UI.profile.sharePlayingList).checked).toBe(true);
  });

  it('apagar una lista compartida la OCULTA', async () => {
    const { onHiddenTabsChange } = renderScreen();

    await userEvent.setup().click(casilla(SOCIAL_UI.profile.sharePlayingList));

    expect(onHiddenTabsChange).toHaveBeenCalledWith(['e']);
  });

  it('el tiempo jugado: oculto sale apagado, y encenderlo deja de ocultarlo', async () => {
    const { setHideGameTime } = renderScreen({ hideGameTime: true });

    expect(casilla(SOCIAL_UI.profile.shareGameTimeField).checked).toBe(false);
    await userEvent.setup().click(casilla(SOCIAL_UI.profile.shareGameTimeField));

    expect(setHideGameTime).toHaveBeenCalledWith(false);
  });
});
