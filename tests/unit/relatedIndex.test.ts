// El índice de «análisis sugeridos» (`functions/_lib/relatedIndex.ts`): la parte PURA, sin KV.
//
// Lo que necesita el almacén se prueba con `wrangler pages dev` (ver la nota de `shareFunctions.test.ts`). Aquí va
// lo que decide qué filas quedan: es donde un fallo dejaría sugiriendo un enlace retirado, o perdería uno vivo.
import { describe, expect, it } from 'vitest';
import {
  entryFromArticle,
  updateRelatedIndex,
  parseRelatedIndex,
  reconcileRelatedIndex,
  RELATED_SNIPPET_MAX_CHARS,
  type RelatedIndexEntry,
} from '../../functions/_lib/relatedIndex';
import { relatedIndexKey, shareKey, userSharePrefix, type KVNamespace } from '../../functions/_lib/keys';

const AHORA = Date.parse('2026-09-30T12:00:00.000Z');
const DIA = 24 * 3_600_000;

function fila(token: string, extra: Partial<RelatedIndexEntry> = {}): RelatedIndexEntry {
  return {
    token,
    gameName: `Juego ${token}`,
    genres: ['RPG'],
    rating: 4,
    grade: 80,
    snippet: 'Un análisis.',
    reviewedAt: AHORA - DIA,
    createdAt: AHORA - DIA,
    expiresAt: AHORA + 7 * DIA,
    ...extra,
  };
}

describe('clave del índice', () => {
  // El censo de /api/share/all recorre `user:` y parte cada clave por el último `:`: si el índice colgara de ahí,
  // aparecería en el panel como un enlace más con token «related».
  it('no cuelga del prefijo que recorre el censo', () => {
    expect(relatedIndexKey('uid-1')).toBe('relidx:uid-1');
    expect(relatedIndexKey('uid-1').startsWith('user:')).toBe(false);
    expect(relatedIndexKey('uid-1').startsWith(userSharePrefix('uid-1'))).toBe(false);
  });
});

describe('fila a partir del artículo', () => {
  it('guarda solo lo que el pie enseñaba, con el mismo recorte del adelanto', () => {
    const articulo = {
      gameName: 'Hollow Knight',
      review: `${'palabra '.repeat(40)}final`,
      genres: ['Metroidvania'],
      rating: 5,
      grade: 96,
      reviewedAt: AHORA - DIA,
      createdAt: AHORA,
      expiresAt: AHORA + DIA,
      authorNick: 'Bellanco',
      strengths: ['arte'],
    };
    const entry = entryFromArticle('tok', articulo);
    expect(entry).not.toBeNull();
    expect(entry!.snippet.length).toBeLessThanOrEqual(RELATED_SNIPPET_MAX_CHARS);
    expect(entry!.snippet.endsWith(' ')).toBe(false);
    // Ni la firma ni el resto del artículo: el índice no guarda más de lo que ya salía en la respuesta.
    expect(Object.keys(entry!).sort()).toEqual(
      ['createdAt', 'expiresAt', 'gameName', 'genres', 'grade', 'rating', 'reviewedAt', 'snippet', 'token'],
    );
  });

  it('descarta lo que no se puede sugerir: sin juego o sin texto', () => {
    expect(entryFromArticle('tok', { gameName: '', review: 'algo' })).toBeNull();
    expect(entryFromArticle('tok', { gameName: 'X', review: '   ' })).toBeNull();
    expect(entryFromArticle('tok', null)).toBeNull();
  });
});

describe('lectura del índice', () => {
  it('se queda con las filas válidas y trata lo corrupto como vacío', () => {
    expect(parseRelatedIndex(null)).toEqual([]);
    expect(parseRelatedIndex({ entries: 'no' })).toEqual([]);
    const buena = fila('a');
    expect(parseRelatedIndex({ v: 1, entries: [buena, { token: 'b' }, null, 7] })).toEqual([buena]);
  });
});

