import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Announcement } from '../../src/core/announcement/announcement';

// EL TRANSPORTE DEL AVISO: la API del PROPIO ORIGEN (`/api/announcement`), no Firestore. Lo que se fija aquí es
// justo eso —que se pide a una ruta relativa y a nadie más—, además de las dos reglas de comportamiento: al leer
// nunca lanza (sin aviso la app sigue igual) y al escribir sí (hay un administrador esperando).

const AVISO: Announcement = {
  id: 'av-1',
  kicker: 'Ya puedes votar',
  title: 'Vota los juegos del año',
  body: 'Hasta el domingo.',
  url: 'https://ejemplo.org/votar',
  icon: 'bell',
  active: true,
  repeats: 3,
  intervalHours: 24,
  updatedAt: 0,
};

vi.mock('../../src/model/repository/shareRepository', () => ({
  shareAuthHeaders: async () => ({ Authorization: 'Bearer t', 'Content-Type': 'application/json' }),
}));

const fetchMock = vi.fn();

async function repo() {
  // Módulo fresco en cada prueba: la caché de sesión vive en su ámbito.
  vi.resetModules();
  return import('../../src/model/repository/announcementRepository');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

describe('lectura del aviso', () => {
  it('lo pide al propio origen y lo sanea', async () => {
    fetchMock.mockResolvedValue(ok({ ...AVISO, title: 'x'.repeat(200) }));
    const { loadAnnouncement } = await repo();

    const value = await loadAnnouncement();

    expect(fetchMock).toHaveBeenCalledWith('/api/announcement', undefined);
    expect(value?.title).toHaveLength(60);
  });

  /** ⚑ La razón de ser de este transporte: ni una petición a un tercero al abrir la app. */
  it('no llama a ningún dominio ajeno', async () => {
    fetchMock.mockResolvedValue(ok(null));
    const { loadAnnouncement } = await repo();
    await loadAnnouncement();

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url).startsWith('/')).toBe(true);
    }
  });

  it('una lectura por sesión, y dos pantallas a la vez son una sola petición', async () => {
    fetchMock.mockResolvedValue(ok(AVISO));
    const { loadAnnouncement } = await repo();

    const [a, b] = await Promise.all([loadAnnouncement(), loadAnnouncement()]);
    await loadAnnouncement();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.id).toBe('av-1');
    expect(b?.id).toBe('av-1');
  });

  it('el panel salta las dos cachés', async () => {
    fetchMock.mockResolvedValue(ok(AVISO));
    const { loadAnnouncement } = await repo();

    await loadAnnouncement();
    await loadAnnouncement(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual({ cache: 'no-store' });
  });

  it('sin red, sin función o con la respuesta rota: no hay aviso y no lanza', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await (await repo()).loadAnnouncement()).toBeNull();

    fetchMock.mockResolvedValue(ok({ error: 'no' }, 404));
    expect(await (await repo()).loadAnnouncement()).toBeNull();

    fetchMock.mockResolvedValue(ok(null));
    expect(await (await repo()).loadAnnouncement()).toBeNull();
  });
});

describe('escritura del aviso', () => {
  /**
   * EN PRODUCCIÓN VIAJA LA SESIÓN, que es lo que la Pages Function verifica antes de dejar escribir
   * (`requireAdmin`). Se fuerza `DEV` a falso porque la batería corre en modo desarrollo, donde esta rama no es
   * la que se ejecuta: sin esto, el camino que de verdad usa la web publicada se quedaba sin probar.
   */
  it('en producción lo manda con la sesión y devuelve lo que ha quedado guardado', async () => {
    vi.stubEnv('DEV', false);
    fetchMock.mockResolvedValue(ok({ ...AVISO, title: 'Lo que guardó el servidor' }));
    const { saveAnnouncement } = await repo();

    const saved = await saveAnnouncement(AVISO);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/announcement');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer t');
    expect(saved.title).toBe('Lo que guardó el servidor');
  });

  /**
   * Y EN LOCAL NO, porque no hay ninguna: `npm run dev` corre sin Firebase configurado, así que pedir el token
   * lanzaría «Necesitas iniciar sesión» y el aviso sería lo único imposible de probar en la propia máquina. Quien
   * atiende la petición ahí es el plugin de Vite, que no mira cabeceras y escribe un fichero ignorado por git.
   */
  it('en local guarda sin pedir sesión', async () => {
    vi.stubEnv('DEV', true);
    fetchMock.mockResolvedValue(ok(AVISO));
    const { saveAnnouncement } = await repo();

    await saveAnnouncement(AVISO);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('si el servidor dice que no, lo dice con su motivo', async () => {
    fetchMock.mockResolvedValue(ok({ error: 'Solo el administrador' }, 403));
    const { saveAnnouncement } = await repo();

    await expect(saveAnnouncement(AVISO)).rejects.toThrow('Solo el administrador');
  });
});
