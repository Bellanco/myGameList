/**
 * LA PASARELA AL ESPACIO SOCIAL (`useSocialGateway`): adoptar el canal social que la cuenta ya tenga o crear uno.
 *
 * Lo que se protege es la regla que más daño hizo cuando fallaba: NUNCA SE CREA UN CANAL A CIEGAS. Si no se puede
 * saber si la cuenta ya tiene uno —Firestore sin cuota o caído—, crear aquí deja el historial real huérfano y un
 * canal vacío adoptado como propio, y el auto-crear no puede quedarse preguntando en bucle.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPrivateConfig = vi.hoisted(() => vi.fn());
const resolveOwnProfile = vi.hoisted(() => vi.fn());
const createSocialGist = vi.hoisted(() => vi.fn());
const readSocialGist = vi.hoisted(() => vi.fn());
const saveSocialSyncConfig = vi.hoisted(() => vi.fn());

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPrivateConfig,
  resolveOwnProfile,
  setPrivateConfig: vi.fn(async () => {}),
  signInWithGoogle: vi.fn(),
  signOutSocialUser: vi.fn(),
  clearAnalyticsUser: vi.fn(),
}));
vi.mock('../../src/model/repository/socialGistRepository', () => ({ createSocialGist, readSocialGist, saveSocialSyncConfig }));

const { useSocialGateway } = await import('../../src/viewmodel/social/useSocialGateway');

const USUARIO = { uid: 'uid-yo', displayName: 'Yo', email: 'yo@example.com', photoURL: '' };

function setup() {
  const opts = {
    mainSyncConfig: { token: 'ghp_0123456789abcdefghij', gistId: 'juegos1' },
    hasMainSync: true,
    authUser: USUARIO,
    hasSocialGist: false,
    legalGateOpen: true,
    setAuthUser: vi.fn(),
    setSocialCfgGistId: vi.fn(),
    setSocialCfgEtag: vi.fn(),
    setShowSocialSpace: vi.fn(),
    setFeedback: vi.fn(),
    reportFailure: vi.fn(),
    navigate: vi.fn(),
  };
  /* El canal es ESTADO, como en el hub: crear o adoptar uno lo enciende, y con él se apaga el auto-crear. Con un
     setter de mentira el canal no llegaba nunca y la prueba medía otra cosa (un segundo alta). */
  const hook = renderHook((props: typeof opts) => {
    const [gistId, setGistId] = useState('');
    const setSocialCfgGistId = (valor: string) => {
      props.setSocialCfgGistId(valor);
      setGistId(valor);
    };
    return useSocialGateway({ ...props, hasSocialGist: Boolean(gistId), setSocialCfgGistId } as never);
  }, { initialProps: opts });
  return { ...hook, opts };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveOwnProfile.mockResolvedValue(null);
  createSocialGist.mockResolvedValue({ gistId: 'nuevo1', etag: 'e1' });
});

describe('la pasarela al espacio social', () => {
  it('con sesión y sin canal, si la cuenta NO tiene ninguno, lo crea solo', async () => {
    getPrivateConfig.mockResolvedValue(null);
    const { opts } = setup();

    await waitFor(() => expect(createSocialGist).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(opts.setSocialCfgGistId).toHaveBeenCalledWith('nuevo1'));
  });

  it('si ya tiene uno, lo adopta y no crea otro', async () => {
    getPrivateConfig.mockResolvedValue({ socialGistId: 'existente1' });
    readSocialGist.mockResolvedValue({});
    const { opts } = setup();

    await waitFor(() => expect(opts.setSocialCfgGistId).toHaveBeenCalledWith('existente1'));
    expect(createSocialGist).not.toHaveBeenCalled();
  });

  it('si no se puede saber —el servicio no responde—, no crea nada ni vuelve a preguntar en bucle', async () => {
    getPrivateConfig.mockRejectedValue(new Error('Firestore: resource-exhausted'));
    const { result, opts } = setup();

    await waitFor(() => expect(opts.setFeedback).toHaveBeenCalledWith('warn', expect.any(String), 'long'));
    await waitFor(() => expect(result.current.primaryGatewayCta).not.toBeNull());
    // Un solo intento: el auto-crear se cierra en esta sesión.
    await new Promise((listo) => setTimeout(listo, 50));
    expect(getPrivateConfig).toHaveBeenCalledTimes(1);
    expect(createSocialGist).not.toHaveBeenCalled();
  });
});
