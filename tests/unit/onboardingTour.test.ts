import { afterEach, describe, expect, it } from 'vitest';
import {
  isTourVisible,
  offeredTour,
  parseTourState,
  serializeTourState,
  type TourState,
} from '../../src/core/onboarding/tourState';
import {
  MISSIONS,
  advanceStep,
  chooseMission,
  completeMission,
  mainProgress,
  pickStep,
  settleStep,
  skipMission,
  startTour,
  stepCounter,
  type TourContext,
} from '../../src/core/onboarding/tourSteps';
import { hadLocalFootprint } from '../../src/model/repository/onboardingStore';

const BASE: TourContext = {
  path: '/completados',
  gameCount: 0,
  syncConnected: false,
  socialStatus: 'inactive',
  settingsMenuOpen: false,
  inboxCount: 0,
};

const ctx = (patch: Partial<TourContext> = {}): TourContext => ({ ...BASE, ...patch });
const indexOf = (mission: keyof typeof MISSIONS, id: string) => MISSIONS[mission].steps.findIndex((step) => step.id === id);

describe('estado de la guía', () => {
  it('ida y vuelta por el almacenamiento', () => {
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'cloud', step: 2, completed: ['first-game'] };
    expect(parseTourState(serializeTourState(state))).toEqual(state);
  });

  it('sin clave, roto o de otra versión = no hay guía', () => {
    expect(parseTourState(null)).toBeNull();
    expect(parseTourState('')).toBeNull();
    expect(parseTourState('{no es json')).toBeNull();
    expect(parseTourState(JSON.stringify({ ...offeredTour(), v: 99 }))).toBeNull();
    expect(parseTourState(JSON.stringify({ ...offeredTour(), status: 'inventado' }))).toBeNull();
  });

  it('limpia lo que no entiende sin tirar el resto', () => {
    const raw = JSON.stringify({ ...offeredTour(), mission: 'nada', step: -3, completed: ['cloud', 'x'], skipped: 'no' });
    expect(parseTourState(raw)).toMatchObject({ mission: null, step: 0, completed: ['cloud'], skipped: [] });
  });

  it('solo se monta en los estados que pintan algo', () => {
    expect(isTourVisible(null)).toBe(false);
    expect(isTourVisible({ ...offeredTour(), status: 'dismissed' })).toBe(false);
    expect(isTourVisible({ ...offeredTour(), status: 'done' })).toBe(false);
    for (const status of ['offer', 'active', 'paused', 'menu', 'finale'] as const) {
      expect(isTourVisible({ ...offeredTour(), status })).toBe(true);
    }
  });
});

describe('qué paso toca en cada pantalla', () => {
  it('en los listados se salta el «vuelve a Listados» y enseña las pestañas', () => {
    expect(pickStep(MISSIONS['first-game'], 0, ctx())).toBe(indexOf('first-game', 'lists'));
  });

  it('fuera de los listados, a mitad de misión, dice cómo volver', () => {
    const add = indexOf('first-game', 'add');
    expect(pickStep(MISSIONS['first-game'], add, ctx({ path: '/stats' }))).toBe(indexOf('first-game', 'to-lists'));
  });

  it('quien se adelanta a Datos va directo a la tarjeta de sincronización', () => {
    expect(pickStep(MISSIONS.cloud, 0, ctx({ path: '/ajustes/datos' }))).toBe(indexOf('cloud', 'sync'));
  });

  it('con el menú de Ajustes abierto señala «Datos»', () => {
    expect(pickStep(MISSIONS.cloud, 0, ctx({ settingsMenuOpen: true }))).toBe(indexOf('cloud', 'to-data'));
  });

  it('una celebración no se adelanta: solo sale tras su acción', () => {
    // En la tarjeta de sincronización sin conectar, `synced` (que vale en cualquier pantalla) no se cuela.
    const sync = indexOf('cloud', 'sync');
    expect(pickStep(MISSIONS.cloud, sync, ctx({ path: '/stats' }))).toBe(indexOf('cloud', 'to-settings'));
  });

  it('en lo social sin GitHub, la tarjeta de Datos manda sobre «vuelve a Social»', () => {
    const gateway = indexOf('coop', 'gateway');
    expect(pickStep(MISSIONS.coop, gateway, ctx({ path: '/ajustes/datos' }))).toBe(indexOf('coop', 'coop-sync'));
    expect(pickStep(MISSIONS.coop, gateway, ctx({ path: '/stats' }))).toBe(indexOf('coop', 'to-social'));
  });

  it('sin sitio para ningún paso, no enseña nada', () => {
    const invite = indexOf('coop', 'invite');
    // Cerrar sesión con la invitación delante: la pasarela no es un desvío, así que no se vuelve a ella.
    expect(pickStep(MISSIONS.coop, invite, ctx({ path: '/social', socialStatus: 'inactive' }))).toBeNull();
    expect(pickStep(MISSIONS.library, indexOf('library', 'library-inbox'), ctx({ path: '/ajustes/datos' }))).toBeNull();
  });
});

