import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMeta } from '../../src/model/types/local';
import type { TabData } from '../../src/model/types/game';

// LA PASADA SOCIAL DESDE LA APP PRINCIPAL (docs/plan-feed-sin-vacio.md, Fase 3).
//
// La «última vez activo» y los movimientos de lista solo salían con el hub abierto: quien usaba la app a diario sin
// abrirlo desaparecía del feed de sus amigos a los 30 días. Ahora, al arrancar y al volver a la pestaña, si hay
// cambios y han pasado 8 h desde la última pasada, se publica; y la recencia se refresca como mucho una vez al día.
// Sin red ni Firebase hasta saber que hay algo que hacer, y nada sin la aceptación legal vigente.

const { runBackgroundSocialPass, BACKGROUND_SOCIAL_PASS_MIN_INTERVAL_MS, resetBackgroundSocialPassForTests } = await import(
  '../../src/viewmodel/social/backgroundSocialPass'
);
const { PROFILE_TOUCH_MIN_INTERVAL_MS } = await import('../../src/core/constants/socialActivity');

const HORA = 60 * 60 * 1000;
const JUEGOS = { c: [{ id: 1, name: 'Halo' }], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 1 } as unknown as TabData;

function deps(over: { meta?: LocalMeta | null; changed?: boolean; channel?: boolean; session?: boolean; uid?: string | null; consent?: boolean } = {}) {
  let meta: LocalMeta | null = over.meta ?? null;
  return {
    meta: () => meta,
    getLocalMeta: vi.fn(async () => meta),
    patchLocalMeta: vi.fn(async (patch: Partial<LocalMeta>) => { meta = { ...(meta || {}), ...patch } as LocalMeta; }),
    hasSocialChannel: vi.fn(async () => over.channel ?? true),
    hasStoredSession: vi.fn(() => over.session ?? true),
    localActivityChanged: vi.fn(() => over.changed ?? false),
    getUid: vi.fn(async () => (over.uid === undefined ? 'uid-1' : over.uid)),
    canPublish: vi.fn(async () => over.consent ?? true),
    touchActivity: vi.fn(async () => {}),
    reconcile: vi.fn(async () => ({ added: 1, removed: 0, relinked: 0, repaired: 0, moves: 0, skipped: false })),
  };
}

const ahora = () => Date.now();
const recienTocado = (): LocalMeta => ({ profileTouchedAt: ahora() - HORA } as LocalMeta);

beforeEach(() => {
  resetBackgroundSocialPassForTests();
});

describe('runBackgroundSocialPass · lo que NO hace', () => {
  it('sin canal social en este dispositivo no hace nada, ni carga Firebase', async () => {
    const d = deps({ channel: false, changed: true });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('sin-canal');
    expect(d.getUid).not.toHaveBeenCalled();
    expect(d.reconcile).not.toHaveBeenCalled();
  });

  it('sin sesión de Google guardada no hace nada, ni carga Firebase', async () => {
    const d = deps({ session: false, changed: true });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('sin-sesion');
    expect(d.getUid).not.toHaveBeenCalled();
  });

  it('sin cambios y con la recencia de hoy: nada que hacer, y sin Firebase', async () => {
    const d = deps({ meta: recienTocado(), changed: false });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('nada');
    expect(d.getUid).not.toHaveBeenCalled();
    expect(d.touchActivity).not.toHaveBeenCalled();
  });

  it('con cambios pero a menos de 8 h de la última pasada, espera', async () => {
    const d = deps({ meta: { ...recienTocado(), backgroundSocialPassAt: ahora() - 7 * HORA } as LocalMeta, changed: true });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('nada');
    expect(d.reconcile).not.toHaveBeenCalled();
  });

  it('sin la aceptación legal vigente no sale nada: ni publicación ni recencia', async () => {
    const d = deps({ changed: true, consent: false });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('sin-aceptacion');
    expect(d.touchActivity).not.toHaveBeenCalled();
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.meta()?.backgroundSocialPassAt).toBeUndefined();
  });

  it('con la sesión caducada (Firebase sin usuario) no hace nada', async () => {
    const d = deps({ changed: true, uid: null });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('sin-sesion');
    expect(d.reconcile).not.toHaveBeenCalled();
  });

  it('sin juegos cargados no compara nada', async () => {
    const d = deps({ changed: true });
    expect(await runBackgroundSocialPass({ c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 } as unknown as TabData, d)).toBe('sin-listados');
    expect(d.localActivityChanged).not.toHaveBeenCalled();
  });
});

describe('runBackgroundSocialPass · lo que SÍ hace', () => {
  it('con cambios, 8 h después y con la aceptación: publica, refresca la recencia y sella la pasada', async () => {
    const d = deps({ meta: { backgroundSocialPassAt: ahora() - 9 * HORA } as LocalMeta, changed: true });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('hecho');
    expect(d.reconcile).toHaveBeenCalledWith(JUEGOS);
    expect(d.touchActivity).toHaveBeenCalledWith('uid-1');
    expect(d.meta()?.backgroundSocialPassAt).toBeGreaterThan(ahora() - 1000);
  });

  it('sin cambios pero con la recencia de ayer: solo la recencia, sin tocar GitHub ni sellar la pasada', async () => {
    const d = deps({ meta: { profileTouchedAt: ahora() - PROFILE_TOUCH_MIN_INTERVAL_MS - HORA } as LocalMeta, changed: false });
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('hecho');
    expect(d.touchActivity).toHaveBeenCalledWith('uid-1');
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.meta()?.backgroundSocialPassAt).toBeUndefined();
  });

  it('si la publicación falla, no sella: se reintenta en la próxima apertura', async () => {
    const d = deps({ changed: true });
    d.reconcile.mockRejectedValue(new Error('offline'));
    expect(await runBackgroundSocialPass(JUEGOS, d)).toBe('fallo');
    expect(d.meta()?.backgroundSocialPassAt).toBeUndefined();
  });

  it('dos disparos a la vez (arranque y vuelta a la pestaña) hacen UNA pasada', async () => {
    const d = deps({ changed: true });
    await Promise.all([runBackgroundSocialPass(JUEGOS, d), runBackgroundSocialPass(JUEGOS, d)]);
    expect(d.reconcile).toHaveBeenCalledTimes(1);
  });

  it('el intervalo es de 8 h', () => {
    expect(BACKGROUND_SOCIAL_PASS_MIN_INTERVAL_MS).toBe(8 * HORA);
  });
});
