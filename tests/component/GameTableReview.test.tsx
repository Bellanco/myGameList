// EL ANÁLISIS NO SE VUELCA EN EL DETALLE: se va a leer a su pantalla.
//
// Volcado ocupaba el detalle entero —hay reseñas de veinte mil caracteres, ver el CHANGELOG de la 1.2.6— y
// empujaba fuera de la vista todo lo demás, que es justo lo que se abre el detalle para ver. Ahora hay un
// enlace a `/stats/resenas/:id` (o, en el perfil social, a la reseña de ese perfil dentro del hub).
//
// Y ES UN ENLACE, no un botón, por tres cosas que un botón no da: abrir en otra pestaña, copiar la dirección y
// volver con el botón de atrás. El precio es que `GameTable` pasa a necesitar un Router, y ese precio se paga
// en silencio: sin él, React lanza «useHref() may be used only in the context of a <Router>» y la pantalla se
// queda en blanco. Ningún otro test despliega un detalle CON análisis, así que este fichero es lo único que
// separa ese fallo de producción.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

// El mosaico lee la preferencia de carátulas, que se sincroniza por cuenta: sin esto intentaría hablar con Firebase.
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

function makeGame(over: Partial<GameItem> = {}): GameItem {
  return {
    id: 7,
    _ts: 1,
    name: 'Rise of Nations',
    platforms: ['Steam'],
    genres: ['Estrategia'],
    steamDeck: false,
    review: 'Un análisis largo.\nCon dos párrafos.',
    grade: 96,
    score: 5,
    years: [2026],
    ...over,
  };
}

function abrir(over: Partial<GameItem> = {}, tab: TabId = 'c', visibility?: { showReview?: boolean }) {
  return render(
    <MemoryRouter>
      <GameTable
        games={[makeGame(over)]}
        currentTab={tab}
        expandedId={7}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
        visibility={visibility}
      />
    </MemoryRouter>,
  );
}

