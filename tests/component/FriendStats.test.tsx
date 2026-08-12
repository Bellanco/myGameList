import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FriendStats } from '../../src/view/components/stats/FriendStats';
import { UI_MESSAGES } from '../../src/core/constants/labels';
import { STATS_LABELS_OTHER } from '../../src/core/constants/statsOtherLabels';
import type { SocialSharedGame } from '../../src/model/repository/socialGistRepository';
import type { GameItem, TabId } from '../../src/model/types/game';

// Misma razón que en StatsHub: la escala vive en un store hidratado desde Firestore y aquí solo se pinta.
vi.mock('../../src/model/repository/scorePreferenceRepository', () => ({
  getScoreScale: () => 'stars',
  subscribeScoreScale: () => () => {},
}));

// El panel del amigo es el MISMO que el propio, pero hablando de otra persona: los rótulos que se comprueban aquí
// son los de la voz ajena («Lo mejor de su biblioteca»), no los de la propia.
const L = STATS_LABELS_OTHER;
/** Textos sin voz (nombres de lista, escalas), que son los mismos en los dos paneles. */
const OWN = UI_MESSAGES.stats;

function shared(overrides: Partial<SocialSharedGame> & { id: number; name: string }): SocialSharedGame {
  return { platforms: ['PC'], genres: ['RPG'], rating: 4, grade: 80, snippet: '', ...overrides };
}

/** Un juego del gist de LISTADOS: lo que llega al abrir el perfil de una amistad, con sus campos privados. */
function full(overrides: Partial<GameItem> & { id: number; name: string }): GameItem {
  return { _ts: 1, platforms: ['PC'], genres: ['RPG'], steamDeck: false, review: '', grade: 80, ...overrides };
}

const LISTS: Partial<Record<TabId, SocialSharedGame[]>> = {
  c: [
    shared({ id: 1, name: 'Uno', grade: 90, years: [2024] }),
    shared({ id: 2, name: 'Dos', grade: 60, genres: ['Acción'], years: [2023] }),
  ],
  v: [shared({ id: 3, name: 'Tres', grade: 30, genres: ['Terror'] })],
  p: [shared({ id: 4, name: 'Cuatro', grade: 0, genres: ['Puzles'] })],
};

/** Las mismas listas, pero como llegan del gist de listados de una amistad: con horas, razones y fechas. */
const ENERO = new Date(2026, 0, 12).getTime();
const FULL_LISTS: Partial<Record<TabId, GameItem[]>> = {
  c: [
    full({ id: 1, name: 'Uno', grade: 90, years: [2024], hours: 30, listedAt: ENERO, review: 'Un juegazo de los que no se olvidan, con un final a la altura.' }),
    full({ id: 2, name: 'Dos', grade: 60, genres: ['Acción'], years: [2023], hours: 10, listedAt: ENERO }),
  ],
  v: [full({ id: 3, name: 'Tres', grade: 30, genres: ['Terror'], hours: 4, retry: true, reasons: ['Se hace repetitivo'], listedAt: ENERO })],
  p: [full({ id: 4, name: 'Cuatro', grade: 0, genres: ['Puzles'], listedAt: ENERO })],
};

const heading = (name: string) => screen.queryByRole('heading', { name });

describe('FriendStats · lo que ve cada rango', () => {
  it('bronce ve el retrato y nada más', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="bronze" viewerHiddenTabs={[]} />);

    expect(heading(L.top.title)).toBeInTheDocument();
    expect(heading(L.years.title)).toBeInTheDocument();
    expect(heading(L.radar.title)).toBeInTheDocument();
    expect(heading(L.genres.title)).toBeInTheDocument();
    // Lo que su rango no alcanza, con el aviso de por qué.
    expect(heading(L.grades.title)).not.toBeInTheDocument();
    expect(heading(L.ratio.title)).not.toBeInTheDocument();
    expect(screen.getByText(L.friend.tierMore)).toBeInTheDocument();
  });

  it('oro añade las notas y el ratio, pero no llega a las listas', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);

    expect(heading(L.grades.title)).toBeInTheDocument();
    expect(heading(L.ratio.title)).toBeInTheDocument();
    expect(heading(L.shame.title)).not.toBeInTheDocument();
    expect(heading(L.wishlist.title)).not.toBeInTheDocument();
    expect(screen.getByText(L.friend.tierMore)).toBeInTheDocument();
  });

  it('mithril lo ve todo: también sus abandonos y su lista de próximos, y ya no le falta nada', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(heading(L.shame.title)).toBeInTheDocument();
    expect(heading(L.wishlist.title)).toBeInTheDocument();
    expect(screen.queryByText(L.friend.tierMore)).not.toBeInTheDocument();
  });

  it('habla de la otra persona, no de quien mira', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);

    // El panel es el mismo, pero no dice «tu biblioteca» de la biblioteca de otro.
    expect(heading('Lo mejor de su biblioteca')).toBeInTheDocument();
    expect(heading(OWN.top.title)).not.toBeInTheDocument();
    expect(heading(OWN.radar.title)).not.toBeInTheDocument();
    // Y trae los subtítulos de cada bloque, igual que el panel propio.
    expect(screen.getByText(L.top.subtitle)).toBeInTheDocument();
  });

  it('con solo la proyección pública no se enseña lo que no viaja: ni horas ni razones', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.queryByText(L.shame.hours)).not.toBeInTheDocument();
    expect(screen.queryByText(L.shame.retry)).not.toBeInTheDocument();
    expect(screen.queryByText(L.shame.reasons)).not.toBeInTheDocument();
    expect(screen.queryByText(L.shame.recent)).not.toBeInTheDocument();
    expect(screen.queryByText(L.tiles.hours)).not.toBeInTheDocument();
  });

  it('solo mithril puede cambiar de periodo', () => {
    const { unmount } = render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);
    expect(screen.queryByRole('button', { name: L.scope.general })).not.toBeInTheDocument();
    unmount();

    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);
    expect(screen.getByRole('button', { name: L.scope.general })).toBeInTheDocument();
    // Los años salen de lo publicado: el canal social sí trae `years`.
    expect(screen.getByRole('button', { name: L.scope.yearAria(2024) })).toBeInTheDocument();
  });
});

