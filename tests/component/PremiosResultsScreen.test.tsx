import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PremiosResultsScreen } from '../../src/view/components/premios/PremiosResultsScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosSeasonResult } from '../../src/model/types/premios';

const L = PREMIOS_UI.resultados;

const archivo: PremiosSeasonResult = {
  season: 2026,
  seasonId: 'reto-2026',
  name: 'El reto del jugador 2026',
  totalBallots: 3,
  winners: { goty: 'goty_option_0' },
  categoriesSnapshot: [
    {
      id: 'goty',
      title: { es: 'Juego del año' },
      winner: 'goty_option_0',
      weight: 3,
      options: [
        { id: 'goty_option_0', name: 'Elden Ring' },
        { id: 'goty_option_1', name: 'Hades II' },
      ],
    },
    { id: 'arte', title: { es: 'Mejor arte' }, winner: null, weight: 1, options: [] },
  ],
  leaderboard: [
    { rank: 1, profileId: 'p-ana', nickname: 'Ana', points: 6 },
    { rank: 2, profileId: 'p-beto', nickname: 'Beto', points: 3 },
  ],
};

describe('PremiosResultsScreen', () => {
  it('enseña el ganador de cada categoría por su nombre, no por su id', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Juego del año')).toBeInTheDocument();
    expect(screen.getByText('Elden Ring')).toBeInTheDocument();
  });

  it('no lista las categorías que se quedaron sin ganador', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Mejor arte')).not.toBeInTheDocument();
  });

  it('pinta la clasificación con su puesto y sus puntos', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(L.points(6))).toBeInTheDocument();
    // El puesto se ve como disco con su cifra, y se OYE con su rótulo: quien no ve el color necesita el texto.
    expect(screen.getByText(L.positionAria(1))).toBeInTheDocument();
  });

  // EL ARCHIVO NO LLEVA IDENTIFICADORES REALES: lo propio se reconoce por el pseudónimo, que es público y no
  // dice quién eres fuera de esta app.
  it('reconoce lo tuyo por el pseudónimo', () => {
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="p-beto" />
      </MemoryRouter>,
    );
    const propio = container.querySelector('.premios-results__step.is-own');
    expect(propio?.textContent).toContain('Beto');
  });

  // EL PODIO es lo que se viene a mirar, y va antes que las veintiséis categorías.
  it('sube los tres primeros puestos al podio y empieza la lista en el cuarto', () => {
    const catorce = Array.from({ length: 14 }, (_, i) => ({
      rank: i + 1,
      profileId: `p-${i}`,
      nickname: `Persona ${i + 1}`,
      points: 20 - i,
    }));
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={{ ...archivo, leaderboard: catorce }} leaderboard={catorce} ownProfileId="" />
      </MemoryRouter>,
    );

    const escalones = [...container.querySelectorAll('.premios-results__step')];
    expect(escalones).toHaveLength(3);
    expect(escalones[0].textContent).toContain('Persona 1');

    // Y NO SE REPITE A NADIE: quien está en el podio no vuelve a salir en la lista.
    const filas = [...container.querySelectorAll('.premios-results__row')];
    expect(filas).toHaveLength(11);
    expect(filas[0].textContent).toContain('Persona 4');
    expect(screen.getAllByText('Persona 1')).toHaveLength(1);
  });

  // Un empate es un solo PUESTO: los dos comparten escalón en vez de aparecer en dos.
  it('junta a los empatados en el mismo escalón', () => {
    const empatados = [
      { rank: 1, profileId: 'p-ana', nickname: 'Ana', points: 6 },
      { rank: 1, profileId: 'p-beto', nickname: 'Beto', points: 6 },
      { rank: 2, profileId: 'p-cris', nickname: 'Cris', points: 4 },
    ];
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={{ ...archivo, leaderboard: empatados }} leaderboard={empatados} ownProfileId="" />
      </MemoryRouter>,
    );

    const escalones = [...container.querySelectorAll('.premios-results__step')];
    expect(escalones).toHaveLength(2);
    expect(escalones[0].textContent).toContain('Ana');
    expect(escalones[0].textContent).toContain('Beto');
    expect(escalones[0].textContent).toContain(L.tie);
  });

  // Con todo el mundo en el podio no hay clasificación que enseñar: un panel repitiéndolo sería un eco.
  it('no pinta la clasificación si nadie se queda fuera del podio', () => {
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.premios-results__board')).toBeNull();
  });

  // EL TITULAR sale del PESO archivado, no del nombre de la categoría: el rótulo se escribe a mano cada año.
  it('destaca la categoría que más pesaba', () => {
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    const titular = container.querySelector('.premios-results__headline');
    expect(titular?.textContent).toContain('Juego del año');
    expect(titular?.textContent).toContain('Elden Ring');
  });

  it('sin una categoría que pese más que las otras no destaca ninguna', () => {
    const iguales = {
      ...archivo,
      categoriesSnapshot: archivo.categoriesSnapshot.map((c) => ({ ...c, weight: 1 })),
    };
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={iguales} leaderboard={iguales.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.premios-results__headline')).toBeNull();
    expect(container.querySelector('.premios-results__winner-card')?.textContent).toContain('Elden Ring');
  });

  it('sin pseudónimo no marca ninguna fila como propia', () => {
    const { container } = render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.is-own')).toBeNull();
  });

  /**
   * LA LÁMINA, EN LA PÁGINA Y YA ABIERTA. Fue un modal con flechas y botón de cerrar: tapaba la clasificación
   * que se estaba mirando y había que saber que el trofeo de una fila se podía pulsar para que pasara algo.
   */
  it('abre la lámina por la tuya y la cambia al pulsar otro trofeo', async () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="p-beto" />
      </MemoryRouter>,
    );

    const lamina = await screen.findByRole('img', { name: PREMIOS_UI.palmares.medalAria(2, archivo.name) });
    expect(lamina).toBeInTheDocument();

    // El trofeo del que se está mirando va hundido, que es lo que dice cuál de los cinco es.
    const suyo = screen.getAllByRole('button', { name: L.trophy })[0];
    expect(suyo).toHaveAttribute('aria-pressed', 'true');

    // Y al pulsar el de otro premiado, cambia la lámina sin abrir nada.
    await userEvent.click(screen.getAllByRole('button', { name: L.see })[0]);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: PREMIOS_UI.palmares.medalAria(1, archivo.name) })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Sin sesión no hay lámina: el arte no se enseña en la página pública (ver `AwardPanel`).
  it('sin pseudónimo no se ofrece ninguna lámina', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: L.see })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /./ })).not.toBeInTheDocument();
  });

  // El «copiar el enlace para tus amigos» competía con el nombre de la edición por algo que se hace una vez al
  // año: la dirección es pública y está en la barra del navegador.
  it('no ofrece compartir', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('button', { name: new RegExp(PREMIOS_UI.compartir.copy, 'i') }),
    ).not.toBeInTheDocument();
  });

  it('lo dice claro cuando no hay edición publicada', () => {
    render(
      <MemoryRouter>
        <PremiosResultsScreen result={null} leaderboard={[]} ownProfileId="" />
      </MemoryRouter>,
    );
    expect(screen.getByText(L.empty)).toBeInTheDocument();
  });
});
