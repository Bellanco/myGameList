import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LO QUE SE ARCHIVA TIENE QUE SALIR DE FIRESTORE, no de quien llama.
 *
 * El fallo que esto fija: el panel carga las papeletas y las categorías UNA vez al montarse y se las pasaba al
 * servicio. Con una pestaña abierta desde la edición anterior, publicar la siguiente archivaba la clasificación
 * de la anterior —los mismos votantes, las mismas opciones— aunque en la base de datos hubiera otra cosa.
 *
 * La base de datos se simula entera: es la única forma de comprobar un flujo destructivo (publicar borra las
 * papeletas) sin un emulador, y lo que de verdad se prueba es el ORDEN y el CONTENIDO de lo que se escribe.
 */

interface Registro {
  id: string;
  data: Record<string, unknown>;
}

const state: {
  premiosBallots: Registro[];
  premiosCategories: Registro[];
  premiosResults: Registro[];
  profiles: Registro[];
  config: Record<string, unknown> | null;
  sets: Array<{ path: string; data: Record<string, unknown> }>;
  updates: Array<{ path: string; data: Record<string, unknown> }>;
  deletes: string[];
  clearedWinners: number;
} = {
  premiosBallots: [],
  premiosCategories: [],
  premiosResults: [],
  profiles: [],
  config: null,
  sets: [],
  updates: [],
  deletes: [],
  clearedWinners: 0,
};

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: async () => ({ firestore: {}, auth: {}, app: {}, analytics: null }),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}`, id }),
  collection: (_db: unknown, name: string) => ({ name }),
  getDocs: async (ref: { name: keyof typeof state }) => ({
    docs: ((state[ref.name] as Registro[]) || []).map((entry) => ({
      id: entry.id,
      ref: { path: `${ref.name}/${entry.id}`, id: entry.id },
      data: () => entry.data,
    })),
  }),
  getDoc: async (ref: { path: string }) => {
    // Los perfiles salen de su propia lista: la concesión de trofeos los lee uno a uno.
    if (ref.path.startsWith('profiles/')) {
      const id = ref.path.split('/')[1];
      const perfil = state.profiles.find((p) => p.id === id);
      return { exists: () => Boolean(perfil), data: () => perfil?.data, ref };
    }
    return {
      exists: () => ref.path === 'premiosConfig/voting' && state.config !== null,
      data: () => state.config,
      ref,
    };
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    state.sets.push({ path: ref.path, data });
    if (ref.path === 'premiosConfig/voting') state.config = { ...(state.config || {}), ...data };
  },
  deleteDoc: async (ref: { path: string }) => {
    state.deletes.push(ref.path);
    const [collectionName, id] = ref.path.split('/');
    const bucket = state[collectionName as keyof typeof state];
    if (Array.isArray(bucket)) {
      (state as Record<string, unknown>)[collectionName] = (bucket as Registro[]).filter((e) => e.id !== id);
    }
  },
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    state.updates.push({ path: ref.path, data });
  },
  writeBatch: () => ({
    delete: (ref: { path: string }) => state.deletes.push(ref.path),
    update: (ref: { path: string }, data: Record<string, unknown>) => state.updates.push({ path: ref.path, data }),
    commit: async () => {},
  }),
  serverTimestamp: () => '__serverTimestamp__',
}));

// Los ganadores tienen sus propias pruebas; aquí solo importa que la publicación los pida y los retire.
vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ({ cat1: 'cat1_option_0' }),
  clearWinners: async () => {
    state.clearedWinners += 1;
  },
  clearLegacyWinnerField: async () => 0,
}));

const { deleteSeasonResult, openSeason, publishAndArchiveSeason } = await import(
  '../../src/model/repository/premios/premiosSeasonRepository'
);

/** Categoría votable, tal y como vive en Firestore. */
const category = (id: string): Registro => ({
  id,
  data: {
    title: { es: 'Juego del año', en: 'Game of the year' },
    options: [
      { id: `${id}_option_0`, name: 'Juego A' },
      { id: `${id}_option_1`, name: 'Juego B' },
    ],
    weight: 1,
    orderIndex: 0,
    isActive: true,
  },
});

/** Papeleta de un votante. */
const ballot = (uid: string, nickname: string, optionId: string, profileId = `p-${uid}`): Registro => ({
  id: uid,
  data: {
    userId: uid,
    profileId,
    userDisplayName: nickname,
    selections: { cat1: optionId },
    season: 2026,
    isActive: true,
  },
});

const lastResultsWrite = () => state.sets.filter((s) => s.path.startsWith('premiosResults/')).pop();
const lastConfigWrite = () => state.sets.filter((s) => s.path === 'premiosConfig/voting').pop();

beforeEach(() => {
  state.profiles = [];
  state.premiosBallots = [];
  state.premiosCategories = [];
  state.premiosResults = [];
  state.config = null;
  state.sets = [];
  state.updates = [];
  state.deletes = [];
  state.clearedWinners = 0;
});

describe('publishAndArchiveSeason', () => {
  it('archiva las papeletas que hay en Firestore al publicar', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];

    const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'nuevo-test', seasonName: 'Nuevo test' });

    const archived = lastResultsWrite();
    expect(archived?.path).toBe('premiosResults/nuevo-test');
    expect(archived?.data.totalBallots).toBe(1);
    expect(result.totalBallots).toBe(1);
  });

  it('no arrastra la clasificación de la edición anterior', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0'), ballot('uid-2', 'Bea', 'cat1_option_1')];
    await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });
    expect(lastResultsWrite()?.data.totalBallots).toBe(2);

    // Publicar retira las papeletas: la siguiente edición empieza vacía.
    state.premiosBallots = [ballot('uid-3', 'Carlos', 'cat1_option_0')];
    await publishAndArchiveSeason({ season: 2027, seasonId: 'nuevo-test', seasonName: 'Nuevo test' });

    const archived = lastResultsWrite();
    expect(archived?.data.totalBallots).toBe(1);
    expect((archived?.data.leaderboard as Array<{ nickname: string }>).map((e) => e.nickname)).toEqual(['Carlos']);
  });

  it('retira exactamente las papeletas que acaba de archivar', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0'), ballot('uid-2', 'Bea', 'cat1_option_1')];

    const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'test' });

    expect(state.deletes).toEqual(['premiosBallots/uid-1', 'premiosBallots/uid-2']);
    expect(result.deleted).toBe(2);
    expect(lastResultsWrite()?.data.totalBallots).toBe(result.deleted);
  });

  // EL ARCHIVO ES PÚBLICO: no puede llevar el identificador real de ninguna cuenta, ni su foto.
  it('publica la clasificación sin uid y sin foto, con el pseudónimo en su lugar', async () => {
    state.premiosCategories = [category('cat1')];
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0', 'p-ana')];

    await publishAndArchiveSeason({ season: 2026, seasonId: 'test' });

    const [entry] = lastResultsWrite()?.data.leaderboard as Array<Record<string, unknown>>;
    expect(entry.userId).toBeUndefined();
    expect(entry.photoURL).toBeUndefined();
    expect(entry.profileId).toBe('p-ana');
    expect(entry.nickname).toBe('Ana');
  });

  it('deja la configuración sin edición y apuntando al archivo publicado', async () => {
    state.premiosCategories = [category('cat1')];

    await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });

    const config = lastConfigWrite();
    expect(config?.data.closesAtMillis).toBeNull();
    expect(config?.data.lastPublishedId).toBe('test');
    expect(config?.data.season).toBe(2027);
  });

  it('vacía los nominados sin borrar las categorías', async () => {
    // Las categorías se mantienen año a año; lo que cambia son sus nominados, que ya quedaron archivados.
    state.premiosCategories = [category('cat1')];

    const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'test' });

    expect(result.cleared).toBe(1);
    expect(state.deletes.some((path) => path.startsWith('premiosCategories/'))).toBe(false);
    expect(state.updates.some((u) => u.path === 'premiosCategories/cat1')).toBe(true);
  });
});

  // EL TROFEO SE CONCEDE AL PUBLICAR, y va al PERFIL de cada premiado: es un logro especial suyo, no un adorno de
  // la pantalla de resultados. El archivo publicado no puede llevar el uid, así que esto tiene que ocurrir antes
  // de retirar las papeletas, que es de donde sale.
  describe('trofeos del palmarés', () => {
    it('concede el trofeo a los cinco primeros puestos, en su perfil', async () => {
      state.premiosCategories = [category('cat1')];
      state.premiosBallots = [
        ballot('uid-1', 'Ana', 'cat1_option_0'),
        ballot('uid-2', 'Bea', 'cat1_option_1'),
      ];
      state.profiles = [
        { id: 'uid-1', data: { uid: 'uid-1' } },
        { id: 'uid-2', data: { uid: 'uid-2' } },
      ];

      const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });

      expect(result.awarded).toBe(2);
      const trofeo = state.sets.find((s) => s.path === 'profiles/uid-1');
      const palmares = trofeo?.data.palmares as Array<Record<string, unknown>>;
      expect(palmares[0]).toMatchObject({ seasonId: 'test', seasonName: 'Test', rank: 1 });
    });

    it('sustituye el trofeo de esa misma edición en vez de duplicarlo', async () => {
      state.premiosCategories = [category('cat1')];
      state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];
      state.profiles = [
        {
          id: 'uid-1',
          data: {
            uid: 'uid-1',
            palmares: [
              { seasonId: 'test', seasonName: 'Antiguo', rank: 4, awardedAt: 1 },
              { seasonId: 'otra', seasonName: 'Otra', rank: 2, awardedAt: 1 },
            ],
          },
        },
      ];

      await publishAndArchiveSeason({ season: 2026, seasonId: 'test', seasonName: 'Test' });

      const palmares = state.sets.find((s) => s.path === 'profiles/uid-1')?.data.palmares as Array<{
        seasonId: string;
        rank: number;
      }>;
      expect(palmares).toHaveLength(2);
      expect(palmares.find((e) => e.seasonId === 'test')).toMatchObject({ rank: 1 });
      expect(palmares.find((e) => e.seasonId === 'otra')).toMatchObject({ rank: 2 });
    });

    it('un perfil que ya no existe no impide publicar ni premiar al resto', async () => {
      state.premiosCategories = [category('cat1')];
      state.premiosBallots = [
        ballot('uid-1', 'Ana', 'cat1_option_0'),
        ballot('uid-2', 'Bea', 'cat1_option_1'),
      ];
      // Solo queda el perfil de la segunda.
      state.profiles = [{ id: 'uid-2', data: { uid: 'uid-2' } }];

      const result = await publishAndArchiveSeason({ season: 2026, seasonId: 'test' });

      expect(result.awarded).toBe(1);
      expect(result.totalBallots).toBe(2);
    });
  });

describe('openSeason', () => {
  // Solo se abre una edición cuando no hay ninguna en marcha, así que lo que quede es un resto: contaminaría la
  // clasificación nueva y sus dueños no podrían votar por el bloqueo de re-voto.
  it('retira las papeletas sueltas de una edición anterior', async () => {
    state.premiosBallots = [ballot('uid-1', 'Ana', 'cat1_option_0')];

    const result = await openSeason({ name: 'Porra de invierno', closesDay: '2026-12-31', season: 2026 });

    expect(result.leftovers).toBe(1);
    expect(state.deletes).toEqual(['premiosBallots/uid-1']);
    expect(state.clearedWinners).toBe(1);
  });

  it('no toca nada si la mesa ya está limpia', async () => {
    const result = await openSeason({ name: 'Test', closesDay: '2026-12-31', season: 2026 });

    expect(result.leftovers).toBe(0);
    expect(state.deletes).toEqual([]);
    expect(state.clearedWinners).toBe(0);
  });

  it('abre con su par de fechas y el id derivado del nombre', async () => {
    const result = await openSeason({ name: 'Nuevo test', closesDay: '2026-12-31', season: 2026 });

    expect(result.seasonId).toBe('nuevo-test');
    const config = lastConfigWrite();
    expect(config?.data.isOpen).toBe(true);
    expect(config?.data.closesAt).toBeTruthy();
    expect(typeof config?.data.closesAtMillis).toBe('number');
  });

  it('se niega a abrir sin fecha de cierre', async () => {
    await expect(openSeason({ name: 'Sin fecha', closesDay: '', season: 2026 })).rejects.toThrow();
  });
});

describe('deleteSeasonResult', () => {
  const archivo = (id: string, season: number): Registro => ({ id, data: { season, name: id } });

  it('borra el archivo de la edición', async () => {
    state.premiosResults = [archivo('test', 2026)];
    state.config = { lastPublishedId: '' };

    const result = await deleteSeasonResult('test');

    // El archivo y, con él, el registro privado de a quién se le concedió el trofeo: borrar del histórico borra
    // la edición entera (el logro de los perfiles lo cubre `premiosPalmaresRepository.test`).
    expect(state.deletes).toEqual(['premiosAdmin/palmares-test', 'premiosResults/test']);
    expect(result.wasPublished).toBe(false);
  });

  // Sin esto, la configuración seguiría nombrando un archivo que ya no existe y los resultados públicos se
  // quedarían pidiendo un hueco.
  it('reapunta la pantalla pública a la edición anterior si borra la publicada', async () => {
    state.premiosResults = [archivo('test', 2026), archivo('porra-2025', 2025)];
    state.config = { lastPublishedId: 'test' };

    const result = await deleteSeasonResult('test');

    expect(result.wasPublished).toBe(true);
    expect(result.lastPublishedId).toBe('porra-2025');
    expect(lastConfigWrite()?.data.lastPublishedId).toBe('porra-2025');
  });

  it('deja la pantalla pública sin nada si era la única edición', async () => {
    state.premiosResults = [archivo('test', 2026)];
    state.config = { lastPublishedId: 'test' };

    expect((await deleteSeasonResult('test')).lastPublishedId).toBe('');
    expect(lastConfigWrite()?.data.lastPublishedId).toBe('');
  });

  it('no toca la configuración si la edición borrada no era la publicada', async () => {
    state.premiosResults = [archivo('test', 2026), archivo('porra-2025', 2025)];
    state.config = { lastPublishedId: 'porra-2025' };

    await deleteSeasonResult('test');

    expect(state.sets.filter((s) => s.path === 'premiosConfig/voting')).toHaveLength(0);
  });
});
