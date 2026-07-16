import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useImportInbox } from '../../src/viewmodel/useImportInbox';
import { loadImportInbox, saveImportInbox } from '../../src/model/repository/import/inboxRepository';
import type { RawExternalGame } from '../../src/model/types/import';

function raw(name: string, over: Partial<RawExternalGame> = {}): RawExternalGame {
  return { externalId: name, name, source: 'playnite', platforms: ['PC'], genres: ['RPG'], ...over };
}

// El store IndexedDB es un singleton de módulo; reseteamos el único registro a vacío entre tests.
beforeEach(async () => {
  await saveImportInbox({ imported: [], updatedAt: 0 });
});

describe('useImportInbox', () => {
  it('carga vacía y termina el loading', async () => {
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(0);
    expect(result.current.imported).toEqual([]);
  });

  it('addGames añade, actualiza el contador y devuelve el resumen', async () => {
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let summary: ReturnType<typeof result.current.addGames> | undefined;
    act(() => {
      summary = result.current.addGames([raw('Hades'), raw('Celeste')], new Set());
    });

    expect(summary?.added).toBe(2);
    expect(result.current.count).toBe(2);
  });

  it('persiste en IndexedDB (round-trip)', async () => {
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addGames([raw('Hollow Knight')], new Set());
    });

    await waitFor(async () => {
      const persisted = await loadImportInbox();
      expect(persisted.imported).toHaveLength(1);
      expect(persisted.imported[0].name).toBe('Hollow Knight');
    });
  });

  it('carga lo previamente persistido (marca existsInLists incluida)', async () => {
    await saveImportInbox({
      imported: [
        { id: 1, name: 'Prev', platforms: ['Steam'], genres: ['RPG'], sources: ['playnite'], importedAt: Date.now() },
      ],
      updatedAt: Date.now(),
    });
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(1);
    expect(result.current.imported[0].name).toBe('Prev');
  });

  it('removeItem elimina por id', async () => {
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.addGames([raw('A'), raw('B')], new Set());
    });
    const id = result.current.imported[0].id;
    act(() => {
      result.current.removeItem(id);
    });
    expect(result.current.count).toBe(1);
    expect(result.current.imported.find((g) => g.id === id)).toBeUndefined();
  });

  it('clear vacía la bandeja', async () => {
    const { result } = renderHook(() => useImportInbox());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.addGames([raw('A'), raw('B')], new Set());
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });
});
