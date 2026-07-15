import { describe, it, expect } from 'vitest';
import {
  IMPORT_TTL_MS,
  EMPTY_INBOX,
  addGamesToInbox,
  purgeStaleImports,
  removeFromInbox,
  importedToPartialGame,
} from '../../src/core/import/staging';
import type { ImportInbox, RawExternalGame } from '../../src/model/types/import';

const NOW = 1_000_000;

function raw(fields: Partial<RawExternalGame> = {}): RawExternalGame {
  return {
    externalId: 'x1',
    name: 'The Witcher 3',
    source: 'playnite',
    platforms: ['PC'],
    genres: ['RPG'],
    ...fields,
  };
}

describe('addGamesToInbox — alta en lote con dedupe y fusión', () => {
  it('añade juegos nuevos con id incremental y normaliza tags', () => {
    const { inbox, summary } = addGamesToInbox(
      EMPTY_INBOX,
      [raw({ name: 'Hades', platforms: ['  pc  '], genres: ['Roguelike', 'roguelike'] }), raw({ name: 'Celeste' })],
      new Set(),
      NOW,
    );
    expect(summary.added).toBe(2);
    expect(inbox.imported.map((g) => g.id)).toEqual([1, 2]);
    expect(inbox.imported[0].platforms).toEqual(['pc']); // trim + colapsa espacios; dedupe case-insensitive
    expect(inbox.imported[0].genres).toEqual(['Roguelike']);
    expect(inbox.updatedAt).toBe(NOW);
  });

  it('descarta entradas sin nombre (inválidas)', () => {
    const { inbox, summary } = addGamesToInbox(EMPTY_INBOX, [raw({ name: '   ' }), raw({ name: 'Ok' })], new Set(), NOW);
    expect(summary.invalid).toBe(1);
    expect(summary.added).toBe(1);
    expect(inbox.imported).toHaveLength(1);
  });

  it('re-import del mismo juego y mismo origen es idempotente (duplicado)', () => {
    const first = addGamesToInbox(EMPTY_INBOX, [raw({ externalId: 'steam-292030', source: 'playnite' })], new Set(), NOW);
    const second = addGamesToInbox(
      first.inbox,
      [raw({ externalId: 'steam-292030', source: 'playnite' })],
      new Set(),
      NOW + 1,
    );
    expect(second.summary.duplicates).toBe(1);
    expect(second.summary.added).toBe(0);
    expect(second.inbox.imported).toHaveLength(1);
  });

  it('el mismo juego desde otra plataforma se FUSIONA (acumula plataformas/orígenes/ids)', () => {
    const first = addGamesToInbox(
      EMPTY_INBOX,
      [raw({ name: 'Elden Ring', source: 'steam', externalId: '1245620', platforms: ['PC'] })],
      new Set(),
      NOW,
    );
    const second = addGamesToInbox(
      first.inbox,
      [raw({ name: 'Elden Ring', source: 'psn', externalId: 'CUSA', platforms: ['PS5'] })],
      new Set(),
      NOW + 1,
    );
    expect(second.summary.merged).toBe(1);
    expect(second.summary.added).toBe(0);
    expect(second.inbox.imported).toHaveLength(1);
    const merged = second.inbox.imported[0];
    expect(merged.platforms.sort()).toEqual(['PC', 'PS5']);
    expect(merged.sources.sort()).toEqual(['psn', 'steam']);
    expect(merged.externalIds).toEqual({ steam: '1245620', psn: 'CUSA' });
  });

  it('el match de fusión es insensible a mayúsculas/espacios', () => {
    const first = addGamesToInbox(EMPTY_INBOX, [raw({ name: 'Hollow Knight', source: 'steam' })], new Set(), NOW);
    const second = addGamesToInbox(
      first.inbox,
      [raw({ name: '  hollow knight ', source: 'gog', externalId: 'g1' })],
      new Set(),
      NOW + 1,
    );
    expect(second.summary.merged).toBe(1);
    expect(second.inbox.imported).toHaveLength(1);
  });

  it('marca existsInLists (y lo cuenta) sin omitir, si ya está en tus listas', () => {
    const existing = new Set(['the witcher 3']);
    const { inbox, summary } = addGamesToInbox(EMPTY_INBOX, [raw({ name: 'The Witcher 3' })], existing, NOW);
    expect(summary.added).toBe(1);
    expect(summary.flaggedExisting).toBe(1);
    expect(inbox.imported[0].existsInLists).toBe(true);
  });

  it('continúa la numeración de id desde el máximo existente', () => {
    const base: ImportInbox = {
      imported: [{ id: 7, name: 'Prev', platforms: [], genres: [], sources: ['playnite'], importedAt: NOW }],
      updatedAt: NOW,
    };
    const { inbox } = addGamesToInbox(base, [raw({ name: 'Nuevo' })], new Set(), NOW + 1);
    expect(inbox.imported.find((g) => g.name === 'Nuevo')?.id).toBe(8);
  });

  it('no muta la bandeja de entrada', () => {
    const before = JSON.stringify(EMPTY_INBOX);
    addGamesToInbox(EMPTY_INBOX, [raw()], new Set(), NOW);
    expect(JSON.stringify(EMPTY_INBOX)).toBe(before);
  });
});

