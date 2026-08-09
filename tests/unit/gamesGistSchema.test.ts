import { describe, it, expect } from 'vitest';
import { assertValidGamesGist, inspectGamesGist } from '../../src/model/schemas/gamesGistSchema';
import { leanTabData } from '../../src/model/repository/socialProjection';
import { normalizeData } from '../../src/model/repository/localRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(over: Partial<GameItem> = {}): GameItem {
  return {
    id: 1,
    _ts: 1_700_000_000_000,
    name: 'Hollow Knight',
    platforms: ['PC'],
    genres: ['Metroidvania'],
    steamDeck: false,
    review: '',
    ...over,
  };
}

function tabData(over: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1_700_000_000_000, ...over };
}

describe('gamesGistSchema — escritura (falla cerrado)', () => {
  // El caso que de verdad importa: lo que produce la tubería real tiene que validar SIEMPRE. Si esto falla,
  // el esquema estaría bloqueando sincronizaciones legítimas, que es peor que no tener esquema.
  it('accepts what the real serialization pipeline produces', () => {
    const rico = game({
      score: 5, grade: 96, hours: 42.5, years: [2024, 2021], strengths: ['Ritmo'], weaknesses: [],
      reasons: [], replayable: true, retry: false, scored: true, shared: true, _v: 3,
      listedAt: 1_700_000_000_000, reviewedAt: 1_700_000_000_001, review: 'Un juego enorme.', steamDeck: true,
    });
    const lean = leanTabData(tabData({ c: [rico], deleted: [{ id: 9, _ts: 1, deletedAt: 2 }] }));
    expect(() => assertValidGamesGist(lean)).not.toThrow();
  });

  it('accepts a library where every optional field is absent', () => {
    expect(() => assertValidGamesGist(leanTabData(tabData({ c: [game()] })))).not.toThrow();
  });

  it('rejects a corrupted id: publishing it would poison every other device', () => {
    const roto = { ...tabData({ c: [game()] }), c: [{ ...game(), id: 'uno' }] };
    expect(() => assertValidGamesGist(roto)).toThrow(/schema/);
  });

  it('rejects a grade outside 0–100 and a missing merge clock', () => {
    expect(() => assertValidGamesGist({ ...tabData(), c: [{ ...game(), grade: 900 }] })).toThrow(/schema/);
    const sinReloj = { ...game() } as Partial<GameItem>;
    delete sinReloj._ts;
    expect(() => assertValidGamesGist({ ...tabData(), c: [sinReloj] })).toThrow(/schema/);
  });

  it('rejects a tombstone without its clock: the merge decides with `_ts`', () => {
    expect(() => assertValidGamesGist({ ...tabData(), deleted: [{ id: 3 }] })).toThrow(/schema/);
  });

  // La asimetría deliberada frente al gist social: allí un campo extra ABORTA (canal público, riesgo de filtrar);
  // aquí se tolera, porque fallar cerrado por un campo aditivo dejaría al usuario sin poder sincronizar.
  it('tolerates an unknown additive field instead of blocking the sync', () => {
    const conCampoNuevo = { ...tabData(), c: [{ ...game(), campoDelFuturo: 'x' }] };
    expect(() => assertValidGamesGist(conCampoNuevo)).not.toThrow();
  });
});

describe('gamesGistSchema — lectura (falla abierto)', () => {
  it('reports a clean payload as valid', () => {
    const report = inspectGamesGist(leanTabData(tabData({ c: [game()] })));
    expect(report).toEqual({ valid: true, summary: '', issueCount: 0 });
  });

  it('diagnoses a malformed remote without throwing', () => {
    const report = inspectGamesGist({ ...tabData(), c: [{ ...game(), id: null }] });
    expect(report.valid).toBe(false);
    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.summary).toContain('c.0.id');
  });

  it('never throws, not even on total garbage', () => {
    for (const basura of [null, undefined, 42, 'texto', [], {}]) {
      expect(() => inspectGamesGist(basura)).not.toThrow();
      expect(inspectGamesGist(basura).valid).toBe(false);
    }
  });

  it('caps the summary so a mass failure cannot flood the console', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({ ...game({ id: i }), _ts: 'no' }));
    const report = inspectGamesGist({ ...tabData(), c: muchos });
    expect(report.issueCount).toBe(40);
    expect(report.summary).toContain('y 35 más');
  });
});

/**
 * REGRESIÓN DE RELEASE. La validación de escritura falla cerrado, así que hay que garantizar que NUNCA se
 * dispara contra datos que solo están "sucios" y son recuperables: la ruta de recuperación de conflicto escribe
 * el merge entre lo local y lo REMOTO, y el remoto solo pasa por `migrateData`, que no coacciona tipos. Si un
 * gist con `hours: "20"` bloqueara la escritura, ese usuario se quedaría sin poder sincronizar.
 *
 * Lo que fija este test es el contrato de `writeGist`: normalizar y DESPUÉS validar.
 */
describe('gamesGistSchema — datos remotos sucios no pueden bloquear el sync', () => {
  it('normalizing first turns a dirty remote into something publishable', () => {
    const sucio = {
      c: [{ id: '7', _ts: '1700000000000', name: 42, platforms: 'PC', genres: null, hours: '20', score: '5' }],
      v: [], e: [], p: [],
      deleted: [{ id: '3' }],
      updatedAt: '1700000000000',
    } as unknown as TabData;

    // Tal cual, la validación lo rechaza (es su trabajo).
    expect(() => assertValidGamesGist(leanTabData(sucio))).toThrow(/schema/);

    // Pasado por la normalización —que es lo que hace `writeGist`— se publica sin problema.
    expect(() => assertValidGamesGist(leanTabData(normalizeData(sucio)))).not.toThrow();
  });
});