// ── Datos completos: solo para la administración, y solo si el gist de listados ha llegado ──────────────────

describe('FriendStats · con los juegos completos del amigo', () => {
  it('mithril ve el panel entero: horas, abandonos con razones y evolución del backlog', () => {
    render(<FriendStats sharedLists={FULL_LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    const tiles = within(document.querySelector('.stats-tiles') as HTMLElement);
    expect(tiles.getByText(L.tiles.hours).closest('.stat-tile')).toHaveTextContent('44');
    expect(tiles.getByText(L.tiles.longest).closest('.stat-tile')).toHaveTextContent('Uno');
    expect(heading(L.backlog.title)).toBeInTheDocument();
    expect(screen.getByText(L.shame.reasons)).toBeInTheDocument();
    expect(screen.getByText(L.shame.retry)).toBeInTheDocument();
  });

  it('sus reseñas no se pintan aquí: tienen su propio apartado en el perfil', () => {
    render(<FriendStats sharedLists={FULL_LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.queryByText(L.reviews.tile)).not.toBeInTheDocument();
    expect(heading(L.reviews.title)).not.toBeInTheDocument();
    expect(document.querySelector('.podium-quote')).toBeNull();
  });

  it('el rango no basta: sin gist de listados, mithril se queda en la proyección pública', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={[]} />);

    // Ni un cero disfrazado de dato en las piezas que dependen de los campos privados.
    expect(screen.queryByText(L.tiles.hours)).not.toBeInTheDocument();
    expect(heading(L.backlog.title)).not.toBeInTheDocument();
  });

  it('quien no es administración no ve las horas aunque los juegos completos estén cargados', () => {
    render(<FriendStats sharedLists={FULL_LISTS} viewerTier="gold" viewerHiddenTabs={[]} />);

    expect(screen.queryByText(L.tiles.hours)).not.toBeInTheDocument();
    expect(heading(L.backlog.title)).not.toBeInTheDocument();
    expect(heading(L.shame.title)).not.toBeInTheDocument();
  });

  it('sin horas (las esconde) el resto del panel completo sigue en pie', () => {
    // `applyProfileVisibility` ya las ha puesto a null antes de llegar: es lo único que se respeta frente a mithril.
    const sinHoras = {
      c: FULL_LISTS.c!.map((game) => ({ ...game, hours: null })),
      v: FULL_LISTS.v!.map((game) => ({ ...game, hours: null })),
    };
    render(<FriendStats sharedLists={sinHoras} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.queryByText(L.tiles.hours)).not.toBeInTheDocument();
    expect(screen.queryByText(L.shame.hours)).not.toBeInTheDocument();
    // Pero las razones de abandono y la marca de otra oportunidad sí las ve.
    expect(screen.getByText(L.shame.reasons)).toBeInTheDocument();
    expect(screen.getByText(L.shame.retry)).toBeInTheDocument();
  });
});

describe('FriendStats · reciprocidad', () => {
  it('quien esconde una lista deja de verla, y se le dice', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="gold" viewerHiddenTabs={['v']} />);

    expect(screen.getByText(L.friend.blocked(OWN.backlog.lists.v.toLowerCase()))).toBeInTheDocument();
    // Sin los abandonados, las cifras cuentan solo los dos completados. Se busca dentro de las cifras
    // destacadas: "Juegos" también rotula cosas del gráfico anual.
    const tiles = within(document.querySelector('.stats-tiles') as HTMLElement);
    expect(tiles.getByText(L.tiles.games).closest('.stat-tile')).toHaveTextContent('3');
  });

  it('quien lo esconde todo se queda sin panel', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="silver" viewerHiddenTabs={['c', 'v', 'e', 'p']} />);

    expect(screen.getByText(L.friend.blockedAll)).toBeInTheDocument();
    expect(heading(L.top.title)).not.toBeInTheDocument();
  });

  it('la cuenta de administración ve el panel aunque lo esconda todo', () => {
    render(<FriendStats sharedLists={LISTS} viewerTier="mithril" viewerHiddenTabs={['c', 'v', 'e', 'p']} />);

    expect(screen.queryByText(L.friend.blockedAll)).not.toBeInTheDocument();
    expect(heading(L.top.title)).toBeInTheDocument();
  });

  it('sin listas compartidas no hay nada que resumir', () => {
    render(<FriendStats sharedLists={{}} viewerTier="mithril" viewerHiddenTabs={[]} />);

    expect(screen.getByText(L.friend.empty)).toBeInTheDocument();
  });
});
