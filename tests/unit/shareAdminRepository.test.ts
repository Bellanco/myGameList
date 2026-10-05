// La API de administración de enlaces (`shareAdminRepository`): qué se da por respuesta del Worker y qué no.
//
// El caso que motiva este fichero: en el servidor de desarrollo no hay gemelo de `/api/share/*`, y Vite contesta a
// la ruta con `index.html` y un 200. Eso se leía como `{}` y el panel pintaba «Enlaces activos: 0+», un censo
// vacío e incompleto que no existía.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/model/repository/shareRepository', () => ({
  shareAuthHeaders: async () => ({ Authorization: 'Bearer test' }),
}));

const { listAllShares } = await import('../../src/model/repository/shareAdminRepository');

function respuesta(body: string, init: { status?: number; contentType: string }) {
  return new Response(body, { status: init.status ?? 200, headers: { 'content-type': init.contentType } });
}

describe('shareAdminRepository · call', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lee el censo cuando el Worker responde', async () => {
    vi.stubGlobal('fetch', async () => respuesta(
      JSON.stringify({ shares: [], bans: ['uid-x'], overrides: {}, cursor: null, complete: true }),
      { contentType: 'application/json' },
    ));

    const page = await listAllShares();
    expect(page.complete).toBe(true);
    expect(page.bans).toEqual(['uid-x']);
  });

  it('un 200 con HTML no es un censo vacío: es que no hay servicio', async () => {
    vi.stubGlobal('fetch', async () => respuesta('<!doctype html><html></html>', { contentType: 'text/html' }));

    await expect(listAllShares()).rejects.toThrow();
  });

  it('un error del Worker conserva su mensaje', async () => {
    vi.stubGlobal('fetch', async () => respuesta(
      JSON.stringify({ error: 'Solo el administrador' }),
      { status: 403, contentType: 'application/json' },
    ));

    await expect(listAllShares()).rejects.toThrow('Solo el administrador');
  });
});
