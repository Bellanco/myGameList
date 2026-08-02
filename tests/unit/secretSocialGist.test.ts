import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSecretSocialGist } from '../../src/model/repository/gistRepository';

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

    expect(result).toMatchObject({ gistId: NUEVO_ID, migrated: true, previousGistId: GIST_ID });
    expect(created?.public).toBe(false);
    // El contenido viaja entero: la actividad no se pierde en la migración.
    expect(JSON.parse(created?.content || '{}').activity).toHaveLength(1);
  });

  // LO QUE MÁS IMPORTA: clonar de más deja un huérfano y parte al usuario en dos canales. Es exactamente el fallo
  // que provocó toda la deriva histórica.
  it('NO clona si el canal ya es secreto', async () => {
    listResponse = [ownGist(GIST_ID, false)];

    const result = await ensureSecretSocialGist(TOKEN, GIST_ID);

    expect(result).toMatchObject({ gistId: GIST_ID, migrated: false, previousGistId: '' });
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
