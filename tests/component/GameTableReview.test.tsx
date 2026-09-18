// EL ANÁLISIS NO SE VUELCA EN EL DETALLE: se va a leer a su pantalla.
//
// Volcado ocupaba el detalle entero —hay reseñas de veinte mil caracteres, ver el CHANGELOG de la 1.2.6— y
// empujaba fuera de la vista todo lo demás, que es justo lo que se abre el detalle para ver. Ahora hay un
// enlace a `/stats/resenas/:id`.
//
// Y ES UN ENLACE, no un botón, por tres cosas que un botón no da: abrir en otra pestaña, copiar la dirección y
// volver con el botón de atrás. El precio es que `GameTable` pasa a necesitar un Router, y ese precio se paga
// en silencio: sin él, React lanza «useHref() may be used only in the context of a <Router>» y la pantalla se
// queda en blanco. Ningún otro test despliega un detalle CON análisis, así que este fichero es lo único que
// separa ese fallo de producción.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

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

  it('en el perfil de otra persona no se ofrece: allí el análisis tiene pestaña propia', () => {
    // `showReview: false` es lo que pasa `SocialProfileDetailScreen`. El enlace lleva a la reseña PROPIA, así
    // que ofrecerlo sobre el juego de otro llevaría a una pantalla que no habla de lo que se estaba mirando.
    abrir({}, 'c', { showReview: false });
    expect(screen.queryByRole('link', { name: /análisis/i })).toBeNull();
  });

  it('en próximos tampoco: un juego al que no se ha jugado no tiene análisis', () => {
    abrir({}, 'p');
    expect(screen.queryByRole('link', { name: /análisis/i })).toBeNull();
  });
});
