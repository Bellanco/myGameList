import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL TROFEO DE UNA EDICIÓN SE PUEDE QUITAR Y DEVOLVER, y desaparece con ella.
 *
 * Tres cosas se comprueban aquí, y las tres se ven en el perfil de otra gente:
 *
 *  1. El interruptor del histórico retira el logro de los perfiles y lo devuelve, sin perder a nadie por el
 *     camino —los votos ya no existen cuando se pulsa, así que la lista de premiados tiene que estar guardada—.
 *  2. Borrar una edición del histórico se lleva su logro: si no, quedaría una medalla enlazando a un archivo que
 *     ya no existe.
 *  3. Todo va por CUENTA (`uid`) y nunca por nombre: cambiar el nick no mueve ningún trofeo.
 *
 * Firestore se simula entero, con estado de verdad: las escrituras se leen después, que es lo único que permite
 * encadenar apagar → encender y comprobar que el logro vuelve donde estaba.
 */

interface Registro {
  id: string;
  data: Record<string, unknown>;
}

const state: Record<string, Registro[]> = {
  profiles: [],
  premiosAdmin: [],
  premiosResults: [],
  premiosBallots: [],
  premiosCategories: [],
  premiosConfig: [],
};

const bucket = (name: string): Registro[] => (state[name] ||= []);

function leer(collectionName: string, id: string): Registro | undefined {
  return bucket(collectionName).find((entry) => entry.id === id);
}

function escribir(collectionName: string, id: string, data: Record<string, unknown>, merge: boolean) {
  const previo = leer(collectionName, id);
  if (previo && merge) {
    previo.data = { ...previo.data, ...data };
    return;
  }
  if (previo) {
    previo.data = { ...data };
    return;
  }
  bucket(collectionName).push({ id, data: { ...data } });
}

const docRef = (collectionName: string, id: string) => ({
  path: `${collectionName}/${id}`,
  id,
  collectionName,
});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: async () => ({ firestore: {}, auth: {}, app: {}, analytics: null }),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collectionName: string, id: string) => docRef(collectionName, id),
  collection: (_db: unknown, name: string) => ({ name }),
  getDocs: async (ref: { name: string }) => ({
    docs: bucket(ref.name).map((entry) => ({
      id: entry.id,
      ref: docRef(ref.name, entry.id),
      data: () => entry.data,
    })),
  }),
  getDoc: async (ref: { collectionName: string; id: string }) => {
    const entry = leer(ref.collectionName, ref.id);
    return { exists: () => Boolean(entry), data: () => entry?.data, ref };
  },
  setDoc: async (
    ref: { collectionName: string; id: string },
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ) => escribir(ref.collectionName, ref.id, data, Boolean(options?.merge)),
  deleteDoc: async (ref: { collectionName: string; id: string }) => {
    state[ref.collectionName] = bucket(ref.collectionName).filter((entry) => entry.id !== ref.id);
  },
  updateDoc: async (ref: { collectionName: string; id: string }, data: Record<string, unknown>) =>
    escribir(ref.collectionName, ref.id, data, true),
  writeBatch: () => ({
    delete: (ref: { collectionName: string; id: string }) => {
      state[ref.collectionName] = bucket(ref.collectionName).filter((entry) => entry.id !== ref.id);
    },
    update: (ref: { collectionName: string; id: string }, data: Record<string, unknown>) =>
      escribir(ref.collectionName, ref.id, data, true),
    commit: async () => {},
  }),
  deleteField: () => '__deleteField__',
  serverTimestamp: () => '__serverTimestamp__',
}));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ({ cat1: 'cat1_option_0' }),
  clearWinners: async () => {},
  clearLegacyWinnerField: async () => 0,
}));

const {
  fetchPalmaresRecord,
  fetchPalmaresRecords,
  grantPalmares,
  revokePalmares,
  setSeasonPalmaresGranted,
} = await import('../../src/model/repository/premios/premiosPalmaresRepository');

const { deleteSeasonResult, publishAndArchiveSeason } = await import(
  '../../src/model/repository/premios/premiosSeasonRepository'
);

