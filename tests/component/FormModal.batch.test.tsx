import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormModal } from '../../src/view/modals/FormModal';
import { persistScoreScale, resetScoreScale } from '../../src/model/repository/scorePreferenceRepository';
import type { GameItem, TabId } from '../../src/model/types/game';
import type { GameDraft, SaveDraftOptions } from '../../src/viewmodel/useGameListViewModel';

function makeDraft(over: Partial<GameDraft> = {}): GameDraft {
  return {
    name: '', genres: [], platforms: [], steamDeck: false, score: 0, years: [], strengths: [], weaknesses: [],
    reasons: [], replayable: false, retry: false, hours: null, scored: false, review: '', ...over,
  };
}
const NO_LOOKUPS = { genres: [], platforms: [], strengths: [], weaknesses: [] };
const YEAR = new Date().getFullYear();

function game(over: Partial<GameItem>): GameItem {
  return { id: 1, _ts: 1, name: 'x', platforms: [], genres: [], steamDeck: false, review: '', ...over };
}
const LIBRARY_GAMES = [
  game({ id: 1, genres: ['RPG'], platforms: ['Steam'], strengths: ['Historia'], weaknesses: ['Ritmo'] }),
  game({ id: 2, genres: ['RPG'], platforms: ['Steam'], strengths: ['Historia', 'Personajes'] }),
  game({ id: 3, genres: ['Shooter'], platforms: ['PC'], strengths: ['Disparos'] }),
];
const LIBRARY = { c: LIBRARY_GAMES, v: [], e: [], p: [], d: [] };

type OnSave = (draft: GameDraft, options?: SaveDraftOptions) => boolean | void;

