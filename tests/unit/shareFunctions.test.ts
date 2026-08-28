// Pruebas de los ayudantes PUROS de las Pages Functions de compartir.
//
// `functions/` queda fuera del tsconfig y del eslint del proyecto (lo compila Cloudflare, no Vite), pero Vitest
// resuelve el TypeScript igual, así que la lógica que no depende del runtime del Worker —escapado, recorte,
// forma del token, clave del contador diario— sí se puede probar aquí. Lo que necesita KV o HTMLRewriter se
// prueba con `wrangler pages dev`, no con mocks: simular el almacén no demostraría nada.
import { describe, it, expect, vi } from 'vitest';
import { JWKS_URL } from '../../functions/_lib/firebaseAuth';
import { shareDescription, shareTitle } from '../../functions/_lib/html';
import { isValidToken, newToken } from '../../functions/_lib/http';
import { dailyQuotaKey, drainPages, ownerKey, shareKey, userShareKey } from '../../functions/_lib/keys';

describe('metadatos de la previsualización', () => {
  it('builds a title with game, score and author', () => {
    const meta = { gameName: 'Hollow Knight', grade: 96, rating: 5, review: '…', authorNick: 'Bellanco' };
    expect(shareTitle(meta)).toBe('Hollow Knight · 96/100 — reseña de Bellanco');
  });

  it('prefers the fine grade over the 0-5 mirror', () => {
    const meta = { gameName: 'X', grade: 80, rating: 3, review: '', authorNick: '' };
    expect(shareTitle(meta)).toBe('X · 80/100');
  });

  it('falls back to the mirror, and to the bare name without any score', () => {
    expect(shareTitle({ gameName: 'X', grade: null, rating: 4, review: '', authorNick: '' })).toBe('X · 4/5');
    expect(shareTitle({ gameName: 'X', grade: null, rating: null, review: '', authorNick: '' })).toBe('X');
  });

  // Limpieza de PRESENTACIÓN, no de seguridad: dentro de un atributo nada de esto es inyectable (HTMLRewriter
  // escapa al asignar), pero una etiqueta suelta en la tarjeta de un chat se ve como basura.
  it('strips tag-shaped noise from title and description', () => {
    const meta = { gameName: '<b>X</b>', grade: null, rating: null, review: 'a <script>alert(1)</script> b', authorNick: '<i>yo</i>' };
    expect(shareTitle(meta)).toBe('X — reseña de yo');
    expect(shareDescription(meta.review)).toBe('a alert(1) b');
  });

  // Y lo que NO se puede romper: un ángulo suelto es texto legítimo de una reseña, no marcado.
  it('keeps loose angle brackets that are part of the prose', () => {
    expect(shareDescription('El jefe final se mata en <3 minutos')).toBe('El jefe final se mata en <3 minutos');
    expect(shareDescription('Dura 5 < 10 horas y rinde > lo esperado')).toBe('Dura 5 < 10 horas y rinde > lo esperado');
  });

  it('collapses whitespace and newlines into a single line', () => {
    expect(shareDescription('Primera línea.\n\n   Segunda    línea.')).toBe('Primera línea. Segunda línea.');
  });

  it('keeps a short review whole', () => {
    expect(shareDescription('Corto y claro.')).toBe('Corto y claro.');
  });

  it('cuts a long review on a word boundary and marks it', () => {
    const cut = shareDescription(`${'palabra '.repeat(60)}final`);
    expect(cut.length).toBeLessThanOrEqual(201);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/pal…$/); // no corta a mitad de palabra
  });

  it('does not leave a dangling space before the ellipsis', () => {
    expect(shareDescription(`${'a'.repeat(150)} ${'b'.repeat(150)}`)).not.toMatch(/ …$/);
  });
});

