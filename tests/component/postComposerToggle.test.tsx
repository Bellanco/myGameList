// EL CUADRO PARA PUBLICAR SE PUEDE ESCONDER (17-10-2026).
//
// Es una preferencia de Ajustes › Diseño como las demás —local, replicada a `publicConfig` con sesión—, pero solo la
// ve quien su rango deja publicar (oro y mithril). Escondido, el feed no pinta el cuadro y el esqueleto de la próxima
// entrada no le reserva hueco. No quita el permiso de publicar: solo decide si el cuadro está a la vista.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppearanceToggles } from '../../src/view/components/appearance/AppearanceToggles';
import { SocialHubSkeleton } from '../../src/view/components/SocialHubSkeleton';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import { postComposerPreference } from '../../src/view/hooks/preferences';
import { setPreferenceUid } from '../../src/model/repository/preferenceStore';
import { APPEARANCE_UI } from '../../src/core/constants/labels';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { POST_COMPOSER_KEY, SOCIAL_CAN_POST_KEY } from '../../src/core/constants/storageKeys';

const gatewayMocks = vi.hoisted(() => ({
  subscribeSocialAuth: vi.fn(),
  resolveOwnProfile: vi.fn(),
  setPublicConfig: vi.fn(() => Promise.resolve()),
  getPublicConfig: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  reportHandledError: vi.fn(async () => {}),
}));

const ROTULO = APPEARANCE_UI.postComposerLabel;

/** Monta Diseño con una sesión cuyo perfil tiene este rango. */
const conRango = async (tier: string) => {
  gatewayMocks.subscribeSocialAuth.mockImplementation((cb: (u: { uid: string } | null) => void) => {
    cb({ uid: 'uid-1' });
    return () => {};
  });
  gatewayMocks.resolveOwnProfile.mockResolvedValue({ tier });
  render(<AppearanceToggles />);
  await act(async () => {});
};

function renderFeed(canPublishPosts: boolean) {
  return render(
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownVisiblePhotoURL=""
      currentSocialGistId="ffee1122aabb0001"
      loadingDirectory={false}
      openProfileDetail={() => {}}
      openProfileAchievements={() => {}}
      openProfileSummary={() => {}}
      onOpenProfiles={() => {}}
      onOpenOwnProfile={() => {}}
      onOpenRequests={() => {}}
      bellVisible={false}
      bellCount={0}
      groupedFeedItems={[]}
      feedItems={[]}
      hasMoreFeed={false}
      showMoreFeed={() => {}}
      openActivityDetail={() => {}}
      openMoveReview={() => {}}
      handleActivityItemKeyDown={() => {}}
      publishingPost={false}
      handlePublishPost={async () => true}
      canPublishPosts={canPublishPosts}
      postMaxLength={1000}
      showPostCounter
      status=""
      statusKind="ok"
      offline={false}
      offlineHasCachedData={false}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  setPreferenceUid(null);
});

afterEach(() => {
  setPreferenceUid(null);
  vi.clearAllMocks();
});

describe('la casilla «Publicaciones» de Diseño', () => {
  it('bronce y plata no la ven: no pueden publicar', async () => {
    await conRango('silver');
    expect(screen.queryByText(ROTULO)).toBeNull();
  });

  it('oro sí, y viene en «Mostrar»', async () => {
    await conRango('gold');
    const grupo = screen.getByRole('group', { name: APPEARANCE_UI.postComposerAria });
    expect(grupo.querySelector('[aria-pressed="true"]')?.textContent).toBe(APPEARANCE_UI.postComposerShow);
  });

  it('«Ocultar» lo guarda en el aparato y, con sesión, en `publicConfig`', async () => {
    setPreferenceUid('uid-1');
    await conRango('mithril');
    const grupo = screen.getByRole('group', { name: APPEARANCE_UI.postComposerAria });
    fireEvent.click(grupo.querySelectorAll('button')[1]);

    expect(postComposerPreference.get()).toBe(false);
    expect(localStorage.getItem(POST_COMPOSER_KEY)).toBe('off');
    expect(gatewayMocks.setPublicConfig).toHaveBeenCalledWith('uid-1', { showPostComposer: false });
  });
});

describe('el cuadro en la actividad social', () => {
  it('se ve por defecto a quien puede publicar', () => {
    const { container } = renderFeed(true);
    expect(container.querySelector('.hub-post-composer')).not.toBeNull();
  });

  it('escondido en Diseño, no se pinta aunque el rango deje publicar', () => {
    localStorage.setItem(POST_COMPOSER_KEY, 'off');
    const { container } = renderFeed(true);
    expect(container.querySelector('.hub-post-composer')).toBeNull();
  });

  it('el esqueleto no le reserva hueco si está escondido', () => {
    localStorage.setItem(SOCIAL_CAN_POST_KEY, '1');
    localStorage.setItem(POST_COMPOSER_KEY, 'off');
    const { container } = render(<SocialHubSkeleton />);
    expect(container.querySelector('.hub-post-composer')).toBeNull();
  });
});
