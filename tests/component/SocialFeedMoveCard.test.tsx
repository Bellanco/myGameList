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
import { YEAR_SUMMARY_UI } from '../../src/core/constants/yearSummaryLabels';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import { MOVE_GROUP_VISIBLE } from '../../src/view/components/socialhub/FeedMoveCard';
import type {
  SocialFeedDayGroup,
  SocialFeedItem,
  SocialMoveFeedGroup,
  SocialMoveFeedItem,
  SocialMoveGroupGame,
} from '../../src/viewmodel/social/socialFeed';
import { ACHIEVEMENTS_BY_ID } from '../../src/core/achievements/catalog';
import type { TabId } from '../../src/model/types/game';

const AT = Date.parse('2026-08-12T16:42:00.000Z');

function move(
  over: Partial<SocialMoveFeedItem> & { tab: TabId; games?: SocialMoveGroupGame[] },
): SocialMoveFeedGroup & { kind: 'move' } {
  const item: SocialMoveFeedItem = {
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
  };
  // Sin `games`, un renglón de un solo juego: el propio movimiento.
  const games = over.games ?? [{ id: item.id, gameId: item.gameId, gameName: item.gameName, reviewActorId: item.reviewActorId, updatedAt: item.updatedAt }];
  return { ...item, groupKey: `${item.profileId}|${item.tab}|2026-08-12`, games, kind: 'move' as const };
}

function game(gameId: number, gameName: string, reviewActorId?: string): SocialMoveGroupGame {
  return { id: `${gameId}:d`, gameId, gameName, reviewActorId, updatedAt: AT };
}

function renderFeed(
  items: SocialFeedItem[],
  over: {
    openActivityDetail?: () => void;
    openProfileDetail?: (id: string) => void;
    openProfileAchievements?: (id: string) => void;
    openProfileSummary?: (id: string) => void;
    openMoveReview?: (profileId: string, gameId: number) => void;
  } = {},
) {
  const groups: SocialFeedDayGroup[] = [{ dayHeader: '12 de agosto', dayDate: new Date(AT), items }];
  return render(
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownVisiblePhotoURL=""
      currentSocialGistId="ffee1122aabb0001"
      loadingDirectory={false}
      openProfileDetail={over.openProfileDetail ?? (() => {})}
      openProfileAchievements={over.openProfileAchievements ?? (() => {})}
      openProfileSummary={over.openProfileSummary ?? (() => {})}
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
      publishingPost={false}
      handlePublishPost={async () => true}
      canPublishPosts={false}
      postMaxLength={1000}
      showPostCounter
      status=""
      statusKind="ok"
      offline={false}
      offlineHasCachedData={false}
    />,
  );
}

