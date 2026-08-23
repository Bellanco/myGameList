// F4 — la tarjeta de movimiento de lista en el feed (variante «susurro»: un renglón).
//
// Lo que estos tests sostienen, que es donde estaba el problema de diseño original: la tarjeta NO compite con una
// reseña. No es pulsable en su conjunto —no hay pantalla de «movimiento» que abrir—, no repite el día que ya dice
// la cabecera del grupo, y de ella solo llevan a algún sitio dos cosas: el autor y, cuando de verdad hay un
// análisis detrás, el nombre del juego.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import type { SocialFeedDayGroup, SocialFeedItem, SocialMoveFeedItem } from '../../src/viewmodel/social/socialFeed';
import type { TabId } from '../../src/model/types/game';

const AT = Date.parse('2026-08-12T16:42:00.000Z');

function move(over: Partial<SocialMoveFeedItem> & { tab: TabId }): SocialMoveFeedItem & { kind: 'move' } {
  return {
    id: `7:${over.tab}`,
    gameId: 7,
    gameName: 'Hollow Knight',
    at: AT,
    updatedAt: AT,
    profileId: 'pid-2',
    profileDisplayName: 'Ada',
    socialGistId: 'ffee1122aabb0002',
    photoURL: '',
    ...over,
    kind: 'move' as const,
  };
}

function renderFeed(
  items: SocialFeedItem[],
  over: {
    openActivityDetail?: () => void;
    openProfileDetail?: (id: string) => void;
    openMoveReview?: (profileId: string, gameId: number) => void;
  } = {},
) {
  const groups: SocialFeedDayGroup[] = [{ dayHeader: '12 de agosto', dayDate: new Date(AT), items }];
  return render(
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownPhotoURL=""
      currentSocialGistId="ffee1122aabb0001"
      loadingDirectory={false}
      openProfileDetail={over.openProfileDetail ?? (() => {})}
      onOpenProfiles={() => {}}
      onOpenOwnProfile={() => {}}
      onOpenRequests={() => {}}
      pendingIncomingCount={0}
      groupedFeedItems={groups}
      feedItems={items}
      hasMoreFeed={false}
      showMoreFeed={() => {}}
      openActivityDetail={over.openActivityDetail ?? (() => {})}
      openMoveReview={over.openMoveReview ?? (() => {})}
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
      offline={false}
      offlineHasCachedData={false}
    />,
  );
}

describe('renglón de movimiento de lista', () => {
  it('lo cuenta en una línea: autor, verbo, juego y hora', () => {
    renderFeed([move({ tab: 'c' })]);

    const card = screen.getByRole('listitem');
    // Un solo renglón, en este orden y sin nada más.
    expect(card.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ada terminó Hollow Knight 18:42');
  });

  it('la hora sustituye a la fecha completa, que queda al pasar el ratón', () => {
    renderFeed([move({ tab: 'c' })]);

    const hora = screen.getByText(SOCIAL_UI.feed.movedAtHour(new Date(AT)));
    expect(hora).toBeInTheDocument();
    // El día no se repite en la tarjeta (lo da la cabecera del grupo), pero sigue disponible en el título.
    expect(hora).toHaveAttribute('title', SOCIAL_UI.feed.movedAt(new Date(AT)));
    expect(screen.queryByText(SOCIAL_UI.feed.movedAt(new Date(AT)))).not.toBeInTheDocument();
  });

  it('un verbo por lista, en minúscula porque se lee seguido del nombre', () => {
    const { unmount } = renderFeed([move({ tab: 'e' })]);
    expect(screen.getByRole('listitem').textContent).toContain('empezó');
    unmount();

    renderFeed([move({ tab: 'v', id: '7:v' })]);
    expect(screen.getByRole('listitem').textContent).toContain('dejó');
  });

  it('con análisis detrás, el nombre del juego lo abre CON EL ACTOR DE LA RESEÑA', async () => {
    const openMoveReview = vi.fn();
    const user = userEvent.setup();
    // Los dos identificadores son distintos a propósito: `profileId` es el de la entrada del directorio (para una
    // amistad, su uid de Firebase) y `reviewActorId` el pseudónimo del gist, que es el que resuelve el detalle.
    // Con el equivocado el enlace llevaba a una pantalla que no encontraba nada.
    renderFeed([move({ tab: 'c', profileId: 'uid-de-firebase', reviewActorId: 'pseudonimo-del-gist' })], { openMoveReview });

    const juego = screen.getByRole('button', { name: SOCIAL_UI.feed.openMoveReviewAria('Ada', 'Hollow Knight') });
    await user.click(juego);

    expect(openMoveReview).toHaveBeenCalledWith('pseudonimo-del-gist', 7);
    expect(openMoveReview).not.toHaveBeenCalledWith('uid-de-firebase', 7);
  });

  it('sin análisis detrás, el nombre del juego no ofrece el gesto', () => {
    renderFeed([move({ tab: 'c' })]);

    // Está, se lee, y no es un control: no hay botón con el nombre del juego.
    expect(screen.getByText('Hollow Knight').tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: /Hollow Knight/ })).not.toBeInTheDocument();
  });

  it('la tarjeta entera NO abre nada ni es enfocable', async () => {
    const openActivityDetail = vi.fn();
    const user = userEvent.setup();
    renderFeed([move({ tab: 'c' })], { openActivityDetail });

    const card = screen.getByRole('listitem');
    await user.click(card);

    expect(openActivityDetail).not.toHaveBeenCalled();
    expect(card).not.toHaveAttribute('tabindex');
    expect(card).not.toHaveAttribute('aria-label');
    expect(card.className).toContain('is-move');
  });

  it('el autor sí es navegable, por el nombre y por el avatar', async () => {
    const openProfileDetail = vi.fn();
    const user = userEvent.setup();
    renderFeed([move({ tab: 'c' })], { openProfileDetail });

    await user.click(screen.getByRole('button', { name: 'Ada' }));
    expect(openProfileDetail).toHaveBeenCalledWith('pid-2');

    await user.click(screen.getByLabelText(SOCIAL_UI.feed.openProfileAria('Ada')));
    expect(openProfileDetail).toHaveBeenCalledTimes(2);
  });

  it('lo propio y lo ajeno se distinguen igual que en el resto del feed', () => {
    renderFeed([move({ tab: 'c', socialGistId: 'ffee1122aabb0001' })]);

    expect(screen.getByRole('listitem').className).toContain('is-own-activity');
  });

  it('sin fecha utilizable no inventa una', () => {
    renderFeed([move({ tab: 'c', updatedAt: Number.NaN })]);

    expect(screen.getByText(SOCIAL_UI.feed.moveRecently)).toBeInTheDocument();
  });
});
