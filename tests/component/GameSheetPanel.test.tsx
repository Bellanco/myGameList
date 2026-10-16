import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { GameSheetSignal } from '../../src/core/gameSheet/buildGameSheet';
import { GameSheetPanel, type GameSheetPanelProps } from '../../src/view/components/gameSheet/GameSheetPanel';
import { TAB_ACTIONS } from '../../src/core/constants/labels';
import { statsReviewPath } from '../../src/core/utils/reviewPath';
import type { GameItem, TabData } from '../../src/model/types/game';

// Las señales de tus amistades salen de la copia del directorio social en IndexedDB (F3): aquí se dan hechas.
const senales = vi.hoisted(() => ({
  actuales: [] as GameSheetSignal[],
  indice: [] as GameSheetSignal[],
  faltan: 0,
  deAmistad: null as null | { friend: { id: string; name: string }; tab: 'c' | 'v' | 'e' | 'p' | 'd'; item: Record<string, unknown> },
}));
vi.mock('../../src/viewmodel/gameSheet/gameSheetFriendSignals', () => ({
  loadGameSheetFriendSignals: () => Promise.resolve(senales.actuales),
}));
// El índice de sus bibliotecas (F4) llega aparte, con su `import()`.
vi.mock('../../src/viewmodel/gameSheet/friendLibraryIndex', () => ({
  loadFriendLibraryIndex: () => Promise.resolve({ signals: senales.indice, missing: senales.faltan }),
  loadFriendGameEntry: () => Promise.resolve(senales.deAmistad),
}));

// LA FICHA DE UN JUEGO (F2 del plan de la ficha): el panel que sustituye al detalle de la fila. jsdom no maqueta,
// así que aquí se prueba lo que no depende del layout —qué enseña, qué hace cada botón, Esc y el gesto de cerrar— y
// el ancho medido y el scroll quedan para el e2e.

function juego(id: number, name: string, over: Partial<GameItem> = {}): GameItem {
  return { id, _ts: 1, name, platforms: ['Steam'], genres: ['Metroidvania'], steamDeck: false, review: '', ...over };
}

function biblioteca(parcial: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0, ...parcial };
}

const hollow = juego(1, 'Hollow Knight', {
  grade: 92,
  score: 5,
  hours: 46,
  years: [2024, 2018],
  replayable: true,
  steamDeck: true,
  strengths: ['Exploración'],
  weaknesses: ['Mapa de pago'],
  review: 'Un mapa que se descubre a mano.',
  enteredAt: { c: new Date(2024, 0, 20).getTime() },
});
const silksong = juego(2, 'Hollow Knight: Silksong', { grade: 80, score: 4 });

