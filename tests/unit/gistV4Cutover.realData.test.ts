import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGist, writeGist } from '../../src/model/repository/gistRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * Cutover de FORMATO v4 sobre los DATOS REALES del usuario (`myGames.json` en la raíz del repo).
 *
 * Reproduce, sin red ni navegador, exactamente lo que ocurrirá al desplegar con
 * `ENABLE_GAMES_WRAPPER_WRITE = true`:
 *   1. Un gist legacy (plano `c/v/e/p`) se lee → la app lo detecta como "necesita upgrade".
 *   2. La app reescribe el gist en formato v4 (anchor GamesMainFile + diccionarios).
 *   3. Una segunda lectura reconstruye el TabData SIN PÉRDIDA (round-trip exacto).
 *   4. El gist v4 ya NO pide re-upgrade (idempotente) y el ciclo v4→v4 es estable.
 *
 * `myGames.json` está SIN COMMITEAR (datos reales). `import.meta.glob` lo resuelve en tiempo de
 * transform: si no existe (CI) devuelve `{}` → el bloque se salta; en la máquina del usuario corre
 * contra sus juegos reales. No usa built-ins de Node (sin @types/node).
 */
const realDataModules = import.meta.glob('/myGames.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const RAW_REAL_DATA: string | null = realDataModules['/myGames.json'] ?? null;
const HAS_REAL_DATA = RAW_REAL_DATA !== null;

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'abc12345';
const GIST_FILENAME = 'myGames.json';

/** Gist en memoria: PATCH fusiona ficheros (null borra), GET devuelve el estado actual. */
function stubGistStore(initialFiles: Record<string, { content: string }> = {}) {
  const store: Record<string, { content: string }> = { ...initialFiles };
  const patchBodies: Array<{ files: Record<string, { content: string } | null> }> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = { etag: 'W/"etag-1"' };
    if (method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
      patchBodies.push(body);
      for (const [name, file] of Object.entries(body.files)) {
        if (file === null) delete store[name];
        else store[name] = file;
      }
      return new Response(JSON.stringify({ updated_at: '2026-06-21T12:00:00Z' }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { store, patchBodies };
}

const TABS = ['c', 'v', 'e', 'p'] as const;

/** Normaliza un juego a su contenido semántico, aplicando los MISMOS defaults a ambos lados
 *  de la comparación: así un round-trip que pierda un género/plataforma/nota se detecta,
 *  pero las diferencias de mera representación (campo omitido vs vacío) no dan falso positivo. */
function canon(g: GameItem) {
  return {
    id: g.id,
    name: g.name,
    genres: [...(g.genres ?? [])].sort(),
    platforms: [...(g.platforms ?? [])].sort(),
    strengths: [...(g.strengths ?? [])].sort(),
    weaknesses: [...(g.weaknesses ?? [])].sort(),
    reasons: [...(g.reasons ?? [])].sort(),
    years: [...(g.years ?? [])].sort(),
    steamDeck: !!g.steamDeck,
    replayable: !!g.replayable,
    retry: !!g.retry,
    review: g.review ?? '',
    score: g.score ?? undefined,
    hours: g.hours ?? undefined,
  };
}

function canonTab(arr: GameItem[]) {
  return [...arr].sort((a, b) => a.id - b.id).map(canon);
}

function totalGames(d: TabData): number {
  return TABS.reduce((n, k) => n + d[k].length, 0);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.skipIf(!HAS_REAL_DATA)('Cutover v4 sobre datos reales (myGames.json de la raíz)', () => {
  // Sin datos reales (CI) RAW_REAL_DATA es null y el bloque está saltado; el `{}` evita parsear null.
  const flat = (HAS_REAL_DATA ? JSON.parse(RAW_REAL_DATA as string) : {}) as TabData;

  it('parte de un gist legacy plano (sin schemaVersion v4)', () => {
    expect((flat as unknown as Record<string, unknown>).schemaVersion).not.toBe(4);
    expect(totalGames(flat)).toBeGreaterThan(0);
  });

  it('lee legacy → reescribe v4 → relee SIN PÉRDIDA (round-trip exacto de los N juegos)', async () => {
    const { patchBodies } = stubGistStore({ [GIST_FILENAME]: { content: JSON.stringify(flat) } });

    // 1. Lectura del gist legacy: la app lo marca para upgrade (flag v4 activo).
    const read1 = await readGist(TOKEN, GIST_ID);
    const data1 = read1.data as TabData;
    expect(read1.wasLegacy).toBe(true);
    const n = totalGames(data1);
    expect(n).toBe(totalGames(flat));

    // 2. La app reescribe en v4.
    await writeGist(TOKEN, GIST_ID, data1);
    const anchor = JSON.parse(
      (patchBodies[patchBodies.length - 1].files[GIST_FILENAME] as { content: string }).content,
    ) as Record<string, unknown>;
    expect(anchor.schemaVersion).toBe(4);
    expect(anchor.fileType).toBe('games-main');

    // 3. Relectura del v4: mismo recuento y mismo contenido juego a juego.
    const read2 = await readGist(TOKEN, GIST_ID);
    const data2 = read2.data as TabData;
    expect(totalGames(data2)).toBe(n);
    for (const k of TABS) {
      expect(canonTab(data2[k]), `tab ${k} cambió en el round-trip`).toEqual(canonTab(data1[k]));
    }
    expect(data2.deleted.map((d) => d.id).sort()).toEqual(data1.deleted.map((d) => d.id).sort());
  });

  it('el gist v4 NO pide re-upgrade y reescribir el mismo estado es estable en datos (idempotente)', async () => {
    const { patchBodies } = stubGistStore({ [GIST_FILENAME]: { content: JSON.stringify(flat) } });

    const read1 = await readGist(TOKEN, GIST_ID);
    await writeGist(TOKEN, GIST_ID, read1.data as TabData);

    // Ya en v4: la siguiente lectura no debe marcar wasLegacy (no hay rewrite espurio en cada sync).
    const read2 = await readGist(TOKEN, GIST_ID);
    expect(read2.wasLegacy).toBe(false);

    // El checksum de integridad es función pura de los datos: dos escrituras del mismo estado v4
    // comparten checksum aunque los timestamps de generación difieran. (La decisión de "no PATCHear
    // en un sync sin cambios" vive en la máquina de sync, una capa por encima de writeGist.)
    const checksumOf = () => {
      const anchor = JSON.parse(
        (patchBodies[patchBodies.length - 1].files[GIST_FILENAME] as { content: string }).content,
      ) as { integrity?: { checksum?: string } };
      return anchor.integrity?.checksum;
    };

    // Baseline = primera escritura YA derivada de v4 (la escritura del cutover legacy→v4 puede
    // serializar el diccionario en otro orden; lo que debe ser estable es el ciclo v4→v4).
    await writeGist(TOKEN, GIST_ID, read2.data as TabData);
    const checksumA = checksumOf();
    expect(checksumA).toBeTruthy();

    const read3 = await readGist(TOKEN, GIST_ID);
    await writeGist(TOKEN, GIST_ID, read3.data as TabData);
    expect(checksumOf(), 'el ciclo v4→v4 deriva (checksum inestable)').toBe(checksumA);

    // Y el dato decodificado tras esa reescritura sigue intacto (sin deriva acumulativa).
    const d2 = read2.data as TabData;
    const d3 = read3.data as TabData;
    for (const k of TABS) {
      expect(canonTab(d3[k]), `tab ${k} derivó al reescribir`).toEqual(canonTab(d2[k]));
    }
  });
});
