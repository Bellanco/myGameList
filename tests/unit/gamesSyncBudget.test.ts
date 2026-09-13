// El sello del formato vive en IndexedDB (`LocalMeta`), así que sin esto la mitad de lo que se mide aquí se
// degradaría en silencio a «no hay sello» y el test pasaría por el motivo equivocado.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENABLE_GAMES_WRAPPER_WRITE, readGist, writeGist } from '../../src/model/repository/gistRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * PRESUPUESTO DE PETICIONES DEL CANAL DE JUEGOS.
 *
 * Hermano del de `socialHubBudget`: lo que se vigila aquí no es que algo funcione, sino cuánto CUESTA. El token
 * tiene 5.000 peticiones por hora y las comparte con el hub social, así que una petición de más en el camino que
 * corre en cada edición no se nota en ninguna pantalla y se lleva el margen por delante.
 *
 * Lo que se fija: subir una edición son DOS peticiones (la lectura del ciclo y el PATCH). Eran tres, porque la
 * escritura volvía a pedir un gist que el ciclo acababa de leer.
 */

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'abc12345';

function makeGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 1,
    _ts: 1000,
    name: 'Test',
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: true,
    review: 'una reseña',
    score: 4,
    years: [2025],
    hours: 12,
    retry: false,
    replayable: false,
    ...overrides,
  };
}

/** Texto poco compresible y determinista, para que el troceado por tamaño ocurra de verdad. */
function noisyText(seed: number, len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,';
  let s = (seed * 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < len; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out += alphabet[(s >>> 9) % alphabet.length];
  }
  return out;
}

/** Gist en memoria que además CUENTA las peticiones por método. */
function stubGistStore(initialFiles: Record<string, { content: string }> = {}) {
  const store: Record<string, { content: string }> = { ...initialFiles };
  const calls: string[] = [];
  const patchBodies: Array<{ files: Record<string, { content: string } | null> }> = [];

  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    calls.push(method);
    const headers = { etag: 'W/"etag-1"' };
    // Un GET condicional cuyo etag coincide responde 304 SIN cuerpo, igual que GitHub.
    const ifNoneMatch = (init.headers as Record<string, string> | undefined)?.['If-None-Match'];
    if (method === 'GET' && ifNoneMatch === 'W/"etag-1"') {
      return new Response(null, { status: 304, headers });
    }
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
  return { store, calls, patchBodies };
}

function bibliotecaTroceada(): TabData {
  return {
    c: Array.from({ length: 12 }, (_, i) => makeGame({ id: i + 1, name: `Juego ${i + 1}`, review: noisyText(i + 1, 90_000) })),
    v: [],
    e: [],
    p: [],
    deleted: [],
    updatedAt: 1_000,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('presupuesto de peticiones al subir una edición', () => {
  it('subir tras leer cuesta DOS peticiones: la lectura y el PATCH', async () => {
    const inicial = stubGistStore();
    await writeGist(TOKEN, GIST_ID, { ...bibliotecaTroceada(), updatedAt: 1 }); // deja un gist ya escrito

    // A partir de aquí se cuenta: esta es la secuencia de un empujón de cambios pendientes.
    const { calls } = stubGistStore({ ...inicial.store });
    const leido = await readGist(TOKEN, GIST_ID);
    await writeGist(TOKEN, GIST_ID, bibliotecaTroceada(), { knownRemoteFiles: leido.remoteFiles });

    expect(calls).toEqual(['GET', 'PATCH']);
  });

  it('sin el cuerpo de la lectura sigue pidiéndolo por su cuenta (tres peticiones)', async () => {
    const { calls } = stubGistStore();
    await readGist(TOKEN, GIST_ID).catch(() => null);
    await writeGist(TOKEN, GIST_ID, bibliotecaTroceada());

    // Es el camino de quien no tiene una lectura fresca detrás (conectar, sobrescribir): sigue siendo correcto.
    expect(calls.filter((m) => m === 'GET').length).toBeGreaterThanOrEqual(2);
  });
});

describe('presupuesto de peticiones al abrir la app', () => {
  it('una sesión nueva se fía del 304 si el formato ya se comprobó en otra', async () => {
    // Sesión 1: se deja un gist escrito en el formato de destino. La escritura sella el veredicto.
    const inicial = stubGistStore();
    await writeGist(TOKEN, GIST_ID, bibliotecaTroceada());

    // Sesión 2: el módulo se recarga (el recuerdo en memoria se pierde, como al recargar la página) pero el
    // sello sobrevive en IndexedDB. Antes, este 304 disparaba una descarga completa del gist para comprobar un
    // formato que ya se había comprobado; y otra en la sesión siguiente, y en la siguiente.
    vi.resetModules();
    const { readGist: readGistNuevaSesion } = await import('../../src/model/repository/gistRepository');

    const { calls } = stubGistStore({ ...inicial.store });
    const resultado = await readGistNuevaSesion(TOKEN, GIST_ID, 'W/"etag-1"');

    expect(resultado.notModified).toBe(true);
    expect(calls).toEqual(['GET']); // una sola petición, y condicional
  });
});

describe.skipIf(!ENABLE_GAMES_WRAPPER_WRITE)('el atajo no cambia lo que se escribe', () => {
  it('el PATCH es el mismo con el cuerpo reutilizado que pidiéndolo aparte', async () => {
    // El contenido de los ficheros lleva la marca de cuándo se generó (`integrity.generatedAt`), así que sin
    // congelar el reloj los dos caminos producirían bytes distintos por un motivo que no tiene nada que ver con
    // lo que se está comparando.
    vi.spyOn(Date, 'now').mockReturnValue(1_750_000_000_000);
    // Punto de partida idéntico para los dos caminos: un gist ya escrito y troceado.
    const inicial = bibliotecaTroceada();
    const primero = stubGistStore();
    await writeGist(TOKEN, GIST_ID, inicial);
    const yaEnElGist = { ...primero.store };

    // Una edición pequeña: cambia UN juego, así que los chunks que no le tocan deben quedar fuera del PATCH.
    const editado: TabData = {
      ...inicial,
      c: inicial.c.map((game) => (game.id === 1 ? { ...game, name: 'Editado', _ts: 2_000 } : game)),
      updatedAt: 2_000,
    };

    // Camino A: la escritura pide el estado actual por su cuenta.
    const conGet = stubGistStore({ ...yaEnElGist });
    await writeGist(TOKEN, GIST_ID, editado);
    const patchConGet = conGet.patchBodies[conGet.patchBodies.length - 1];

    // Camino B: se le pasa el cuerpo que la lectura acaba de traer.
    const conAtajo = stubGistStore({ ...yaEnElGist });
    const leido = await readGist(TOKEN, GIST_ID);
    await writeGist(TOKEN, GIST_ID, editado, { knownRemoteFiles: leido.remoteFiles });
    const patchConAtajo = conAtajo.patchBodies[conAtajo.patchBodies.length - 1];

    // Los mismos ficheros tocados, los mismos omitidos y los mismos borrados (`null`).
    expect(Object.keys(patchConAtajo.files).sort()).toEqual(Object.keys(patchConGet.files).sort());
    for (const [name, file] of Object.entries(patchConGet.files)) {
      expect(patchConAtajo.files[name]).toEqual(file);
    }
    // Y de paso: la edición no reenvía la biblioteca entera.
    expect(Object.keys(patchConAtajo.files).length).toBeLessThan(Object.keys(yaEnElGist).length);
  });
});