/** Categoría votable tal y como vive en Firestore. */
const category = (id: string): Registro => ({
  id,
  data: {
    title: { es: 'Juego del año' },
    options: [
      { id: `${id}_option_0`, name: 'Juego A' },
      { id: `${id}_option_1`, name: 'Juego B' },
    ],
    weight: 1,
    orderIndex: 0,
    isActive: true,
  },
});

const ballot = (uid: string, nickname: string, optionId: string): Registro => ({
  id: uid,
  data: {
    userId: uid,
    profileId: `p-${uid}`,
    userDisplayName: nickname,
    selections: { cat1: optionId },
    season: 2026,
    isActive: true,
  },
});

/** El palmarés que luce un perfil ahora mismo. */
const palmaresDe = (uid: string) =>
  (leer('profiles', uid)?.data.palmares || []) as Array<{ seasonId: string; rank: number; seasonName: string }>;

beforeEach(() => {
  for (const key of Object.keys(state)) state[key] = [];
});

describe('el interruptor del logro de una edición', () => {
  beforeEach(async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0'), ballot('uid-2', 'Bea', 'cat1_option_1')];
    state.profiles = [
      { id: 'uid-1', data: { uid: 'uid-1', displayName: 'Ana' } },
      { id: 'uid-2', data: { uid: 'uid-2', displayName: 'Bea' } },
    ];
    await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });
  });

  it('al publicar deja apuntado a quién se le dio, donde solo lo ve el administrador', async () => {
    const registro = await fetchPalmaresRecord('test');

    expect(registro?.granted).toBe(true);
    expect(registro?.recipients.map((r) => r.uid).sort()).toEqual(['uid-1', 'uid-2']);
    // Y en la colección de administración, que no es pública: el archivo publicado sigue sin uid ninguno.
    expect(leer('premiosAdmin', 'palmares-test')).toBeTruthy();
    const archivo = leer('premiosResults', 'test')?.data as { leaderboard: Array<Record<string, unknown>> };
    expect(archivo.leaderboard.every((entry) => entry.userId === undefined)).toBe(true);
  });

  it('apagarlo retira el logro de los perfiles', async () => {
    expect(palmaresDe('uid-1')).toHaveLength(1);

    const retirados = await setSeasonPalmaresGranted('test', 'Test', false);

    expect(retirados).toBe(2);
    expect(palmaresDe('uid-1')).toEqual([]);
    expect(palmaresDe('uid-2')).toEqual([]);
    expect((await fetchPalmaresRecord('test'))?.granted).toBe(false);
  });

  it('volver a encenderlo lo devuelve a los mismos, con su puesto', async () => {
    await setSeasonPalmaresGranted('test', 'Test', false);
    const concedidos = await setSeasonPalmaresGranted('test', 'Test', true);

    expect(concedidos).toBe(2);
    expect(palmaresDe('uid-1')[0]).toMatchObject({ seasonId: 'test', rank: 1 });
    expect(palmaresDe('uid-2')[0]).toMatchObject({ seasonId: 'test', rank: 2 });
    expect((await fetchPalmaresRecord('test'))?.granted).toBe(true);
  });

  it('no toca el logro de las demás ediciones', async () => {
    escribir(
      'profiles',
      'uid-1',
      {
        palmares: [
          ...palmaresDe('uid-1'),
          { seasonId: 'otra', seasonName: 'Otra', rank: 3, awardedAt: 1 },
        ],
      },
      true,
    );

    await setSeasonPalmaresGranted('test', 'Test', false);

    expect(palmaresDe('uid-1').map((e) => e.seasonId)).toEqual(['otra']);
  });

  it('el histórico puede leer de una vez el estado de todas las ediciones', async () => {
    await setSeasonPalmaresGranted('test', 'Test', false);
    const registros = await fetchPalmaresRecords();

    expect(registros['test'].granted).toBe(false);
    // El documento de ganadores vive en la misma colección y no puede colarse como si fuera una edición.
    escribir('premiosAdmin', 'winners', { winners: { cat1: 'cat1_option_0' } }, false);
    expect(Object.keys(await fetchPalmaresRecords())).toEqual(['test']);
  });

  // Sin registro no hay a quién devolvérselo: los votos se retiraron al publicar. Mejor decirlo que fingir que
  // se ha hecho algo.
  it('se niega a encender una edición de la que no se sabe quién ganó', async () => {
    state.premiosAdmin = [];
    await expect(setSeasonPalmaresGranted('test', 'Test', true)).rejects.toThrow(/registro/i);
  });
});