describe('tokens de enlace', () => {
  it('mints tokens with the accepted shape', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(isValidToken(newToken())).toBe(true);
    }
  });

  it('mints a different token every time', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(tokens.size).toBe(200);
  });

  // Filtrar la forma antes de tocar KV descarta rutas de sondeo sin gastar una lectura.
  it('rejects anything that is not one of our tokens', () => {
    for (const bad of ['', 'corto', '../../etc/passwd', 'con espacio', 'a'.repeat(65), 'token:con:dospuntos']) {
      expect(isValidToken(bad)).toBe(false);
    }
  });
});

describe('claves públicas de Google', () => {
  // La ruta es `/jwk/` en SINGULAR. El plural `/jwks/` —que es como se llama el formato, y por eso invita al
  // error— devuelve un 404 en HTML: la verificación fallaría siempre y TODOS los usuarios verían un 401, que
  // parece un problema de sesión y no de configuración. Esta prueba está para que nadie lo "arregle".
  it('points at the singular /jwk/ endpoint', () => {
    expect(JWKS_URL).toBe('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    expect(JWKS_URL).not.toContain('/jwks/');
  });
});

describe('claves de KV', () => {
  it('builds the three keys of a share', () => {
    expect(shareKey('t')).toBe('share:t');
    expect(ownerKey('t')).toBe('owner:t');
    expect(userShareKey('uid1', 't')).toBe('user:uid1:t');
  });

  // La fecha va en UTC para que el día del contador no dependa de dónde esté quien comparte.
  it('keys the daily counter by UTC day', () => {
    expect(dailyQuotaKey('uid1', Date.UTC(2026, 7, 16, 23, 30))).toBe('quota:uid1:2026-08-16');
    expect(dailyQuotaKey('uid1', Date.UTC(2026, 7, 17, 0, 30))).toBe('quota:uid1:2026-08-17');
  });
});

/**
 * S4 — El recorrido por cursor de KV.
 *
 * No se simula el almacén (ver la nota de la cabecera): `drainPages` recibe la función que trae una página, así
 * que lo que se prueba aquí es el ITERADOR, que es donde estaba el fallo. El censo del panel pedía vetos y
 * ajustes con un `limit` alto y sin cursor, y KV pagina siempre: lo que pasaba del tope desaparecía en silencio.
 */
describe('recorrido paginado de KV', () => {
  const key = (name: string) => ({ name });

  it('junta todas las páginas siguiendo el cursor', async () => {
    const pages = [
      { keys: [key('ban:a'), key('ban:b')], list_complete: false, cursor: 'c1' },
      { keys: [key('ban:c')], list_complete: false, cursor: 'c2' },
      { keys: [key('ban:d')], list_complete: true },
    ];
    const seen: (string | undefined)[] = [];
    let call = 0;

    const all = await drainPages(async (cursor) => {
      seen.push(cursor);
      return pages[call++];
    });

    expect(all.map((k) => k.name)).toEqual(['ban:a', 'ban:b', 'ban:c', 'ban:d']);
    // La primera página va sin cursor; cada siguiente lleva el que devolvió la anterior.
    expect(seen).toEqual([undefined, 'c1', 'c2']);
  });

  it('para en la primera página cuando ya está completa', async () => {
    const fetchPage = vi.fn(async () => ({ keys: [key('ban:solo')], list_complete: true }));

    const all = await drainPages(fetchPage);

    expect(all.map((k) => k.name)).toEqual(['ban:solo']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('devuelve vacío sin claves, sin pedir una página de más', async () => {
    const fetchPage = vi.fn(async () => ({ keys: [], list_complete: true }));

    expect(await drainPages(fetchPage)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('conserva la metadata de cada clave, que es de donde sale la fila del panel', async () => {
    const all = await drainPages<{ gameId: number }>(async () => ({
      keys: [{ name: 'user:u1:tok', metadata: { gameId: 42 } }],
      list_complete: true,
    }));

    expect(all[0].metadata).toEqual({ gameId: 42 });
  });
});