describe('reconciliación', () => {
  it('añade la recién publicada y sustituye la renovada', () => {
    const vieja = fila('a', { snippet: 'Antes.' });
    const nueva = fila('a', { snippet: 'Después.' });
    const { entries, changed } = reconcileRelatedIndex([vieja, fila('b')], { add: nueva }, AHORA);
    expect(changed).toBe(true);
    expect(entries.map((e) => [e.token, e.snippet])).toEqual([['a', 'Después.'], ['b', 'Un análisis.']]);
  });

  it('retira los tokens pedidos', () => {
    const { entries } = reconcileRelatedIndex([fila('a'), fila('b')], { remove: ['a'] }, AHORA);
    expect(entries.map((e) => e.token)).toEqual(['b']);
  });

  // La autorreparación: el listado manda. Lo que el listado no conoce sale; lo que conoce y falta se pide.
  it('con el listado en la mano quita lo que sobra y señala lo que falta', () => {
    const { entries, missing, changed } = reconcileRelatedIndex([fila('a'), fila('fantasma')], { live: ['a', 'c'] }, AHORA);
    expect(entries.map((e) => e.token)).toEqual(['a']);
    expect(missing).toEqual(['c']);
    expect(changed).toBe(true);
  });

  it('«retirar todos» vacía el índice aunque tuviera filas que el listado ya no conocía', () => {
    expect(reconcileRelatedIndex([fila('a'), fila('b')], { live: [] }, AHORA).entries).toEqual([]);
  });

  it('descarta lo caducado aunque KV aún no lo haya borrado', () => {
    const { entries } = reconcileRelatedIndex([fila('a', { expiresAt: AHORA - 1 }), fila('b')], {}, AHORA);
    expect(entries.map((e) => e.token)).toEqual(['b']);
  });

  // Lo que ahorra la escritura: abrir «mis enlaces» con el índice al día no gasta una del cupo diario.
  it('no marca cambio si todo cuadra, venga en el orden que venga', () => {
    const { changed, missing } = reconcileRelatedIndex([fila('b'), fila('a')], { live: ['a', 'b'] }, AHORA);
    expect(changed).toBe(false);
    expect(missing).toEqual([]);
  });

  // Publicar pasa el listado ANTERIOR más el token nuevo: la fila nueva llega en `add` y no debe pedirse.
  it('al publicar, la fila nueva no cuenta como que falta', () => {
    const { entries, missing } = reconcileRelatedIndex([fila('a')], { live: ['a', 'n'], add: fila('n') }, AHORA);
    expect(entries.map((e) => e.token)).toEqual(['a', 'n']);
    expect(missing).toEqual([]);
  });
});

/**
 * EL CAMINO QUE TOCA KV, con un almacén en memoria mínimo. No demuestra nada de KV —eso es `wrangler pages dev`—:
 * demuestra lo que hace NUESTRO código con él. Sobre todo, que no gaste escrituras (1.000 al día para la cuenta
 * entera) cuando el índice ya está al día, que es el caso de cada apertura de «mis enlaces».
 */
function almacen(inicial: Record<string, unknown> = {}) {
  const datos = new Map(Object.entries(inicial).map(([k, v]) => [k, JSON.stringify(v)]));
  const escrituras: string[] = [];
  const kv = {
    async get(key: string, type?: string) {
      const raw = datos.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      escrituras.push(`put ${key}`);
      datos.set(key, value);
    },
    async delete(key: string) {
      escrituras.push(`delete ${key}`);
      datos.delete(key);
    },
    async list() {
      throw new Error('el índice no lista nunca');
    },
  } as unknown as KVNamespace;
  return { kv, escrituras, leer: (key: string) => JSON.parse(datos.get(key) ?? 'null') };
}

describe('actualización del índice en KV', () => {
  it('no escribe si el listado coincide con lo que ya hay', async () => {
    const { kv, escrituras } = almacen({ [relatedIndexKey('u')]: { v: 1, entries: [fila('a')] } });
    await updateRelatedIndex(kv, 'u', { live: ['a'] }, AHORA);
    expect(escrituras).toEqual([]);
  });

  // La migración perezosa: un autor con enlaces de antes del índice lo estrena al abrir «mis enlaces».
  it('completa lo que falta leyendo su artículo', async () => {
    const articulo = { gameName: 'Celeste', review: 'Difícil y justo.', genres: ['Plataformas'], expiresAt: AHORA + DIA };
    const { kv, escrituras, leer } = almacen({ [shareKey('c')]: articulo });
    await updateRelatedIndex(kv, 'u', { live: ['c'] }, AHORA);
    expect(escrituras).toEqual([`put ${relatedIndexKey('u')}`]);
    expect(leer(relatedIndexKey('u')).entries.map((e: RelatedIndexEntry) => [e.token, e.gameName])).toEqual([['c', 'Celeste']]);
  });

  it('sin filas, borra la clave en vez de guardar una lista vacía', async () => {
    const { kv, escrituras } = almacen({ [relatedIndexKey('u')]: { v: 1, entries: [fila('a')] } });
    await updateRelatedIndex(kv, 'u', { live: [] }, AHORA);
    expect(escrituras).toEqual([`delete ${relatedIndexKey('u')}`]);
  });

  it('un fallo de KV no se propaga: publicar o retirar no dependen del índice', async () => {
    const roto = { get: async () => { throw new Error('KV caído'); } } as unknown as KVNamespace;
    await expect(updateRelatedIndex(roto, 'u', { add: fila('a') }, AHORA)).resolves.toBeUndefined();
  });
});
