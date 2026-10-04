import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// PREMIOS CON FIRESTORE SIN ATENDER (docs/plan-degradacion-servicios.md, fase 5). La pantalla decía «No se han
// podido cargar los premios» aunque se hubiera abierto mil veces: ahora enseña la última edición leída bien.

const fetchVotingConfig = vi.hoisted(() => vi.fn());
const loadAndSortCategories = vi.hoisted(() => vi.fn());
const fetchUserBallot = vi.hoisted(() => vi.fn());

vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({ fetchVotingConfig }));
vi.mock('../../src/model/repository/premios/premiosCategoriesRepository', () => ({ loadAndSortCategories }));
vi.mock('../../src/model/repository/premios/premiosBallotRepository', () => ({ fetchUserBallot }));

const { usePremiosEdition } = await import('../../src/viewmodel/premios/usePremiosEdition');

const CONFIG = { season: 2026, seasonName: 'Premios 2026', isOpen: true };
const CATEGORIAS = [{ id: 'cat1', title: 'Juego del año', options: [] }];
const PAPELETA = { selections: { cat1: 'cat1_option_0' }, editCount: 0 };
const SIN_CUOTA = Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' });

function bien() {
  fetchVotingConfig.mockResolvedValue(CONFIG);
  loadAndSortCategories.mockResolvedValue(CATEGORIAS);
  fetchUserBallot.mockResolvedValue(PAPELETA);
}

function sinCuota() {
  fetchVotingConfig.mockRejectedValue(SIN_CUOTA);
  loadAndSortCategories.mockRejectedValue(SIN_CUOTA);
  fetchUserBallot.mockRejectedValue(SIN_CUOTA);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('usePremiosEdition con Firestore sin atender', () => {
  it('enseña la última edición leída bien, con la papeleta propia', async () => {
    bien();
    const primera = renderHook(() => usePremiosEdition('u1', null));
    await waitFor(() => expect(primera.result.current.loading).toBe(false));
    primera.unmount();

    sinCuota();
    const { result } = renderHook(() => usePremiosEdition('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.failed).toBe(false);
    expect(result.current.config).toEqual(CONFIG);
    expect(result.current.categories).toEqual(CATEGORIAS);
    expect(result.current.ballot).toEqual(PAPELETA);
  });

  it('sin copia, sigue diciendo que no se ha podido cargar', async () => {
    sinCuota();
    const { result } = renderHook(() => usePremiosEdition('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.failed).toBe(true);
  });

  it('la papeleta de la copia es de cada cuenta', async () => {
    bien();
    const primera = renderHook(() => usePremiosEdition('u1', null));
    await waitFor(() => expect(primera.result.current.loading).toBe(false));
    primera.unmount();

    sinCuota();
    const { result } = renderHook(() => usePremiosEdition('u2', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.ballot).toBeNull();
  });

  it('pide las lecturas distinguiendo el fallo del vacío', async () => {
    bien();
    const { result } = renderHook(() => usePremiosEdition('u1', null));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchVotingConfig).toHaveBeenCalledWith({ throwOnError: true });
    expect(fetchUserBallot).toHaveBeenCalledWith('u1', { throwOnError: true });
  });
});
