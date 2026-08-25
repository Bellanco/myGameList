import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * El CABLEADO de `handleSaveDraft` en `App`, guardando de verdad desde el formulario.
 *
 * Por qué hace falta un test de componente y no basta con los unitarios: la decisión (`decideReviewPublication`) y
 * el efecto (`applyReviewPublication`) ya están cubiertos por separado, pero lo que los une —qué id se pasa, que
 * un guardado bloqueado por validación no encadene nada, y que el destello marque la fila guardada— solo existe
 * dentro del componente. Y medida la cobertura V8 real de los e2e sobre `App.tsx`, el recorrido interactivo
 * completo aportaba DOS sentencias sobre el simple arranque: los manejadores no se ejecutaban en ninguna suite.
 *
 * Un solo `vi.mock` (la pasarela de Firebase) basta para montar `App` entero, así que esto no es un andamio
 * frágil: no se simula nada del camino que se está comprobando.
 */

const publishReviewActivity = vi.fn(async (_input: unknown) => {});
const unpublishReviewActivity = vi.fn(async (_input: unknown) => {});

vi.mock('../../src/model/repository/socialPublishRepository', () => ({
  publishReviewActivity,
  unpublishReviewActivity,
}));

/** Bandeja sembrada en memoria: aísla la graduación de la persistencia (IndexedDB), que no es lo que se prueba. */
const IMPORTADO = {
  id: 501,
  name: 'Tunic',
  platforms: ['PC'],
  genres: ['Puzzles'],
  sources: ['steam'] as const,
  hours: 12,
  suggestedTab: 'e' as const,
  grade: null,
  // Reciente a propósito: la bandeja caduca los importados a los 30 días, y un sello de 1970 los
  // descarta al cargar (el síntoma es una bandeja vacía sin más pista).
  importedAt: Date.now(),
};
let bandeja: { imported: unknown[] } = { imported: [] };
const saveImportInbox = vi.fn(async (siguiente: { imported: unknown[] }) => { bandeja = siguiente; });

vi.mock('../../src/model/repository/import/inboxRepository', () => ({
  loadImportInbox: vi.fn(async () => bandeja),
  saveImportInbox: (siguiente: { imported: unknown[] }) => saveImportInbox(siguiente),
}));

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  initializeFirebaseServices: vi.fn(async () => null),
  reportHandledError: vi.fn(async () => {}),
  trackAnalyticsEvent: vi.fn(async () => {}),
  getCurrentSocialAuthUser: vi.fn(async () => null),
  setAnalyticsUser: vi.fn(async () => {}),
  clearAnalyticsUser: vi.fn(async () => {}),
  getPrivateConfig: vi.fn(async () => null),
  setPrivateConfig: vi.fn(async () => {}),
  recoverGithubToken: vi.fn(async () => null),
  resolveOwnProfile: vi.fn(async () => null),
  resolveStableProfileId: vi.fn(async () => 'pid'),
  signInWithGoogle: vi.fn(async () => null),
  subscribeSocialAuth: vi.fn(() => () => {}),
  signOutSocialUser: vi.fn(async () => {}),
  getPublicConfig: vi.fn(async () => null),
  setPublicConfig: vi.fn(async () => {}),
}));

import App from '../../src/App';
import { STORAGE_KEY } from '../../src/core/constants/storageKeys';

const JUEGO = {
  id: 7,
  _ts: 1,
  name: 'Hollow Knight',
  genres: ['Metroidvania'],
  platforms: ['PC'],
  steamDeck: false,
  score: 5,
  grade: 96,
  years: [2024],
  strengths: [],
  weaknesses: [],
  reasons: [],
  replayable: false,
  retry: false,
  hours: 20,
  review: 'Reseña original.',
  listedAt: 1,
};

function sembrar() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ c: [JUEGO], v: [], e: [], p: [], deleted: [], updatedAt: 1, schemaVersion: 1 }),
  );
  localStorage.setItem('mis-listas-analytics-consent', 'denied');
}

/** Abre el formulario de edición del juego sembrado. */
async function abrirEdicion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: new RegExp(JUEGO.name) }));
  await user.click(await screen.findByRole('button', { name: `Editar - ${JUEGO.name}` }));
  return screen.findByLabelText('Análisis');
}

