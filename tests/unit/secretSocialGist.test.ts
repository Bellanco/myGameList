import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteGist, ensureSecretSocialGist, socialGistHasContent } from '../../src/model/repository/socialGistRepository';

// FASE 2 — migración del canal social a gist SECRETO.
//
// GitHub no permite cambiar la visibilidad, así que migrar es clonar a un id nuevo. Es la misma operación que
// causó la deriva histórica, y por eso lo que más se prueba aquí es cuándo NO debe hacerse: un clonado de más
// deja un gist huérfano y parte al usuario en dos canales.

const TOKEN = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz';
const GIST_ID = 'aabbccddeeff00112233445566778899';
const NUEVO_ID = '99887766554433221100ffeeddccbbaa';

const SOCIAL_FILE = 'myGameList.social.json';

function payload() {
  return {
    profile: { name: 'Ada', private: false, visibility: {}, sharedLists: {} },
    // Entrada con la forma REAL (la del gist de producción): el normalizador descarta las incompletas, así que
    // con un objeto de mentira este test no probaría que el contenido viaja.
    activity: [
      {
        id: 'pid-1:7:review',
        key: 'pid-1:7:review',
        type: 'review',
        actorProfileId: 'pid-1',
        actorName: 'Ada',
        gameId: 7,
        gameName: 'Hollow Knight',
        rating: 4,
        grade: 80,
        recommendationText: '',
        snippet: 'Excelente',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ],
    posts: [],
    updatedAt: 1_000,
  };
}

/** Respuestas de la API de GitHub, controladas por test. */
let listResponse: unknown[];
let created: { public?: boolean; content?: string } | null;

beforeEach(() => {
  listResponse = [];
  created = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    const method = String(init?.method || 'GET').toUpperCase();

    // Listado de gists de la cuenta.
    if (target.endsWith('/gists?per_page=100')) {
      return new Response(JSON.stringify(listResponse), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Creación (el clon secreto).
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}'));
      created = { public: body.public, content: body.files?.[SOCIAL_FILE]?.content };
      return new Response(JSON.stringify({ id: NUEVO_ID }), { status: 201, headers: { etag: 'W/"nuevo"', 'content-type': 'application/json' } });
    }
    // Lectura del gist actual.
    return new Response(
      JSON.stringify({ files: { [SOCIAL_FILE]: { content: JSON.stringify(payload()) } } }),
      { status: 200, headers: { etag: 'W/"actual"', 'content-type': 'application/json' } },
    );
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Entrada del listado tal y como la devuelve GitHub. */
function ownGist(id: string, isPublic: boolean, sizeBytes = 900) {
  return {
    id,
    description: 'myGameList - Social Sync',
    updated_at: '2026-07-01T00:00:00Z',
    public: isPublic,
    files: { [SOCIAL_FILE]: { size: sizeBytes } },
  };
}

describe('ensureSecretSocialGist', () => {
  it('migra un canal PÚBLICO a un gist secreto con el mismo contenido', async () => {
    listResponse = [ownGist(GIST_ID, true)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result).toMatchObject({ gistId: NUEVO_ID, migrated: true, supersededGistIds: [GIST_ID], keptPublicGistIds: [] });
    expect(created?.public).toBe(false);
    // El contenido viaja entero: la actividad no se pierde en la migración.
    expect(JSON.parse(created?.content || '{}').activity).toHaveLength(1);
  });

  // LO QUE MÁS IMPORTA: clonar de más deja un huérfano y parte al usuario en dos canales. Es exactamente el fallo
  // que provocó toda la deriva histórica.
  it('NO clona si el canal ya es secreto', async () => {
    listResponse = [ownGist(GIST_ID, false)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result).toMatchObject({ gistId: GIST_ID, migrated: false, supersededGistIds: [] });
    expect(created).toBeNull();
  });

  it('NO clona si el gist no aparece en el listado de la cuenta', async () => {
    // Token de otra cuenta, gist ajeno o listado incompleto: no se puede afirmar que sea público.
    listResponse = [ownGist('otro00112233445566778899aabbccdd', true)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result.migrated).toBe(false);
    expect(created).toBeNull();
  });

  it('NO toca nada con un token o un id inválidos', async () => {
    expect((await ensureSecretSocialGist('no-es-un-token', GIST_ID)).migrated).toBe(false);
    expect((await ensureSecretSocialGist(TOKEN, 'xx')).migrated).toBe(false);
    expect(created).toBeNull();
  });

  it('es idempotente: tras migrar, una segunda pasada sobre el gist nuevo no vuelve a clonar', async () => {
    listResponse = [ownGist(GIST_ID, true)];
    const first = await ensureSecretSocialGist(TOKEN, GIST_ID);

    // Segunda sesión: el canal ya es el nuevo y es secreto.
    created = null;
    listResponse = [ownGist(first.gistId, false), ownGist(GIST_ID, true)];
    const second = await ensureSecretSocialGist(TOKEN, first.gistId);

    expect(second.migrated).toBe(false);
    expect(created).toBeNull();
  });

  // GUARDA DE TRUNCADO. GitHub recorta los ficheros de más de 1 MB en la API y el código no maneja `truncated`
  // ni `raw_url`: ese gist se lee VACÍO. Clonar un vacío y repuntar las referencias hacia él dejaría al usuario
  // sin canal a la vista, con el contenido atrapado en el gist antiguo.
  it('NO migra un canal tan grande que la API lo truncaría', async () => {
    listResponse = [ownGist(GIST_ID, true, 1_200_000)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result).toMatchObject({ migrated: false, tooLarge: true, gistId: GIST_ID });
    expect(created).toBeNull();
  });

  it('NO migra si el origen se lee vacío pero el fichero no lo estaba', async () => {
    // Segunda red: el tamaño está por debajo del umbral, pero la lectura no devuelve nada. Algo falló al
    // parsear, y clonar ese vacío sobre un canal con contenido sería destruirlo de facto.
    // Id PROPIO de este test: `readSocialGist` cachea por gist, y reutilizar el de los demás casos serviría el
    // payload bueno ya cacheado en vez del roto que se quiere simular.
    const OTRO_ID = '1234567890abcdef1234567890abcdef';
    listResponse = [ownGist(OTRO_ID, true, 50_000)];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/gists?per_page=100')) {
        return new Response(JSON.stringify(listResponse), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        created = { public: true };
        return new Response(JSON.stringify({ id: NUEVO_ID }), { status: 201 });
      }
      // Contenido ilegible → la capa de lectura degrada a payload vacío.
      return new Response(JSON.stringify({ files: { [SOCIAL_FILE]: { content: '{"roto' } } }), { status: 200 });
    }));

    const result = await ensureSecretSocialGist(TOKEN, OTRO_ID);

    expect(result).toMatchObject({ migrated: false, tooLarge: true });
    expect(created).toBeNull();
  });

  it('un canal pequeño y legible sí migra (la guarda no estorba al caso normal)', async () => {
    listResponse = [ownGist(GIST_ID, true, 856)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result.migrated).toBe(true);
  });
});