function renderForm(over: { draft?: GameDraft; tab?: TabId; onSave?: Mock<OnSave> } = {}) {
  const onSave = over.onSave ?? vi.fn<OnSave>(() => true);
  const utils = render(
    <FormModal
      open
      draft={over.draft ?? makeDraft()}
      currentTab={over.tab ?? 'c'}
      lookups={NO_LOOKUPS}
      library={LIBRARY}
      findDuplicate={() => null}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return { onSave, ...utils };
}

/** Rellena lo obligatorio de un completado con los atajos de un toque. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('Nombre'), name);
  await user.click(screen.getByRole('button', { name: 'Añadir Steam' }));
  await user.click(screen.getByRole('button', { name: 'Añadir RPG' }));
  await user.click(screen.getByRole('button', { name: `Añadir ${YEAR}` }));
}

afterEach(() => {
  // Corre ANTES del `cleanup()` de tests/setup.ts (los `afterEach` van en pila): el formulario sigue montado y
  // escucha la escala, así que volver a estrellas lo repinta y tiene que ir dentro de `act`.
  act(() => resetScoreScale());
  vi.restoreAllMocks();
});

describe('FormModal — la nota, obligatoria y por defecto', () => {
  it('un alta sin nota nace en 3 estrellas y guarda sin pedirla', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await fillRequired(user, 'Celeste');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ score: 3, grade: 60 });
  });

  it('con la escala 0–100, nace en 50 y se elige en una barra', async () => {
    persistScoreScale('test', 'grade').catch(() => undefined);
    const user = userEvent.setup();
    const { onSave } = renderForm();
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('50');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '82' } });
    await fillRequired(user, 'Celeste');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ grade: 82 });
  });

  it('la vergüenza se puntúa siempre: ya no hay «Puntuar este juego» y se guarda puntuada', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm({ tab: 'v', draft: makeDraft({ id: 4, name: 'Dark Souls', genres: ['RPG'], platforms: ['PC'] }) });
    expect(screen.queryByRole('button', { name: /Puntuar este juego/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ scored: true, score: 3 });
  });
});

describe('FormModal — añadir otro', () => {
  it('al abrir para añadir, el foco está en el nombre', () => {
    renderForm();
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  });

  it('guarda con keepOpen, cuenta la tanda y avisa de lo que se conserva', async () => {
    const user = userEvent.setup();
    const { onSave } = renderForm();
    await fillRequired(user, 'Celeste');
    await user.click(screen.getByRole('button', { name: 'Añadir otro' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Celeste' }), { keepOpen: true });
    expect(screen.getByText('1 añadido')).toBeTruthy();
    expect(screen.getByText('«Celeste» guardado. Se mantienen plataformas y año.')).toBeTruthy();
  });

  it('si el ViewModel no guarda, no cuenta nada', async () => {
    const user = userEvent.setup();
    renderForm({ onSave: vi.fn<OnSave>(() => false) });
    await fillRequired(user, 'Celeste');
    await user.click(screen.getByRole('button', { name: 'Añadir otro' }));
    expect(screen.queryByText('1 añadido')).toBeNull();
  });

  it('al editar no se ofrece: solo Guardar', () => {
    renderForm({ draft: makeDraft({ id: 9, name: 'Hades', genres: ['RPG'], platforms: ['PC'], years: [YEAR], score: 4 }) });
    expect(screen.queryByRole('button', { name: 'Añadir otro' })).toBeNull();
  });

  it('⌘↵ en un alta es «Guardar y añadir otro»; al editar, «Guardar»', async () => {
    const user = userEvent.setup();
    const { onSave, unmount } = renderForm();
    await fillRequired(user, 'Celeste');
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenLastCalledWith(expect.anything(), { keepOpen: true });
    unmount();

    const editSave = vi.fn<OnSave>(() => true);
    renderForm({ onSave: editSave, draft: makeDraft({ id: 9, name: 'Hades', genres: ['RPG'], platforms: ['PC'], years: [YEAR], score: 4 }) });
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    expect(editSave).toHaveBeenCalledTimes(1);
    expect(editSave.mock.calls[0]).toHaveLength(1);
  });
});

describe('FormModal — sugerencias de un toque', () => {
  it('los años sugeridos son siempre el actual y el anterior (también en 2028)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2028-03-15T12:00:00'));
    try {
      renderForm();
      expect(screen.getByRole('button', { name: 'Añadir 2028' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Añadir 2027' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Añadir 2026' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tocar una sugerencia la pone en el campo y deja de ofrecerla', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Añadir Steam' }));
    expect(screen.getByText('Steam')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Añadir Steam' })).toBeNull();
  });

  it('los puntos fuertes se sugieren según el género elegido', async () => {
    const user = userEvent.setup();
    renderForm();
    const strengths = () => screen.getByRole('group', { name: 'Puntos fuertes sugeridos' });
    // Sin género: lo más usado (Historia sale dos veces).
    expect(strengths().querySelector('.quick-pick')?.textContent).toContain('Historia');
    await user.click(screen.getByRole('button', { name: 'Añadir Shooter' }));
    expect(strengths().querySelector('.quick-pick')?.textContent).toContain('Disparos');
  });
});

describe('FormModal — las sugerencias filtran lo escrito', () => {
  const platforms = () => screen.getByLabelText('Plataformas');

  it('cada campo de etiquetas explica debajo cómo se añade', () => {
    renderForm();
    for (const label of ['Plataformas', 'Géneros', 'Años completado']) {
      expect(screen.getByLabelText(label).getAttribute('aria-describedby')).toBeTruthy();
    }
    expect(screen.getAllByText('Pulsa Enter o separa con comas').length).toBeGreaterThanOrEqual(3);
  });

  it('al escribir solo quedan las que casan, más encendidas cuanto más cerca', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(platforms(), 'st');
    expect(screen.getByRole('group', { name: 'Coincidencias con lo escrito' })).toBeTruthy();
    const steam = screen.getByRole('button', { name: 'Añadir Steam' });
    expect(screen.queryByRole('button', { name: 'Añadir PC' })).toBeNull();
    const before = Number(steam.style.getPropertyValue('--pick-glow'));
    await user.type(platforms(), 'eam');
    expect(Number(screen.getByRole('button', { name: 'Añadir Steam' }).style.getPropertyValue('--pick-glow'))).toBeGreaterThan(before);
  });

  it('si solo queda una, se enciende casi del todo aunque falte nombre por escribir', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(platforms(), 's');
    expect(Number(screen.getByRole('button', { name: 'Añadir Steam' }).style.getPropertyValue('--pick-glow'))).toBeGreaterThan(0.85);
  });

  it('tocar una filtrada la añade, vacía el campo y devuelve el foco para seguir', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(platforms(), 'ste');
    await user.click(screen.getByRole('button', { name: 'Añadir Steam' }));
    expect(screen.getByText('Steam')).toBeTruthy();
    expect((platforms() as HTMLInputElement).value).toBe('');
    // Sin filtro, vuelve la fila de siempre (sin lo ya puesto).
    expect(screen.getByRole('group', { name: 'Tus plataformas más usadas' })).toBeTruthy();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(platforms());
  });

  it('si no casa ninguna, la fila desaparece y la coma la añade como nueva', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(platforms(), 'Game Boy');
    expect(screen.queryByRole('group', { name: 'Coincidencias con lo escrito' })).toBeNull();
    await user.type(platforms(), ',');
    expect(screen.getByText('Game Boy')).toBeTruthy();
    expect((platforms() as HTMLInputElement).value).toBe('');
  });
});

describe('FormModal — interruptores del pie', () => {
  it('solo con icono, con su nombre para el lector y su estado en aria-pressed', async () => {
    const user = userEvent.setup();
    renderForm();
    const deck = screen.getByRole('button', { name: 'Steam Deck' });
    expect(deck.textContent).toBe('');
    expect(deck.getAttribute('aria-pressed')).toBe('false');
    await user.click(deck);
    expect(deck.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rejugar' }).getAttribute('aria-pressed')).toBe('false');
  });
});