describe('GameTable — el análisis, en el detalle', () => {
  it('no vuelca el texto: pone un enlace a la pantalla de la reseña', () => {
    abrir();
    const enlace = screen.getByRole('link', { name: /Ver análisis de Rise of Nations/i });

    expect(enlace).toHaveAttribute('href', '/stats/resenas/7');
    // Lo que NO puede pasar: que el texto siga ahí ocupando el detalle.
    expect(screen.queryByText(/Con dos párrafos/)).toBeNull();
  });

  it('lleva puesto de dónde se viene, para que el botón de volver de la reseña devuelva AQUÍ', async () => {
    // Sin esto, aquella pantalla devolvía al listado de reseñas —el sitio del que se llega normalmente— y quien
    // había entrado desde su lista acababa en otra pantalla sin saber por qué. El origen viaja en el estado de
    // la ruta, que no está en el DOM: se comprueba navegando de verdad y leyéndolo al otro lado.
    function Sonda() {
      const { state } = useLocation();
      return <p>origen: {(state as { backTo?: string } | null)?.backTo ?? 'ninguno'}</p>;
    }

    render(
      <MemoryRouter initialEntries={['/abandonados']}>
        <Routes>
          <Route
            path="/abandonados"
            element={
              <GameTable
                games={[makeGame()]}
                currentTab="v"
                expandedId={7}
                onExpandedChange={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onMigrate={vi.fn()}
                tabActions={[]}
              />
            }
          />
          <Route path="/stats/resenas/:id" element={<Sonda />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('link', { name: /Ver análisis/i }));
    expect(await screen.findByText('origen: /abandonados')).toBeInTheDocument();
  });

  it('sin análisis escrito no hay enlace que ofrecer', () => {
    abrir({ review: '' });
    expect(screen.queryByRole('link', { name: /análisis/i })).toBeNull();
  });

  it('en el perfil de otra persona lleva a SU reseña en el hub, no a la tuya', async () => {
    // `reviewLink` es lo que pasa `SocialProfileDetailScreen`: el enlace por defecto lleva a la reseña PROPIA,
    // que sobre el juego de otro abriría una pantalla que no habla de lo que se estaba mirando.
    function Sonda() {
      const { pathname, state } = useLocation();
      return <p>{pathname} desde {(state as { backTo?: string } | null)?.backTo ?? 'ninguno'}</p>;
    }

    render(
      <MemoryRouter initialEntries={['/social/profiles/ana']}>
        <Routes>
          <Route
            path="/social/profiles/:profileId"
            element={
              <GameTable
                games={[makeGame()]}
                currentTab="c"
                expandedId={7}
                onExpandedChange={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
                onMigrate={vi.fn()}
                tabActions={[]}
                readOnly
                reviewLink={(id) => ({ to: `/social/profiles/ana/game/${id}/review`, state: { backTo: '/social/profiles/ana' } })}
              />
            }
          />
          <Route path="/social/profiles/:profileId/game/:gameId/review" element={<Sonda />} />
        </Routes>
      </MemoryRouter>,
    );

    const enlace = screen.getByRole('link', { name: /Ver análisis de Rise of Nations/i });
    expect(enlace).toHaveAttribute('href', '/social/profiles/ana/game/7/review');
    await userEvent.click(enlace);
    expect(await screen.findByText('/social/profiles/ana/game/7/review desde /social/profiles/ana')).toBeInTheDocument();
  });

  it('con `showReview: false` no se ofrece', () => {
    abrir({}, 'c', { showReview: false });
    expect(screen.queryByRole('link', { name: /análisis/i })).toBeNull();
  });

  it('en próximos tampoco: un juego al que no se ha jugado no tiene análisis', () => {
    abrir({}, 'p');
    expect(screen.queryByRole('link', { name: /análisis/i })).toBeNull();
  });
});

// EL MISMO ACCESO, EN LA CAJA DEL MOSAICO: un disco en la esquina de abajo a la derecha de la carátula, debajo de la
// nota. Sin desplegar nada: es lo que se ofrece a quien pasea por la colección en mosaico.
describe('GameTable — el análisis, en la caja del mosaico', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function mosaico(
    over: Partial<GameItem> = {},
    { tab = 'c', covers = true, reviewLink }: { tab?: TabId; covers?: boolean; reviewLink?: (id: number) => { to: string } } = {},
  ) {
    localStorage.setItem('mis-listas-list-shape', 'grid');
    localStorage.setItem('mis-listas-covers', covers ? 'on' : 'off');
    return render(
      <MemoryRouter>
        <GameTable
          games={[makeGame(over)]}
          currentTab={tab}
          expandedId={null}
          onExpandedChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMigrate={vi.fn()}
          tabActions={[]}
          reviewLink={reviewLink}
        />
      </MemoryRouter>,
    );
  }

  it('con reseña, la carátula lleva el enlace a su pantalla', () => {
    const { container } = mosaico();
    const enlace = container.querySelector('.game-card-art .game-card-review');

    expect(enlace).not.toBeNull();
    expect(enlace).toHaveAttribute('href', '/stats/resenas/7');
    expect(enlace).toHaveAccessibleName('Ver análisis de Rise of Nations');
  });

  it('va a donde diga `reviewLink`, igual que el del detalle: en un perfil ajeno, a SU reseña', () => {
    const { container } = mosaico({}, { reviewLink: (id) => ({ to: `/social/profiles/ana/game/${id}/review` }) });
    expect(container.querySelector('.game-card-review')).toHaveAttribute('href', '/social/profiles/ana/game/7/review');
  });

  it('sin reseña no hay disco', () => {
    const { container } = mosaico({ review: '' });
    expect(container.querySelector('.game-card-review')).toBeNull();
  });

  it('sin carátulas tampoco: la caja plana abre el análisis desde el detalle desplegado', () => {
    const { container } = mosaico({}, { covers: false });
    expect(container.querySelector('.game-card.is-flat')).not.toBeNull();
    expect(container.querySelector('.game-card-review')).toBeNull();
  });

  it('ni en próximos, donde no hay análisis que leer', () => {
    const { container } = mosaico({}, { tab: 'p' });
    expect(container.querySelector('.game-card-review')).toBeNull();
  });
});