/** LO QUE PREGUNTA EL PANEL: si borro una edición publicada, ¿desaparece su logro? */
describe('borrar una edición del histórico', () => {
  beforeEach(async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];
    state.profiles = [{ id: 'uid-1', data: { uid: 'uid-1' } }];
    await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });
  });

  it('se lleva el logro de los perfiles que lo tenían', async () => {
    expect(palmaresDe('uid-1')).toHaveLength(1);

    const result = await deleteSeasonResult('test');

    expect(result.revoked).toBe(1);
    expect(palmaresDe('uid-1')).toEqual([]);
    expect(leer('premiosResults', 'test')).toBeUndefined();
  });

  it('olvida también el registro: la edición no deja rastro', async () => {
    await deleteSeasonResult('test');

    expect(leer('premiosAdmin', 'palmares-test')).toBeUndefined();
    expect(await fetchPalmaresRecord('test')).toBeNull();
  });

  it('no arrastra el logro de otra edición que el mismo perfil tuviera', async () => {
    escribir(
      'profiles',
      'uid-1',
      { palmares: [...palmaresDe('uid-1'), { seasonId: 'otra', seasonName: 'Otra', rank: 2, awardedAt: 1 }] },
      true,
    );

    await deleteSeasonResult('test');

    expect(palmaresDe('uid-1').map((e) => e.seasonId)).toEqual(['otra']);
  });
});

/**
 * EL LOGRO VA A LA CUENTA, NO AL NOMBRE.
 *
 * El nick es un rótulo: se escribe en la clasificación del archivo porque hay que enseñar algo, y esa foto se
 * queda como estaba el día de la publicación. El trofeo, en cambio, viaja por `uid` de punta a punta —papeleta,
 * clasificación, perfil, registro—, así que cambiar de nick antes o después no lo mueve de sitio.
 */
describe('el nick no decide nada', () => {
  it('concede el logro por uid aunque el perfil se llame de otra forma que la papeleta', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];
    // Votó como «Ana» y para cuando se publica su perfil ya se llama «Anabel».
    state.profiles = [{ id: 'uid-1', data: { uid: 'uid-1', displayName: 'Anabel' } }];

    const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });

    expect(result.awarded).toBe(1);
    expect(palmaresDe('uid-1')[0]).toMatchObject({ seasonId: 'test', rank: 1 });
  });

  it('el logro sigue puesto —y se puede quitar— después de cambiar de nick', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];
    state.profiles = [{ id: 'uid-1', data: { uid: 'uid-1', displayName: 'Ana' } }];
    await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });

    // Se cambia el nick: el trofeo no se toca, porque no cuelga del nombre.
    escribir('profiles', 'uid-1', { displayName: 'Otro nombre' }, true);
    expect(palmaresDe('uid-1')[0]).toMatchObject({ seasonId: 'test' });

    // Y el interruptor lo encuentra igual.
    expect(await revokePalmares('test')).toEqual([{ uid: 'uid-1', rank: 1 }]);
    expect(palmaresDe('uid-1')).toEqual([]);
  });

  it('un perfil que no existe no recibe nada y no rompe la concesión del resto', async () => {
    state.profiles = [{ id: 'uid-2', data: { uid: 'uid-2' } }];

    const concedidos = await grantPalmares(
      [
        { uid: 'uid-1', rank: 1 },
        { uid: 'uid-2', rank: 2 },
      ],
      'test',
      'Test',
    );

    expect(concedidos).toBe(1);
    expect(palmaresDe('uid-2')[0]).toMatchObject({ rank: 2 });
  });
});