beforeEach(() => {
  localStorage.clear();
  publishReviewActivity.mockClear();
  unpublishReviewActivity.mockClear();
  saveImportInbox.mockClear();
  bandeja = { imported: [] };
  sembrar();
});

describe('App · guardar un juego y el canal social', () => {
  it('cambiar el texto de la reseña publica sobre el ID DEL JUEGO GUARDADO', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/completados']}><App /></MemoryRouter>);

    const resena = await abrirEdicion(user);
    await user.clear(resena);
    await user.type(resena, 'Reseña reescrita.');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(publishReviewActivity).toHaveBeenCalledOnce());
    // El id es lo que se predecía mal antes: tiene que ser el del juego editado, no un correlativo.
    expect(publishReviewActivity.mock.calls[0][0]).toMatchObject({
      id: JUEGO.id,
      name: JUEGO.name,
      review: 'Reseña reescrita.',
      reviewChanged: true,
    });
    expect(unpublishReviewActivity).not.toHaveBeenCalled();
  });

  it('vaciar la reseña la RETIRA del canal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/completados']}><App /></MemoryRouter>);

    const resena = await abrirEdicion(user);
    await user.clear(resena);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(unpublishReviewActivity).toHaveBeenCalledExactlyOnceWith({ id: JUEGO.id }));
    expect(publishReviewActivity).not.toHaveBeenCalled();
  });

  it('guardar sin tocar nada no escribe en el canal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/completados']}><App /></MemoryRouter>);

    await abrirEdicion(user);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Se espera a que el guardado haya cerrado el formulario antes de afirmar la ausencia de llamadas.
    await waitFor(() => expect(screen.queryByLabelText('Análisis')).toBeNull());
    expect(publishReviewActivity).not.toHaveBeenCalled();
    expect(unpublishReviewActivity).not.toHaveBeenCalled();
  });

  /**
   * La rama de salida temprana: si una validación corta el guardado, `handleSaveDraft` no debe encadenar NADA
   * —ni retirar el importado de la bandeja, ni destellar, ni tocar el canal—. Se provoca vaciando el nombre, que
   * es obligatorio.
   */
  it('un guardado bloqueado por validación no toca el canal social', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/completados']}><App /></MemoryRouter>);

    await abrirEdicion(user);
    const nombre = screen.getByLabelText('Nombre *');
    await user.clear(nombre);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // El formulario sigue abierto (el guardado no se ha hecho) y no se ha publicado nada.
    expect(await screen.findByLabelText('Análisis')).toBeTruthy();
    expect(publishReviewActivity).not.toHaveBeenCalled();
    expect(unpublishReviewActivity).not.toHaveBeenCalled();
  });
});

/**
 * La rama de la GRADUACIÓN: cuando el guardado viene de clasificar un importado, la fila tiene que salir de la
 * bandeja. Es la única parte de `handleSaveDraft` que no se puede comprobar sin montar el componente, porque el
 * enlace entre "he clasificado esto" y "guárdalo" es una `ref` que sobrevive entre dos manejadores distintos.
 */
describe('App · clasificar un importado', () => {
  it('al guardarlo, el juego sale de la bandeja', async () => {
    bandeja = { imported: [IMPORTADO] };
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/bandeja']}><App /></MemoryRouter>);

    // La fila del importado aparece con sus botones de destino.
    expect(await screen.findByText(IMPORTADO.name)).toBeTruthy();
    // «En curso» y no «Completados»: esa lista exige año y el formulario cortaría el guardado por validación.
    await user.click(await screen.findByRole('button', { name: /En curso/ }));

    // El formulario se abre precargado con el importado.
    const nombre = await screen.findByLabelText('Nombre *');
    expect((nombre as HTMLInputElement).value).toBe(IMPORTADO.name);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // La bandeja se reescribe SIN el importado graduado.
    await waitFor(() => expect(saveImportInbox).toHaveBeenCalled());
    const ultima = saveImportInbox.mock.calls.at(-1)?.[0] as { imported: { id: number }[] };
    expect(ultima.imported.map((g) => g.id)).not.toContain(IMPORTADO.id);
  });
});
