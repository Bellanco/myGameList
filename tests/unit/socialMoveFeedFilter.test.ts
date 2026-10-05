// F4 — el filtro con el que cada uno decide QUÉ MOVIMIENTOS VE en su actividad.
//
// La distinción que estos tests fijan, porque es la que se puede malinterpretar: esto NO es un ajuste de
// privacidad. No decide qué se publica (eso son las listas ocultas del perfil), decide qué se le muestra a quien
// lo toca. De ahí que viva en las preferencias del usuario —local, con réplica en su `publicConfig`— y no en el
// gist social, que es un canal público.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMocks = vi.hoisted(() => ({
  getPublicConfig: vi.fn(async (): Promise<unknown> => null),
  setPublicConfig: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

import {
  ALL_MOVE_TABS,
  moveTabsFromValue,
  parseMoveTabsValue,
  toggleMoveTabValue,
} from '../../src/core/social/moveTabsFilter';
import { setPreferenceUid } from '../../src/model/repository/preferenceStore';
import { feedMoveTabsPreference, hydrateAppearance } from '../../src/view/hooks/preferences';

const FEED_MOVE_TABS_KEY = 'mis-listas-feed-move-tabs';

beforeEach(() => {
  localStorage.clear();
  setPreferenceUid(null);
  gatewayMocks.getPublicConfig.mockResolvedValue(null);
});

afterEach(() => {
  setPreferenceUid(null);
  vi.clearAllMocks();
});

describe('valor del filtro', () => {
  it('sin nada guardado se ven TODAS las listas', () => {
    expect(parseMoveTabsValue(null)).toBe(ALL_MOVE_TABS);
    expect(parseMoveTabsValue(undefined)).toBe(ALL_MOVE_TABS);
    expect(moveTabsFromValue(ALL_MOVE_TABS)).toEqual(['c', 'v', 'e', 'p', 'd']);
  });

  it('la cadena vacía es una elección legítima (ninguna), no un valor ausente', () => {
    expect(parseMoveTabsValue('')).toBe('~');
    expect(parseMoveTabsValue('~')).toBe('~');
    expect(moveTabsFromValue('')).toEqual([]);
    expect(moveTabsFromValue('~')).toEqual([]);
  });

  it('sanea lo que llega de fuera: orden canónico, sin repetidos y sin letras inventadas', () => {
    expect(parseMoveTabsValue('pe~')).toBe('ep~');
    expect(parseMoveTabsValue('ccPPd')).toBe('cpd');
    expect(parseMoveTabsValue('xyz~')).toBe('~');
    expect(parseMoveTabsValue('dvC')).toBe('cvd');
  });

  it('el interruptor de una lista enciende, apaga y no toca a las demás', () => {
    expect(toggleMoveTabValue('cvepd', 'v')).toBe('cepd');
    expect(toggleMoveTabValue('cepd', 'v')).toBe('cvepd');
    // Dos vueltas devuelven al punto de partida (canónico).
    expect(toggleMoveTabValue(toggleMoveTabValue('cvepd', 'c'), 'c')).toBe('cvepd');
    expect(toggleMoveTabValue('~', 'e')).toBe('e~');
  });

  it('apagar deseos deja la marca, y con ella se respeta la elección', () => {
    expect(toggleMoveTabValue('cvepd', 'd')).toBe('cvep~');
    expect(parseMoveTabsValue('cvep~')).toBe('cvep~');
    expect(moveTabsFromValue('cvep~')).toEqual(['c', 'v', 'e', 'p']);
    expect(toggleMoveTabValue('cvep~', 'd')).toBe('cvepd');
  });
});

describe('valores guardados antes de la lista de deseos', () => {
  it('sin `d` y sin marca se le enciende: quien tocó el ajuste no eligió dejar de ver una lista que no existía', () => {
    expect(parseMoveTabsValue('cvep')).toBe('cvepd');
    expect(parseMoveTabsValue('pe')).toBe('epd');
    expect(moveTabsFromValue('ce')).toEqual(['c', 'e', 'd']);
    // Y al tocar otra lista el valor sale ya migrado y con su marca si procede.
    expect(toggleMoveTabValue('cvep', 'v')).toBe('cepd');
  });

  it('la cadena vacía sigue siendo «ninguna»: una lista más no cambia esa elección', () => {
    expect(parseMoveTabsValue('')).toBe('~');
    expect(moveTabsFromValue('')).toEqual([]);
  });
});

describe('la preferencia', () => {
  it('por defecto vale todas, y lo que se guarda se lee saneado', () => {
    expect(feedMoveTabsPreference.get()).toBe(ALL_MOVE_TABS);

    feedMoveTabsPreference.set('ep~');
    expect(localStorage.getItem(FEED_MOVE_TABS_KEY)).toBe('ep~');
    expect(feedMoveTabsPreference.get()).toBe('ep~');

    // Un valor manipulado a mano en el almacenamiento no se sirve tal cual.
    localStorage.setItem(FEED_MOVE_TABS_KEY, 'pXe~');
    expect(feedMoveTabsPreference.get()).toBe('ep~');

    // Y uno guardado antes de la lista de deseos se lee con ella encendida.
    localStorage.setItem(FEED_MOVE_TABS_KEY, 'ep');
    expect(feedMoveTabsPreference.get()).toBe('epd');
  });

  it('devuelve un PRIMITIVO estable: dos lecturas seguidas son `Object.is` iguales', () => {
    // Es lo que permite usarla con `useSyncExternalStore` sin provocar un bucle de renders (por eso el valor es
    // una cadena y no una lista).
    feedMoveTabsPreference.set('cv');
    expect(Object.is(feedMoveTabsPreference.get(), feedMoveTabsPreference.get())).toBe(true);
  });

  it('avisa a sus suscriptores al cambiar', () => {
    const listener = vi.fn();
    const unsubscribe = feedMoveTabsPreference.subscribe(listener);

    feedMoveTabsPreference.set('c');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    feedMoveTabsPreference.set('cv');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('con sesión se replica a `publicConfig` para que siga al usuario entre dispositivos', async () => {
    setPreferenceUid('uid-1');
    feedMoveTabsPreference.set('ce~');

    expect(gatewayMocks.setPublicConfig).toHaveBeenCalledWith('uid-1', { feedMoveTabs: 'ce~' });

    // Y «ninguna» también se replica: es una elección, no la ausencia de una.
    feedMoveTabsPreference.set('~');
    expect(gatewayMocks.setPublicConfig).toHaveBeenLastCalledWith('uid-1', { feedMoveTabs: '~' });
  });

  it('sin sesión no habla con Firestore', () => {
    feedMoveTabsPreference.set('cv');
    expect(gatewayMocks.setPublicConfig).not.toHaveBeenCalled();
  });

  it('al iniciar sesión se hidrata desde la nube sin re-replicar', async () => {
    gatewayMocks.getPublicConfig.mockResolvedValue({ feedMoveTabs: 'pe' });
    setPreferenceUid('uid-1');

    await hydrateAppearance('uid-1');

    // Saneado al orden canónico, y migrado: lo escribió un cliente anterior a la lista de deseos.
    expect(feedMoveTabsPreference.get()).toBe('epd');
    expect(gatewayMocks.setPublicConfig).not.toHaveBeenCalled(); // venía de la nube: no se devuelve
  });

  it('un valor de la nube con forma inesperada no pisa lo local', async () => {
    feedMoveTabsPreference.set('c~');
    gatewayMocks.getPublicConfig.mockResolvedValue({ feedMoveTabs: 42 });

    await hydrateAppearance('uid-1');

    expect(feedMoveTabsPreference.get()).toBe('c~');
  });
});