// RETIRADA DEL CANAL ANTIGUO. Es lo único que quita de circulación lo ya publicado, y es irreversible: por eso
// se verifica el clon ANTES de borrar. Un fallo aquí no deja "dos gists", deja CERO.
describe('deleteGist y socialGistHasContent', () => {
  it('borra el gist y da por bueno también un 404 (ya no está, que es el objetivo)', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: String(init?.method || 'GET') });
      return new Response(null, { status: calls.length === 1 ? 204 : 404 });
    }));

    expect(await deleteGist(TOKEN, GIST_ID)).toBe(true);
    expect(await deleteGist(TOKEN, GIST_ID)).toBe(true);
    expect(calls[0].method).toBe('DELETE');
  });

  it('no intenta borrar con token o id inválidos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await deleteGist('no-es-token', GIST_ID)).toBe(false);
    expect(await deleteGist(TOKEN, 'xx')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la verificación exige que el clon tenga al menos lo copiado', async () => {
    const CLON = 'abcdef0123456789abcdef0123456789';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ files: { [SOCIAL_FILE]: { content: JSON.stringify(payload()) } } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    expect(await socialGistHasContent(TOKEN, CLON, 1)).toBe(true);
    // Si esperábamos más de lo que hay, NO se da por bueno: borrar sería perder la diferencia.
    expect(await socialGistHasContent(TOKEN, CLON, 5)).toBe(false);
  });

  it('ante un fallo de lectura NO se da por verificado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    expect(await socialGistHasContent(TOKEN, '0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f', 3)).toBe(false);
  });

  it('sin nada que copiar, la verificación es trivialmente cierta y no gasta red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await socialGistHasContent(TOKEN, GIST_ID, 0)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// DE QUÉ GIST SE CLONA. Una cuenta con deriva histórica tiene dos canales, y el que este dispositivo tiene
// configurado puede ser el clon VACÍO. Copiar ese y retirar el otro dejaría al usuario con un canal en blanco.
describe('ensureSecretSocialGist — elección de la fuente', () => {
  it('clona el gist con CONTENIDO aunque la sesión apunte al vacío', async () => {
    const CON_CONTENIDO = 'cccccccccccccccccccccccccccccccc';
    // La sesión apunta a GIST_ID (pequeño, el clon vacío); el otro tiene mucho más.
    listResponse = [ownGist(GIST_ID, true, 439), ownGist(CON_CONTENIDO, true, 40_000)];
    const leidos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/gists?per_page=100')) {
        return new Response(JSON.stringify(listResponse), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(String(init?.body || '{}'));
        created = { public: body.public, content: body.files?.[SOCIAL_FILE]?.content };
        return new Response(JSON.stringify({ id: NUEVO_ID }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      leidos.push(target.split('/').pop() || '');
      return new Response(
        JSON.stringify({ files: { [SOCIAL_FILE]: { content: JSON.stringify(payload()) } } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }));

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result.migrated).toBe(true);
    // Se leyó el gist CON contenido, no el de la sesión.
    expect(leidos).toContain(CON_CONTENIDO);
    expect(leidos).not.toContain(GIST_ID);
  });

  it('a igualdad, se queda con el gist de la sesión: no se cambia de canal sin motivo', async () => {
    // Ids FRESCOS: `readSocialGist` cachea por gist, y reutilizar los de otros casos serviría desde caché sin
    // pasar por la red, con lo que este test no observaría nada.
    const SESION = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const OTRO = 'dddddddddddddddddddddddddddddddd';
    listResponse = [ownGist(OTRO, true, 900), ownGist(SESION, true, 900)];
    const leidos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/gists?per_page=100')) {
        return new Response(JSON.stringify(listResponse), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(init?.method || 'GET').toUpperCase() === 'POST') {
        return new Response(JSON.stringify({ id: NUEVO_ID }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      leidos.push(target.split('/').pop() || '');
      return new Response(
        JSON.stringify({ files: { [SOCIAL_FILE]: { content: JSON.stringify(payload()) } } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }));

    await ensureSecretSocialGist(TOKEN, SESION);

    expect(leidos).toContain(SESION);
    expect(leidos).not.toContain(OTRO);
  });
});

// EL CASO REAL EN PRODUCCIÓN: una cuenta con deriva tiene DOS canales públicos, y la sesión apunta al vacío.
// Clonar del que tiene contenido pero retirar solo el de la sesión dejaría expuesto justamente el de las reseñas:
// la migración no habría arreglado nada.
describe('ensureSecretSocialGist — qué se retira con deriva', () => {
  const VACIO = GIST_ID;                                   // el de la sesión
  const CON_RESENAS = 'cafecafecafecafecafecafecafecafe';

  beforeEach(() => {
    listResponse = [ownGist(VACIO, true, 439), ownGist(CON_RESENAS, true, 40_000)];
  });

  it('retira LOS DOS públicos: el clonado y el vacío', async () => {
    const result = await ensureSecretSocialGist(TOKEN, VACIO);

    expect(result.migrated).toBe(true);
    expect(result.supersededGistIds.sort()).toEqual([CON_RESENAS, VACIO].sort());
    expect(result.keptPublicGistIds).toEqual([]);
  });

  it('NO retira un público con contenido que no se copió, y lo reporta', async () => {
    const OTRO_CON_COSAS = 'beefbeefbeefbeefbeefbeefbeefbeef';
    listResponse = [ownGist(VACIO, true, 439), ownGist(CON_RESENAS, true, 40_000), ownGist(OTRO_CON_COSAS, true, 30_000)];

    const result = await ensureSecretSocialGist(TOKEN, VACIO);

    // Se clona del mayor; el otro con contenido se conserva porque lo suyo NO viajó.
    expect(result.supersededGistIds).toContain(CON_RESENAS);
    expect(result.supersededGistIds).toContain(VACIO);
    expect(result.keptPublicGistIds).toEqual([OTRO_CON_COSAS]);
  });

  it('nunca se incluye a sí mismo entre los retirados', async () => {
    const result = await ensureSecretSocialGist(TOKEN, VACIO);
    expect(result.supersededGistIds).not.toContain(result.gistId);
  });
});
