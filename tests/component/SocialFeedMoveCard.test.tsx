// F4 — la tarjeta de movimiento de lista en el feed (variante «susurro»: un renglón).
//
// Lo que estos tests sostienen, que es donde estaba el problema de diseño original: la tarjeta NO compite con una
// reseña. No es pulsable en su conjunto —no hay pantalla de «movimiento» que abrir—, no repite el día que ya dice
// la cabecera del grupo, y de ella solo llevan a algún sitio dos cosas: el autor y, cuando de verdad hay un
// análisis detrás, el nombre del juego.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import type { SocialFeedDayGroup, SocialFeedItem, SocialMoveFeedItem } from '../../src/viewmodel/social/socialFeed';
import { ACHIEVEMENTS_BY_ID } from '../../src/core/achievements/catalog';
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
    openProfileAchievements?: (id: string) => void;
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
      openProfileAchievements={over.openProfileAchievements ?? (() => {})}
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
    // Un solo renglón, en este orden y sin nada más. La hora se compone con el mismo formateador que la vista: si se
    // escribe a mano, el test solo pasa en la zona horaria de quien lo escribió (en CI, que va en UTC, fallaba).
    expect(card.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      `Ada finalizó Hollow Knight ${SOCIAL_UI.feed.movedAtHour(new Date(AT))}`,
    );
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
    expect(screen.getByRole('listitem').textContent).toContain('comenzó');
    unmount();

    renderFeed([move({ tab: 'v', id: '7:v' })]);
    expect(screen.getByRole('listitem').textContent).toContain('abandonó');
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


describe('SocialFeedScreen — la tarjeta de LOGROS', () => {
  const logros = (over: Partial<{ items: Array<{ id: string; level: number }>; profileId: string }> = {}) => ({
    key: 'pid-2:2026-08-12',
    profileId: over.profileId ?? 'pid-2',
    authorName: 'Ada',
    photoURL: '',
    updatedAt: AT,
    items: (over.items ?? [{ id: 'completados-50', level: 1 }, { id: 'tesis-1', level: 1 }]).map((entry) => ({
      def: ACHIEVEMENTS_BY_ID.get(entry.id)!,
      level: entry.level,
    })),
    own: false,
    kind: 'achievements' as const,
  });

  /** La tarjeta, no los `li` de la tira de medallas —que también son `listitem`—. */
  const tarjetaDeLogros = () => screen.getByRole('listitem', { name: /Créditos finales/ });

  it('con varios logros dice cuántos, no los enumera en el titular', () => {
    renderFeed([logros()]);
    expect(screen.getByText('Ha conseguido 2 logros')).toBeInTheDocument();
  });

  it('con UNO solo dice cuál y no «1 logro»', () => {
    renderFeed([logros({ items: [{ id: 'completados-75', level: 1 }] })]);

    const linea = screen.getByText('Ha conseguido').closest('p') as HTMLElement;
    expect(within(linea).getByText('Créditos finales IV')).toBeInTheDocument();
    // La medalla NO va incrustada en la frase: vive en el canto contrario al avatar, tenga uno o nueve logros.
    // Que esté siempre en el mismo sitio es lo que permite leer la tarjeta igual en los dos casos.
    expect(within(linea).queryByRole('img')).toBeNull();
    expect(screen.getByRole('img', { name: /Créditos finales IV/ })).toBeInTheDocument();
    expect(screen.queryByText(/1 logros?/)).not.toBeInTheDocument();
  });

  it('con más de cinco enseña cinco medallas y cuenta el resto', () => {
    // El tope existe para que la burbuja no se convierta en una parrilla. Lo que se queda dentro es lo más raro
    // del día —`buildAchievementFeed` ordena por rareza—, así que el recorte se lleva lo más común.
    renderFeed([logros({
      items: [
        { id: 'completados-50', level: 1 },
        { id: 'tesis-1', level: 1 },
        { id: 'resenas-5', level: 1 },
        { id: 'horas-10', level: 1 },
        { id: 'amistades-1', level: 1 },
        { id: 'sofa-5', level: 1 },
        { id: 'speedrun-1', level: 1 },
      ],
    })]);

    expect(screen.getByText('Ha conseguido 7 logros')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /./ }).filter((el) => el.className.includes('ach-medal'))).toHaveLength(5);
    expect(screen.getByText('+2')).toBeInTheDocument();
    // Y lo que queda fuera del corte no está en ninguna parte de la tarjeta: el titular no lo nombra —para eso
    // está el contador— y su medalla tampoco se pinta. Sigue estando en el `aria-label` de la tarjeta, que es
    // quien no puede perder ningún nombre.
    expect(screen.queryByText('Speedrun I')).not.toBeInTheDocument();
  });

  it('cada medalla dice qué se ha desbloqueado al pasar por encima', () => {
    // El rótulo es un elemento propio —no un `title`— para que salga también con el tabulador.
    renderFeed([logros()]);
    expect(screen.getByText('Créditos finales III')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('img', { name: /Créditos finales III/ })).toBeInTheDocument();
  });

  it('la tarjeta ENTERA lleva a los logros, no solo su parte de arriba', async () => {
    // La tarjeta ya traía `cursor: pointer` de `.hub-feed-activity-item`, así que el puntero prometía en toda la
    // superficie algo que solo respondía en el avatar, el nombre y las medallas.
    const alPerfil = vi.fn();
    const aLosLogros = vi.fn();
    renderFeed([logros()], { openProfileDetail: alPerfil, openProfileAchievements: aLosLogros });

    await userEvent.click(tarjetaDeLogros());

    expect(aLosLogros).toHaveBeenCalledWith('pid-2');
    expect(alPerfil).not.toHaveBeenCalled();
  });

  it('y responde también con el teclado', async () => {
    const aLosLogros = vi.fn();
    renderFeed([logros()], { openProfileAchievements: aLosLogros });

    tarjetaDeLogros().focus();
    await userEvent.keyboard('{Enter}');

    expect(aLosLogros).toHaveBeenCalledWith('pid-2');
  });

  it('el nombre del autor sigue llevando a su ficha, sin disparar la tarjeta', async () => {
    // `stopPropagation`: sin él, pulsar el nombre haría las dos cosas y ganaría la última.
    const alPerfil = vi.fn();
    const aLosLogros = vi.fn();
    renderFeed([logros()], { openProfileDetail: alPerfil, openProfileAchievements: aLosLogros });

    await userEvent.click(screen.getByRole('button', { name: 'Ada' }));

    expect(alPerfil).toHaveBeenCalledWith('pid-2');
    expect(aLosLogros).not.toHaveBeenCalled();
  });

  it('las medallas no son paradas de tabulador: la pulsable es la tarjeta', async () => {
    renderFeed([logros()]);
    const medalla = screen.getByRole('img', { name: /Créditos finales III/ });
    expect(medalla.closest('button')).toBeNull();
    // Pero el rótulo sigue ahí para el ratón, y los nombres van en el nombre accesible de la tarjeta.
    expect(screen.getByText('Créditos finales III')).toHaveAttribute('aria-hidden', 'true');
    expect(tarjetaDeLogros()).toHaveAccessibleName(/Créditos finales III, Tesis doctoral/);
  });

  it('tus propios logros salen marcados como actividad PROPIA', async () => {
    renderFeed([{ ...logros(), own: true }]);
    expect(tarjetaDeLogros().className).toContain('is-own-activity');
  });
});
