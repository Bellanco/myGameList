// SIN CONEXIÓN en el espacio social: lo que ve el usuario.
//
// Antes, quedarse sin red en la parte social se contaba con el error de la librería que fallara primero
// (`network offline`, `Failed to fetch`, «Failed to get document because the client is offline»). Estos tests
// sostienen lo que lo sustituye: un aviso con las palabras del tema, y un vacío que dice la verdad —no hay red—
// en vez de mandar a "descubrir perfiles", que ahí no puede funcionar.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import { SocialErrorBoundary } from '../../src/view/components/socialhub/SocialErrorBoundary';
import type { SocialFeedDayGroup, SocialFeedItem } from '../../src/viewmodel/social/socialFeed';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  reportHandledError: vi.fn(async () => {}),
}));

function renderFeed(over: { offline?: boolean; offlineHasCachedData?: boolean; items?: SocialFeedItem[] } = {}) {
  const items = over.items ?? [];
  const groups: SocialFeedDayGroup[] = items.length
    ? [{ dayHeader: 'hoy', dayDate: new Date(), items }]
    : [];
  return render(
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownPhotoURL=""
      currentSocialGistId="ffee1122aabb0001"
      loadingDirectory={false}
      openProfileDetail={() => {}}
      onOpenProfiles={() => {}}
      onOpenOwnProfile={() => {}}
      onOpenRequests={() => {}}
      pendingIncomingCount={0}
      groupedFeedItems={groups}
      feedItems={items}
      hasMoreFeed={false}
      showMoreFeed={() => {}}
      openActivityDetail={() => {}}
      openMoveReview={() => {}}
      handleActivityItemKeyDown={() => {}}
      composePostText=""
      setComposePostText={() => {}}
      publishingPost={false}
      handlePublishPost={() => {}}
      canPublishPosts={false}
      postMaxLength={1000}
      showPostCounter
      status=""
      statusKind="ok"
      handleSignOut={() => {}}
      offline={over.offline ?? false}
      offlineHasCachedData={over.offlineHasCachedData ?? false}
    />,
  );
}

describe('feed social sin conexión', () => {
  it('con red no hay aviso ninguno', () => {
    renderFeed();

    expect(screen.queryByLabelText(SOCIAL_UI.offline.sectionAria)).toBeNull();
  });

  it('sin red avisa con el titular del tema y dice que lo que se ve es lo guardado', () => {
    renderFeed({ offline: true, offlineHasCachedData: true });

    const notice = screen.getByLabelText(SOCIAL_UI.offline.sectionAria);
    expect(notice).toBeTruthy();
    // El titular es el del tema por defecto (steam); el cuerpo, el de "hay caché".
    expect(notice.textContent).toContain(SOCIAL_UI.offline.leadByPalette.steam);
    expect(notice.textContent).toContain(SOCIAL_UI.offline.body);
  });

  it('sin red y sin nada guardado, el aviso lo dice en vez de prometer datos que no hay', () => {
    renderFeed({ offline: true, offlineHasCachedData: false });

    expect(screen.getByLabelText(SOCIAL_UI.offline.sectionAria).textContent).toContain(SOCIAL_UI.offline.bodyEmpty);
  });

  it('el vacío sin red NO culpa a la falta de amigos ni ofrece descubrir perfiles', () => {
    renderFeed({ offline: true });

    expect(screen.queryByText(SOCIAL_UI.feed.activityEmptyNoFriends)).toBeNull();
    expect(screen.queryByText(SOCIAL_UI.feed.discoverFriends)).toBeNull();
  });

  it('con red, el vacío sigue siendo el de siempre (sin amigos → descubrir perfiles)', () => {
    renderFeed({ offline: false });

    expect(screen.getByText(SOCIAL_UI.feed.activityEmptyNoFriends)).toBeTruthy();
  });
});

describe('boundary del hub social ante un fallo de red', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  function Crash({ error }: { error: Error }): never {
    throw error;
  }

  it('un chunk que no se puede descargar se cuenta como falta de conexión, no como avería', () => {
    render(
      <SocialErrorBoundary>
        <Crash error={new Error('Failed to fetch dynamically imported module: /assets/SocialHub-abc.js')} />
      </SocialErrorBoundary>,
    );

    expect(screen.getByText(SOCIAL_UI.offline.leadByPalette.steam)).toBeTruthy();
    // Y el reintento NO está bloqueado por la espera de 15 min: la red ya está de vuelta en este entorno.
    expect(screen.getByRole('button', { name: SOCIAL_UI.errorBoundary.retry }).getAttribute('aria-disabled')).toBe('false');
    consoleError.mockRestore();
  });

  it('un fallo que no es de red sigue mostrando el aviso de error de siempre', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <SocialErrorBoundary>
        <Crash error={new Error('boom')} />
      </SocialErrorBoundary>,
    );

    expect(screen.getByText(SOCIAL_UI.errorBoundary.titleByPalette.steam)).toBeTruthy();
    spy.mockRestore();
  });
});
