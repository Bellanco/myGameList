// Salir de «Mi perfil social» con cambios sin guardar pregunta antes, y el chip lo dice (09-10-2026).
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';

function renderScreen(hasUnsavedChanges: boolean) {
  const onBack = vi.fn();
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
      onBack={onBack}
      status=""
      statusKind="ok"
      hiddenTabs={[]}
      onHiddenTabsChange={() => {}}
      hideReplayable={false}
      setHideReplayable={() => {}}
      hideRetry={false}
      setHideRetry={() => {}}
      hasUnsavedChanges={hasUnsavedChanges}
    />,
  );
  return { onBack };
}

describe('salir con cambios sin guardar', () => {
  it('sin cambios, «Ir a la actividad» sale directamente y el chip dice «Sincronizado»', async () => {
    const { onBack } = renderScreen(false);
    expect(screen.getByText(SOCIAL_UI.profile.statusSynced)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: SOCIAL_UI.profile.toFeed }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('con cambios, el chip lo dice y salir pregunta: quedarse no sale, confirmar sí', async () => {
    const user = userEvent.setup();
    const { onBack } = renderScreen(true);
    expect(screen.getByText(SOCIAL_UI.profile.statusUnsaved)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: SOCIAL_UI.profile.toFeed }));
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText(SOCIAL_UI.profile.leaveUnsavedTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: SOCIAL_UI.profile.leaveUnsavedConfirm }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