function pintar(over: Partial<GameSheetPanelProps> = {}) {
  const props: GameSheetPanelProps = {
    open: true,
    data: biblioteca({ c: [hollow], d: [silksong] }),
    slug: 'hollow-knight',
    onClose: vi.fn(),
    onOpenGame: vi.fn(),
    tabActions: TAB_ACTIONS,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMigrate: vi.fn(),
    reviewTarget: (_tab, game) => ({ to: statsReviewPath(game.id, game.name) }),
    onAddGame: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <GameSheetPanel {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('GameSheetPanel', () => {
  it('se abre con el nombre, tu lista, desde cuándo y el resumen de una línea', () => {
    pintar();
    const dialog = screen.getByRole('dialog', { name: 'Ficha de Hollow Knight' }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Hollow Knight' })).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText('desde enero de 2024')).toBeInTheDocument();
    expect(screen.getByText('Steam · Metroidvania · 2024')).toBeInTheDocument();
  });

  it('enseña todo lo que enseñaba el detalle, con sus reglas de completados', () => {
    pintar();
    expect(screen.getByText('Steam Deck')).toBeInTheDocument();
    expect(screen.getByText('Exploración')).toBeInTheDocument();
    expect(screen.getByText('Mapa de pago')).toBeInTheDocument();
    expect(screen.getByText('Rejugabilidad')).toBeInTheDocument();
    expect(screen.getByText('Tu nota')).toBeInTheDocument();
  });

  it('plataformas, géneros y años van en renglones sin rótulo, cada uno con su nombre accesible', () => {
    pintar();
    expect(screen.getByLabelText('Plataformas')).toHaveTextContent('Steam');
    expect(screen.getByLabelText('Géneros')).toHaveTextContent('Metroidvania');
    expect(screen.getByLabelText('Años en los que se completó')).toHaveTextContent('2024');
    expect(screen.queryByText('Años en los que se completó')).toBeNull();
  });

  it('los años van del más reciente al más antiguo', () => {
    pintar({ data: biblioteca({ c: [{ ...hollow, years: [2019, 2023, 2020] }] }) });
    const anios = [...screen.getByLabelText('Años en los que se completó').querySelectorAll('.chip')].map((chip) => chip.textContent);
    expect(anios).toEqual(['2023', '2020', '2019']);
  });

  it('con 0 horas no hay tiempo jugado: un 0 es la casilla sin rellenar', () => {
    pintar({ data: biblioteca({ c: [{ ...hollow, hours: 0 }] }) });
    expect(screen.queryByText('Tiempo jugado')).toBeNull();
  });

  it('el tiempo jugado sube a las cifras de la cabecera, a la izquierda de la nota', () => {
    pintar();
    const cifras = [...document.querySelectorAll('.gs-head-numbers dt')].map((dt) => dt.textContent);
    expect(cifras.slice(0, 2)).toEqual(['Tiempo jugado', 'Tu nota']);
    expect(document.querySelector('.gs-head-numbers dd')).toHaveTextContent('46 horas');
  });

  it('tu análisis va en un renglón como el de una amistad, con el comienzo del texto y tu nota, sin nombre', () => {
    pintar();
    const analisis = screen.getByRole('article', { name: 'Ver análisis de Hollow Knight' });
    expect(analisis).toHaveTextContent('«Un mapa que se descubre a mano.»');
    expect(analisis.querySelector('h3')).toBeNull();
    expect(analisis.querySelector('.hub-person-row-action')).not.toBeNull();
  });

  it('en curso no enseña nota (ahí vale 0) ni horas, pero sí el análisis, como el detalle', () => {
    pintar({ data: biblioteca({ e: [juego(3, 'Persona 5 Strikers', { score: 0, hours: 12, review: 'x' })] }), slug: 'persona-5-strikers' });
    expect(screen.queryByText('Tu nota')).toBeNull();
    expect(screen.queryByText('Tu interés')).toBeNull();
    expect(screen.queryByText('Tiempo jugado')).toBeNull();
    const analisis = screen.getByRole('article', { name: 'Ver análisis de Persona 5 Strikers' });
    expect(analisis.querySelector('.hub-person-row-action')).toBeNull();
  });

  it('en próximos y deseos no hay análisis', () => {
    pintar({ data: biblioteca({ p: [juego(4, 'Hades', { grade: 70, review: 'x' })] }), slug: 'hades' });
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('en deseos, el rótulo de la nota es «Tu interés»', () => {
    pintar({ slug: 'hollow-knight-silksong' });
    expect(screen.getByText('Tu interés')).toBeInTheDocument();
  });

  it('no se abre si no tienes el juego de esa clave', () => {
    pintar({ slug: 'celeste' });
    expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
  });

  it('Esc y la X cierran', () => {
    const props = pintar();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('los botones mueven, editan y borran el juego de su lista', () => {
    const props = pintar();
    fireEvent.click(screen.getByRole('button', { name: /Pasar a en curso/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar - Hollow Knight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Hollow Knight' }));
    expect(props.onMigrate).toHaveBeenCalledWith('c', 1, 'e');
    expect(props.onEdit).toHaveBeenCalledWith('c', 1);
    expect(props.onDelete).toHaveBeenCalledWith('c', 1);
  });

  it('la saga abre la ficha de la otra entrega y marca la actual', () => {
    const props = pintar();
    const otras = screen.getAllByRole('button', { name: 'Abrir la ficha de Hollow Knight: Silksong' });
    fireEvent.click(otras[0]);
    expect(props.onOpenGame).toHaveBeenCalledWith('Hollow Knight: Silksong');
    expect(document.querySelector('.gs-saga-item[aria-current="true"]')).not.toBeNull();
  });
});

describe('GameSheetPanel · deslizar a la derecha para cerrar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 400 });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
  });

  function arrastrar(dx: number, dy: number, pointerType: string, msTotal: number) {
    const panel = document.querySelector('.gs-panel') as HTMLElement;
    const pasos = 6;
    act(() => {
      fireEvent.pointerDown(panel, { pointerId: 1, pointerType, clientX: 100, clientY: 300 });
    });
    for (let i = 1; i <= pasos; i++) {
      act(() => {
        vi.advanceTimersByTime(msTotal / pasos);
        fireEvent.pointerMove(panel, { pointerId: 1, pointerType, clientX: 100 + (dx * i) / pasos, clientY: 300 + (dy * i) / pasos });
      });
    }
    const durante = panel.style.transform;
    act(() => {
      fireEvent.pointerUp(panel, { pointerId: 1, pointerType, clientX: 100 + dx, clientY: 300 + dy });
      vi.advanceTimersByTime(300);
    });
    return { durante, despues: panel.style.transform };
  }

  it('un arrastre largo hacia la derecha cierra', () => {
    const props = pintar();
    const { durante } = arrastrar(200, 0, 'touch', 600);
    expect(durante).toBe('translateX(200px)');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('uno corto y lento vuelve a su sitio', () => {
    const props = pintar();
    const { durante, despues } = arrastrar(60, 0, 'touch', 600);
    expect(durante).toBe('translateX(60px)');
    expect(despues).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('un gesto vertical es del scroll y no mueve el panel', () => {
    const props = pintar();
    const { durante } = arrastrar(10, -200, 'touch', 300);
    expect(durante).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('con el ratón no hace nada', () => {
    const props = pintar();
    const { durante } = arrastrar(250, 0, 'mouse', 100);
    expect(durante).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('GameSheetPanel · tus amistades (F3)', () => {
  const marta = { id: 'p-marta', name: 'Marta' };
  const nacho = { id: 'p-nacho', name: 'Nacho' };
  const sara = { id: 'p-sara', name: 'Sara' };

  afterEach(() => {
    senales.actuales = [];
    senales.indice = [];
    senales.faltan = 0;
  });

  function Donde() {
    return <span data-testid="donde">{useLocation().pathname}</span>;
  }

  async function pintarConAmistades() {
    senales.actuales = [
      { kind: 'move', friend: nacho, gameName: 'Hollow Knight', tab: 'e', at: 2 },
      { kind: 'review', friend: marta, gameName: 'Hollow Knight', grade: 90, snippet: 'Un mapa a mano.', at: 1 },
      { kind: 'move', friend: sara, gameName: 'Hollow Knight', tab: 'd', at: 3 },
      { kind: 'review', friend: nacho, gameName: 'Celeste', grade: 40, snippet: 'Otro juego.', at: 1 },
    ];
    const props: GameSheetPanelProps = {
      open: true,
      data: biblioteca({ c: [hollow] }),
      slug: 'hollow-knight',
      onClose: vi.fn(),
      onOpenGame: vi.fn(),
      tabActions: TAB_ACTIONS,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onMigrate: vi.fn(),
      reviewTarget: (_tab, game) => ({ to: statsReviewPath(game.id, game.name) }),
      onAddGame: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={['/completados?juego=hollow-knight']}>
        <Routes>
          <Route path="*" element={<><GameSheetPanel {...props} /><Donde /></>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Tus amistades');
  }

  it('enseña quién lo tiene, con reseña primero, su adelanto y dónde lo tiene; de otro juego, nada', async () => {
    await pintarConAmistades();
    const filas = within(document.querySelector('.gs-sec-amistades') as HTMLElement).getAllByRole('article');
    expect(filas.map((fila) => fila.getAttribute('aria-label'))).toEqual(['Ver el perfil de Marta', 'Ver el perfil de Nacho']);
    expect(screen.getByText('«Un mapa a mano.»')).toBeInTheDocument();
    expect(screen.getByText('En curso')).toBeInTheDocument();
    expect(screen.queryByText('«Otro juego.»')).toBeNull();
  });

  it('la cabecera dice la media con cuántas notas y cuántas lo tienen', async () => {
    await pintarConAmistades();
    expect(screen.getByText('Media de tus amistades')).toBeInTheDocument();
    expect(screen.getByText('· 1 nota')).toBeInTheDocument();
    expect(screen.getByText('Lo tienen')).toBeInTheDocument();
  });

  it('quien lo tiene en deseos va aparte, en «Lo quieren», cuando cabe', async () => {
    await pintarConAmistades();
    expect(await screen.findByText('Lo quieren')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('tu análisis va sin avatar, a diferencia de tus amistades, y tocarlo lleva a él', async () => {
    await pintarConAmistades();
    const analisis = screen.getByRole('article', { name: 'Ver análisis de Hollow Knight' });
    expect(analisis.querySelector('.hub-avatar')).toBeNull();
    expect(screen.getByRole('article', { name: 'Ver el perfil de Marta' }).querySelector('.hub-avatar')).not.toBeNull();
    fireEvent.click(analisis);
    expect(screen.getByTestId('donde')).toHaveTextContent(statsReviewPath(1, 'Hollow Knight'));
  });

  it('del índice de bibliotecas entra quien lo tiene sin haberlo reseñado, con el mes en que lo terminó', async () => {
    senales.indice = [{
      kind: 'library',
      friend: { id: 'p-lucia', name: 'Lucía' },
      tab: 'c',
      item: { ...juego(50, 'Hollow Knight', { grade: 70 }), finishedOn: '2025-09' },
    }];
    senales.faltan = 2;
    await pintarConAmistades();
    const lucia = await screen.findByRole('article', { name: 'Ver el perfil de Lucía' });
    expect(lucia).toHaveTextContent(/Completado · sept\.? 2025/);
    expect(screen.getByText('No se ha podido consultar la biblioteca de 2 amistades.')).toBeInTheDocument();
  });

  it('con el teclado, Intro sobre una amistad lleva a su perfil', async () => {
    await pintarConAmistades();
    fireEvent.keyDown(screen.getByRole('article', { name: 'Ver el perfil de Marta' }), { key: 'Enter' });
    expect(screen.getByTestId('donde')).toHaveTextContent('/social/profiles/p-marta');
  });

  it('con el teclado, Espacio sobre tu análisis lleva a él', async () => {
    await pintarConAmistades();
    fireEvent.keyDown(screen.getByRole('article', { name: 'Ver análisis de Hollow Knight' }), { key: ' ' });
    expect(screen.getByTestId('donde')).toHaveTextContent(statsReviewPath(1, 'Hollow Knight'));
  });

  it('tocar una amistad lleva a su perfil', async () => {
    await pintarConAmistades();
    fireEvent.click(screen.getByRole('article', { name: 'Ver el perfil de Marta' }));
    expect(screen.getByTestId('donde')).toHaveTextContent('/social/profiles/p-marta');
  });
});

describe('GameSheetPanel · la salida', () => {
  const props: GameSheetPanelProps = {
    open: true,
    data: biblioteca({ c: [hollow] }),
    slug: 'hollow-knight',
    onClose: vi.fn(),
    onOpenGame: vi.fn(),
    tabActions: TAB_ACTIONS,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMigrate: vi.fn(),
    reviewTarget: (_tab, game) => ({ to: statsReviewPath(game.id, game.name) }),
    onAddGame: vi.fn(),
  };

  function abrirYCerrar() {
    const { rerender } = render(<MemoryRouter><GameSheetPanel {...props} /></MemoryRouter>);
    rerender(<MemoryRouter><GameSheetPanel {...props} open={false} slug="" /></MemoryRouter>);
    return document.querySelector('dialog') as HTMLDialogElement;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('al cerrarse, el panel sigue pintado mientras sale y después se cierra el diálogo', () => {
    vi.useFakeTimers();
    // Los tests piden «reducir movimiento» por defecto (`tests/setup.ts`); aquí se quiere la animación.
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: false, media: query } as MediaQueryList));
    const dialog = abrirYCerrar();
    expect(dialog.open).toBe(true);
    expect(dialog).toHaveClass('is-saliendo');
    expect(screen.getByRole('heading', { name: 'Hollow Knight' })).toBeInTheDocument();
    // Mientras sale, Esc no vuelve a cerrar: la URL ya está cerrada y sería otro «atrás».
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(props.onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(dialog.open).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Hollow Knight' })).toBeNull();
  });

  it('con «reducir movimiento», se cierra en el acto', () => {
    const dialog = abrirYCerrar();
    expect(dialog.open).toBe(false);
  });
});

// F5: LA FICHA SE ABRE DESDE MÁS SITIOS, también para juegos que no tienes, y desde el perfil de una amistad lleva su
// bloque arriba (F0.7).
describe('GameSheetPanel · juegos que no tienes y el bloque de una amistad (F5)', () => {
  const marta = { id: 'p-marta', name: 'Marta' };

  afterEach(() => {
    senales.actuales = [];
    senales.deAmistad = null;
  });

  function Donde() {
    const { pathname, search } = useLocation();
    return <span data-testid="donde">{pathname + search}</span>;
  }

  function pintarDe(over: Partial<GameSheetPanelProps>) {
    const props: GameSheetPanelProps = {
      open: true,
      data: biblioteca(),
      slug: 'celeste',
      onClose: vi.fn(),
      onOpenGame: vi.fn(),
      tabActions: TAB_ACTIONS,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onMigrate: vi.fn(),
      reviewTarget: (_tab, game) => ({ to: statsReviewPath(game.id, game.name) }),
      onAddGame: vi.fn(),
      ...over,
    };
    render(
      <MemoryRouter initialEntries={['/social']}>
        <Routes>
          <Route path="*" element={<><GameSheetPanel {...props} /><Donde /></>} />
        </Routes>
      </MemoryRouter>,
    );
    return props;
  }

  it('un juego que no tienes se abre con lo de tus amistades, y en vez de mover o borrar, se añade', async () => {
    senales.actuales = [{ kind: 'review', friend: marta, gameName: 'Celeste', grade: 90, snippet: 'Precioso.', at: 1 }];
    const props = pintarDe({});
    await screen.findByRole('heading', { name: 'Celeste' });
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a deseados' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a próximos' }));
    expect(props.onAddGame).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'Celeste' }), 'd');
    expect(props.onAddGame).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'Celeste' }), 'p');
  });

  it('desde el perfil de una amistad, su bloque va arriba y ella no se repite en la lista de abajo', async () => {
    senales.actuales = [
      { kind: 'review', friend: marta, gameName: 'Celeste', grade: 90, snippet: 'Precioso.', at: 1 },
      { kind: 'move', friend: { id: 'p-nacho', name: 'Nacho' }, gameName: 'Celeste', tab: 'e', at: 1 },
    ];
    senales.deAmistad = {
      friend: marta,
      tab: 'c',
      item: { id: 33, _ts: 1, name: 'Celeste', platforms: ['Switch'], genres: ['Plataformas'], steamDeck: false, review: 'Precioso y difícil.', grade: 90, finishedOn: '2025-09' },
    };
    pintarDe({ friendId: 'p-marta' });
    const bloque = await screen.findByText('Marta', { selector: '.gs-sec-de-amistad strong' });
    const seccion = bloque.closest('.gs-sec-de-amistad') as HTMLElement;
    expect(seccion).toHaveTextContent('Completado');
    expect(seccion).toHaveTextContent('Switch');
    expect(seccion.querySelector('.gs-snippet')).toHaveTextContent('«Precioso y difícil.»');
    const lista = await screen.findByText('Tus amistades');
    expect((lista.closest('.gs-sec-amistades') as HTMLElement).textContent).not.toContain('Marta');
    fireEvent.click(screen.getByRole('article', { name: 'Ver la reseña de Marta de Celeste' }));
    expect(screen.getByTestId('donde')).toHaveTextContent('/social/profiles/p-marta/game/33/review');
  });

  it('una amistad de tu lista lleva a su perfil con el juego abierto', async () => {
    senales.actuales = [{ kind: 'review', friend: marta, gameName: 'Hollow Knight', grade: 90, snippet: 'x', at: 1 }];
    pintarDe({ data: biblioteca({ c: [hollow] }), slug: 'hollow-knight' });
    fireEvent.click(await screen.findByRole('article', { name: 'Ver el perfil de Marta' }));
    expect(screen.getByTestId('donde')).toHaveTextContent('/social/profiles/p-marta?juego=hollow-knight&de=p-marta');
  });
});