// La estructura que leen los lectores de pantalla (09-10-2026): cada día es su cabecera y una lista NOMBRADA por
// ella, con solo elementos dentro. Antes las cabeceras iban dentro de una única lista (axe: aria-required-children).
describe('estructura del feed', () => {
  it('cada día tiene su propia lista, nombrada por su fecha y sin la cabecera dentro', () => {
    renderFeed([move({ tab: 'c' }), move({ tab: 'v', id: '8:v', gameId: 8 })]);

    const lista = screen.getByRole('list', { name: '12 de agosto' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(within(lista).queryByRole('heading')).toBeNull();
    expect([...lista.children].every((child) => child.getAttribute('role') === 'listitem')).toBe(true);
    expect(screen.getByRole('group', { name: SOCIAL_UI.feed.activityListAria })).toContainElement(lista);
  });
});

describe('renglón de movimiento de lista', () => {
  it('lo cuenta en una frase: autor, verbo y juego, sin hora', () => {
    renderFeed([move({ tab: 'c' })]);

    const card = screen.getByRole('listitem');
    // Una sola frase, en este orden y sin nada más: desde el 07-10-2026 la tarjeta no lleva hora (el día lo dice la
    // cabecera del grupo).
    expect(card.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ada finalizó Hollow Knight');
    expect(card.querySelector('[title]')).toBeNull();
  });

  it('un verbo por lista, en minúscula porque se lee seguido del nombre', () => {
    const { unmount } = renderFeed([move({ tab: 'e' })]);
    expect(screen.getByRole('listitem').textContent).toContain('comenzó');
    unmount();

    renderFeed([move({ tab: 'v', id: '7:v' })]);
    expect(screen.getByRole('listitem').textContent).toContain('abandonó');
  });

  it('deseos y próximos dicen adónde fue el juego, detrás de su nombre', () => {
    const { unmount } = renderFeed([move({ tab: 'd' })]);
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ada añadió Hollow Knight a su lista de deseos',
    );
    unmount();

    renderFeed([move({ tab: 'p', id: '7:p' })]);
    expect(screen.getByRole('listitem').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ada añadió Hollow Knight a su biblioteca',
    );
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

  /* El aviso de movimiento ya no lleva foto: es una FRASE, y llevaba delante el avatar y un icono de lista que
     juntos ocupaban más que el propio texto. Al autor se llega por su NOMBRE, que es el único enlace que queda
     —y el que un lector de pantalla anuncia como tal—. */
  it('el autor sigue siendo navegable por el nombre, y ya no hay foto que pulsar', async () => {
    const openProfileDetail = vi.fn();
    const user = userEvent.setup();
    renderFeed([move({ tab: 'c' })], { openProfileDetail });

    await user.click(screen.getByRole('button', { name: 'Ada' }));
    expect(openProfileDetail).toHaveBeenCalledWith('pid-2');

    expect(screen.queryByLabelText(SOCIAL_UI.feed.openProfileAria('Ada'))).toBeNull();
  });

  it('lo propio y lo ajeno se distinguen igual que en el resto del feed', () => {
    renderFeed([move({ tab: 'c', socialGistId: 'ffee1122aabb0001' })]);

    expect(screen.getByRole('listitem').className).toContain('is-own-activity');
  });

  it('sin fecha utilizable se sigue leyendo igual: la tarjeta no la enseña', () => {
    renderFeed([move({ tab: 'c', updatedAt: Number.NaN })]);

    expect(screen.getByRole('listitem').textContent?.replace(/\s+/g, ' ').trim()).toBe('Ada finalizó Hollow Knight');
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
    // La medalla NO va incrustada en la frase: ABRE el aviso, tenga uno o nueve logros. Que esté siempre en el
    // mismo sitio es lo que permite leer la tarjeta igual en los dos casos.
    expect(within(linea).queryByRole('img')).toBeNull();
    expect(screen.getByRole('img', { name: /Créditos finales IV/ })).toBeInTheDocument();
    expect(screen.queryByText(/1 logros?/)).not.toBeInTheDocument();
  });

  it('con más de tres enseña tres medallas y cuenta el resto', () => {
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
    // Tres, no cinco: la tira pasó a ABRIR el aviso en vez de cerrarlo, y en esa posición cinco sellos empujaban
    // la frase fuera de la línea.
    expect(screen.getAllByRole('img', { name: /./ }).filter((el) => el.className.includes('ach-medal'))).toHaveLength(3);
    expect(screen.getByText('+4')).toBeInTheDocument();
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

/* EL RESUMEN DEL AÑO en el feed: una tarjeta destacada cuando una amistad abre el suyo en temporada. La tarjeta
   entera abre su resumen; el nombre, su ficha. La tuya dice «Ya tienes tu resumen» y no lleva enlace al nombre. */
describe('SocialFeedScreen — tarjeta del resumen del año', () => {
  const resumen = (own = false): SocialFeedItem => ({
    key: `pid-2:year-summary:2026`, profileId: 'pid-2', displayName: 'Ada', photoURL: '', year: 2026, updatedAt: AT, own, kind: 'yearSummary',
  });

  it('la tarjeta abre su resumen y el nombre, su ficha', async () => {
    const openProfileSummary = vi.fn();
    const openProfileDetail = vi.fn();
    renderFeed([resumen()], { openProfileSummary, openProfileDetail });
    const tarjeta = screen.getByRole('listitem', { name: YEAR_SUMMARY_UI.feed.aria('Ada', 2026) });
    expect(tarjeta).toHaveClass('is-year-summary');
    await userEvent.click(within(tarjeta).getByRole('button', { name: 'Ada' }));
    expect(openProfileDetail).toHaveBeenCalledWith('pid-2');
    expect(openProfileSummary).not.toHaveBeenCalled();
    await userEvent.click(within(tarjeta).getByText(YEAR_SUMMARY_UI.feed.line(2026)));
    expect(openProfileSummary).toHaveBeenCalledWith('pid-2');
  });

  it('la tuya habla en segunda persona', () => {
    renderFeed([resumen(true)]);
    expect(screen.getByText(YEAR_SUMMARY_UI.feed.own(2026))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ada' })).not.toBeInTheDocument();
  });
});

describe('renglón agrupado: varios juegos a la misma lista el mismo día', () => {
  const texto = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
  // La tarjeta por su clase: los títulos desplegados también son `listitem`, así que el rol ya no la señala sola.
  const tarjeta = () => document.querySelector('article.is-move') as HTMLElement;

  it('con dos juegos, nombra el primero y «y 1 más» despliega el otro', () => {
    renderFeed([move({ tab: 'd', games: [game(1, 'Wolverine'), game(2, 'Onimusha')] })]);

    expect(texto(tarjeta().querySelector('p.hub-feed-move-line'))).toBe('Ada añadió Wolverine y 1 más a su lista de deseos');
    expect(screen.getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(1, false) })).toBeInTheDocument();
  });

  it('las listas sin destino escrito, igual: el primero en la frase y la cifra detrás', () => {
    renderFeed([move({ tab: 'c', games: [game(1, 'Wolverine'), game(2, 'Onimusha'), game(3, 'Hades')] })]);
    expect(texto(tarjeta().querySelector('p.hub-feed-move-line'))).toBe('Ada finalizó Wolverine y 2 más');
  });

  it('cerrado de entrada; al pulsar la cifra, el resto aparece debajo, y al volver a pulsarla se oculta', async () => {
    const user = userEvent.setup();
    renderFeed([move({
      tab: 'd',
      games: [game(1, 'Wolverine'), game(2, 'Onimusha'), game(3, 'Mouse P.I. for Hire'), game(4, 'Hades')],
    })]);

    const card = tarjeta();
    expect(texto(card.querySelector('p.hub-feed-move-line'))).toBe('Ada añadió Wolverine y 3 más a su lista de deseos');

    const more = within(card).getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(3, false) });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).queryByText('Hades')).not.toBeVisible();

    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).getByText('Onimusha')).toBeVisible();
    expect(within(card).getByText('Mouse P.I. for Hire')).toBeVisible();
    expect(within(card).getByText('Hades')).toBeVisible();

    await user.click(more);
    expect(within(card).queryByText('Hades')).not.toBeVisible();
  });

  it(`con más de ${MOVE_GROUP_VISIBLE}, desplegado la última fila es la cuenta: tres debajo y «y N más»`, async () => {
    const user = userEvent.setup();
    const juegos = Array.from({ length: 9 }, (_unused, i) => game(i + 1, `Juego ${i + 1}`));
    renderFeed([move({ tab: 'd', games: juegos })]);

    // Cerrado, la cifra es la de TODOS los que quedan: es lo que esconde.
    const card = tarjeta();
    expect(texto(card.querySelector('p.hub-feed-move-line'))).toBe('Ada añadió Juego 1 y 8 más a su lista de deseos');

    await user.click(within(card).getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(8, false) }));
    // La frase (Juego 1), los tres más recientes debajo y, en la quinta fila, los cinco que no se listan.
    expect([...card.querySelectorAll('.hub-feed-move-rest li')].map(texto)).toEqual([
      'Juego 2', 'Juego 3', 'Juego 4', SOCIAL_UI.feed.moveMoreCount(5),
    ]);
    expect(within(card).queryByText('Juego 5')).toBeNull();
  });

  it(`con exactamente ${MOVE_GROUP_VISIBLE}, desplegado salen todos y no hay fila de cuenta`, async () => {
    const user = userEvent.setup();
    const juegos = Array.from({ length: MOVE_GROUP_VISIBLE }, (_unused, i) => game(i + 1, `Juego ${i + 1}`));
    renderFeed([move({ tab: 'd', games: juegos })]);

    await user.click(within(tarjeta()).getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(MOVE_GROUP_VISIBLE - 1, false) }));
    expect([...tarjeta().querySelectorAll('.hub-feed-move-rest li')].map(texto)).toEqual(['Juego 2', 'Juego 3', 'Juego 4', 'Juego 5']);
  });

  it(`con ${MOVE_GROUP_VISIBLE + 1}, el quinto ya no cabe: tres debajo y «y 2 más»`, async () => {
    const user = userEvent.setup();
    const juegos = Array.from({ length: MOVE_GROUP_VISIBLE + 1 }, (_unused, i) => game(i + 1, `Juego ${i + 1}`));
    renderFeed([move({ tab: 'd', games: juegos })]);

    await user.click(within(tarjeta()).getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(MOVE_GROUP_VISIBLE, false) }));
    expect([...tarjeta().querySelectorAll('.hub-feed-move-rest li')].map(texto)).toEqual([
      'Juego 2', 'Juego 3', 'Juego 4', SOCIAL_UI.feed.moveMoreCount(2),
    ]);
  });

  it('dentro del grupo, cada juego con análisis sigue abriéndolo', async () => {
    const openMoveReview = vi.fn();
    const user = userEvent.setup();
    renderFeed([move({
      tab: 'd',
      games: [game(1, 'Wolverine'), game(2, 'Onimusha'), game(3, 'Hades', 'pseudonimo-del-gist')],
    })], { openMoveReview });

    await user.click(screen.getByRole('button', { name: SOCIAL_UI.feed.moveMoreAria(2, false) }));
    await user.click(screen.getByRole('button', { name: SOCIAL_UI.feed.openMoveReviewAria('Ada', 'Hades') }));

    expect(openMoveReview).toHaveBeenCalledWith('pseudonimo-del-gist', 3);
  });
});
