// El interruptor "Mostrar mi foto de perfil" cuando NO hay foto en la cuenta de Google.
//
// Dejarlo encendido prometía una foto que nadie ve, y con la reciprocidad además le habría hecho creer que aporta la
// suya. Manda lo que hay AHORA en la cuenta, no lo que se guardó en el perfil: por eso vale igual para los perfiles
// que ya existen con el ajuste activado.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOCIAL_UI } from '../../src/core/constants/labels';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';

function renderScreen(over: { showPhoto?: boolean; ownPhotoURL?: string; setShowPhoto?: (v: boolean) => void } = {}) {
  return render(
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
      hiddenTabs={[]}
      onHiddenTabsChange={() => {}}
      hideReplayable={false}
      setHideReplayable={() => {}}
      hideRetry={false}
      setHideRetry={() => {}}
      hideGameTime={false}
      setHideGameTime={() => {}}
      showPhoto={over.showPhoto ?? true}
      setShowPhoto={over.setShowPhoto ?? (() => {})}
      ownPhotoURL={over.ownPhotoURL}
    />,
  );
}

const toggle = () => screen.getByLabelText(SOCIAL_UI.profile.showPhotoField) as HTMLInputElement;

describe('interruptor de la foto de perfil', () => {
  it('con foto en la cuenta: encendido, activo y sin aviso', () => {
    renderScreen({ showPhoto: true, ownPhotoURL: 'https://f/ada.png' });

    expect(toggle().checked).toBe(true);
    expect(toggle().disabled).toBe(false);
    expect(screen.queryByText(SOCIAL_UI.profile.photoMissingInGoogle)).not.toBeInTheDocument();
  });

  // El caso de los perfiles que ya existen: guardaron `showPhoto: true` y hoy la cuenta no tiene foto.
  it('sin foto en la cuenta: apagado y bloqueado, aunque el perfil tenga el ajuste activado', () => {
    renderScreen({ showPhoto: true, ownPhotoURL: '' });

    expect(toggle().checked).toBe(false);
    expect(toggle().disabled).toBe(true);
    expect(screen.getByText(SOCIAL_UI.profile.photoMissingInGoogle)).toBeInTheDocument();
  });

  it('una URL en blanco cuenta como no tener foto', () => {
    renderScreen({ showPhoto: true, ownPhotoURL: '   ' });
    expect(toggle().checked).toBe(false);
    expect(toggle().disabled).toBe(true);
  });

  it('bloqueado de verdad: no se puede encender a base de clics', async () => {
    const setShowPhoto = vi.fn();
    renderScreen({ showPhoto: true, ownPhotoURL: '', setShowPhoto });

    await userEvent.click(toggle());
    expect(setShowPhoto).not.toHaveBeenCalled();
  });

  it('con foto, apagarlo sigue siendo cosa del usuario', async () => {
    const setShowPhoto = vi.fn();
    renderScreen({ showPhoto: true, ownPhotoURL: 'https://f/ada.png', setShowPhoto });

    await userEvent.click(toggle());
    expect(setShowPhoto).toHaveBeenCalledWith(false);
  });

  it('el aviso es una sola línea: el estado del interruptor ya dice el resto', () => {
    expect(SOCIAL_UI.profile.photoMissingInGoogle).toBe('Tu cuenta no tiene foto.');
  });
});