describe('purgeStaleImports — caducidad 30 días', () => {
  const inbox: ImportInbox = {
    imported: [
      { id: 1, name: 'Viejo', platforms: [], genres: [], sources: ['playnite'], importedAt: NOW - IMPORT_TTL_MS - 1 },
      { id: 2, name: 'Reciente', platforms: [], genres: [], sources: ['playnite'], importedAt: NOW - 1000 },
    ],
    updatedAt: NOW,
  };

  it('elimina los que superan el TTL y conserva los frescos', () => {
    const { inbox: out, removed } = purgeStaleImports(inbox, NOW);
    expect(removed).toBe(1);
    expect(out.imported.map((g) => g.name)).toEqual(['Reciente']);
  });

  it('devuelve la MISMA referencia si no hay nada que purgar', () => {
    const fresh: ImportInbox = { imported: [inbox.imported[1]], updatedAt: NOW };
    const { inbox: out, removed } = purgeStaleImports(fresh, NOW);
    expect(removed).toBe(0);
    expect(out).toBe(fresh);
  });
});

describe('removeFromInbox', () => {
  const inbox: ImportInbox = {
    imported: [
      { id: 1, name: 'A', platforms: [], genres: [], sources: ['playnite'], importedAt: NOW },
      { id: 2, name: 'B', platforms: [], genres: [], sources: ['playnite'], importedAt: NOW },
    ],
    updatedAt: NOW,
  };

  it('elimina por id', () => {
    const out = removeFromInbox(inbox, 1, NOW + 1);
    expect(out.imported.map((g) => g.id)).toEqual([2]);
  });

  it('devuelve la misma referencia si el id no existe', () => {
    expect(removeFromInbox(inbox, 99, NOW + 1)).toBe(inbox);
  });
});

describe('importedToPartialGame — precarga del formulario al clasificar', () => {
  it('mapea nombre/géneros/plataformas/horas y precarga grade, sin campos de import ni año', () => {
    const partial = importedToPartialGame({
      id: 1,
      name: 'Bloodborne',
      platforms: ['PS4'],
      genres: ['Action RPG'],
      sources: ['psn'],
      externalIds: { psn: 'CUSA00207' },
      coverUrl: 'https://images.igdb.com/x.jpg',
      hours: 42,
      grade: 90,
      importedAt: NOW,
    });
    expect(partial).toEqual({
      name: 'Bloodborne',
      genres: ['Action RPG'],
      platforms: ['PS4'],
      hours: 42,
      grade: 90,
    });
    // No arrastra IDs externos ni carátula al juego que irá al gist; el año (jugado) lo pone el usuario.
    expect('externalIds' in partial).toBe(false);
    expect('coverUrl' in partial).toBe(false);
    expect('years' in partial).toBe(false);
  });

  it('sin grade → no precarga nota', () => {
    const partial = importedToPartialGame({
      id: 1,
      name: 'X',
      platforms: [],
      genres: [],
      sources: ['playnite'],
      importedAt: NOW,
    });
    expect('grade' in partial).toBe(false);
  });
});

describe('extras (suggestedTab / grade)', () => {
  it('se transportan al crear una entrada nueva', () => {
    const { inbox } = addGamesToInbox(EMPTY_INBOX, [raw({ suggestedTab: 'c', grade: 85 })], new Set(), NOW);
    expect(inbox.imported[0].suggestedTab).toBe('c');
    expect(inbox.imported[0].grade).toBe(85);
  });

  it('en fusión se rellenan si faltaban y se conservan si ya estaban', () => {
    const first = addGamesToInbox(EMPTY_INBOX, [raw({ name: 'Doom', source: 'steam' })], new Set(), NOW);
    const second = addGamesToInbox(
      first.inbox,
      [raw({ name: 'Doom', source: 'gog', externalId: 'g', suggestedTab: 'e', grade: 70 })],
      new Set(),
      NOW + 1,
    );
    expect(second.inbox.imported[0].suggestedTab).toBe('e'); // faltaba → se rellena
    expect(second.inbox.imported[0].grade).toBe(70);
  });
});