describe('lo que ya está hecho', () => {
  it('la acción recién hecha se celebra', () => {
    const add = indexOf('first-game', 'add');
    expect(settleStep(MISSIONS['first-game'], add, ctx({ gameCount: 1 }))).toBe(indexOf('first-game', 'added'));
  });

  it('volviendo de GitHub (la página se recarga) se celebra la conexión', () => {
    const sync = indexOf('cloud', 'sync');
    expect(settleStep(MISSIONS.cloud, sync, ctx({ syncConnected: true }))).toBe(indexOf('cloud', 'synced'));
  });

  it('lo que ya venía hecho se salta sin fiesta', () => {
    expect(settleStep(MISSIONS.cloud, 0, ctx({ syncConnected: true }))).toBe(MISSIONS.cloud.steps.length);
  });

  it('un paso explicativo no se da por hecho solo', () => {
    const lists = indexOf('first-game', 'lists');
    expect(settleStep(MISSIONS['first-game'], lists, ctx({ gameCount: 5 }))).toBe(lists);
  });

  it('importar desde Playnite lleva a la bandeja', () => {
    const imp = indexOf('library', 'library-import');
    expect(settleStep(MISSIONS.library, imp, ctx({ inboxCount: 12 }))).toBe(indexOf('library', 'library-inbox'));
  });
});

describe('transiciones', () => {
  it('empezar lleva a la primera misión', () => {
    expect(startTour(offeredTour())).toMatchObject({ status: 'active', mission: 'first-game', step: 0 });
  });

  it('retomar respeta la misión en curso', () => {
    const paused: TourState = { ...offeredTour(), status: 'paused', mission: 'cloud', step: 2, completed: ['first-game'] };
    expect(startTour(paused)).toMatchObject({ status: 'active', mission: 'cloud', step: 2 });
  });

  it('tras la última misión principal llega el final, aunque Playnite siga pendiente', () => {
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'coop', completed: ['first-game', 'cloud'] };
    expect(completeMission(state)).toMatchObject({ status: 'finale', mission: null });
  });

  it('Playnite se ofrece después de la nube y se puede saltar', () => {
    const cloud: TourState = { ...offeredTour(), status: 'active', mission: 'cloud', completed: ['first-game'] };
    const library = completeMission(cloud);
    expect(library).toMatchObject({ mission: 'library', step: 0 });
    expect(skipMission(library)).toMatchObject({ mission: 'coop', skipped: ['library'] });
  });

  it('«Siguiente» en el último paso cumple la misión', () => {
    const state: TourState = { ...offeredTour(), status: 'active', mission: 'first-game' };
    const last = MISSIONS['first-game'].steps.length - 1;
    expect(advanceStep(state, last)).toMatchObject({ mission: 'cloud', completed: ['first-game'] });
    expect(advanceStep(state, 1)).toMatchObject({ mission: 'first-game', step: 2 });
  });

  it('elegir una misión de la lista la repite aunque estuviera hecha', () => {
    const state: TourState = { ...offeredTour(), status: 'menu', completed: ['first-game'], skipped: ['library'] };
    expect(chooseMission(state, 'library')).toMatchObject({ status: 'active', mission: 'library', step: 0, skipped: [] });
    expect(mainProgress(state)).toEqual({ done: 1, total: 3 });
  });

  it('el contador no cuenta desvíos ni celebraciones sin marcar', () => {
    expect(stepCounter(MISSIONS['first-game'], indexOf('first-game', 'to-lists'))).toBeNull();
    expect(stepCounter(MISSIONS['first-game'], indexOf('first-game', 'add'))).toEqual({ position: 2, total: 3 });
    expect(stepCounter(MISSIONS.cloud, indexOf('cloud', 'synced'))).toBeNull();
  });
});

describe('primera visita', () => {
  afterEach(() => localStorage.clear());

  it('un navegador sin nada de la aplicación es una primera visita', () => {
    localStorage.setItem('mis-listas-theme', 'dark');
    expect(hadLocalFootprint()).toBe(false);
  });

  it('las listas, sus claves viejas o una sincronización cuentan como rastro', () => {
    for (const key of ['mis-listas-v12-unified', 'mis-listas-v11-unified', 'mis-listas-gist-config']) {
      localStorage.clear();
      localStorage.setItem(key, '{}');
      expect(hadLocalFootprint()).toBe(true);
    }
  });
});
