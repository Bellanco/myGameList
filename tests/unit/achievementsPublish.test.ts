import { beforeEach, describe, expect, it, vi } from 'vitest';

// F3 — PUBLICACIÓN DEL ESPEJO DE LOGROS (`profiles/{uid}.achievements`, §9.1 del plan).
//
// Estos tests existen por un motivo muy concreto: la LLAMADA vive detrás de `ENABLE_ACHIEVEMENTS_PUBLISH`, que
// hoy es `false`, así que el empaquetador se lleva por delante ese bloque y NINGÚN test de pantalla puede
// ejercitarlo. Sin esto, el día que se encienda el interruptor la escritura correría por primera vez en
// producción y sin haberse probado nunca. Aquí se prueba la función directamente, que sí es alcanzable.
//
// Lo que fijan:
//  - la FORMA de lo que se escribe: `{ v, at, list }` bajo `achievements`, más `uid` (lo exigen las reglas) y
//    `updatedAt` (el directorio ordena por él y un doc sin el campo no saldría en la consulta);
//  - que el `merge` no arrase el resto del perfil;
//  - y que sin uid o sin espejo no se escriba nada, que es lo que evita crear un perfil a quien no lo tiene.

const setDocMock = vi.fn(async () => {});

vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
  serverTimestamp: vi.fn(() => '<<serverTimestamp>>'),
  deleteField: vi.fn(() => '<<deleteField>>'),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  findSocialProfileByEmail: vi.fn(),
  getOwnProfileRef: vi.fn(),
  resolveOwnProfile: vi.fn(),
  saveOwnProfileCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: vi.fn(async () => ({})),
  patchLocalMeta: vi.fn(async () => {}),
  seedProfileIdFromRemote: vi.fn(async () => {}),
}));

import { publishAchievementMirror } from '../../src/model/repository/firebaseRepository';
import {
  ACHIEVEMENTS_LIST_MAX,
  MIRROR_VERSION,
  mergeForPublish,
  packAchievements,
  parseMirror,
} from '../../src/core/achievements/pack';
import type { AchievementState } from '../../src/core/achievements/types';

const DIA = 24 * 60 * 60 * 1000;
const estado = (id: string, unlockedAt = 0): AchievementState =>
  ({ id, level: 1, value: 0, next: null, unlockedAt });
const ids = (mirror: string) => parseMirror(mirror).map((item) => item.id).sort();

describe('publicación del espejo de logros', () => {
  beforeEach(() => {
    setDocMock.mockClear();
  });

  it('escribe el espejo en el perfil, con su versión de gramática y su sello', async () => {
    await publishAchievementMirror('uid-1', '2:AAAA~1.2');

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = setDocMock.mock.calls[0] as unknown as [
      { path: string; id: string },
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(ref).toEqual({ path: 'profiles', id: 'uid-1' });
    // MERGE, siempre: este documento lleva el nick, la foto y el rango de su dueño, y publicar la vitrina no
    // puede llevárselos por delante.
    expect(options).toEqual({ merge: true });

    const mirror = payload.achievements as { v: number; at: number; list: string };
    expect(mirror.list).toBe('2:AAAA~1.2');
    expect(mirror.v).toBe(MIRROR_VERSION);
    expect(mirror.at).toBeGreaterThan(0);
    // `uid` lo exige la regla; `updatedAt` es de facto obligatorio o el perfil se cae de la consulta.
    expect(payload.uid).toBe('uid-1');
    expect(payload.updatedAt).toBe('<<serverTimestamp>>');
  });

  /**
   * NO SE ESCRIBE NADA SIN ESPEJO NI SIN UID. Es la guarda que impide que un `merge` cree un documento de perfil
   * a quien nunca abrió el social: sería publicarle una presencia que no ha pedido.
   */
  it('no escribe sin uid ni con el espejo vacío', async () => {
    await publishAchievementMirror('', '2:AAAA');
    await publishAchievementMirror('uid-1', '');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  /**
   * EL TOPE DE LA CADENA es el mismo número en el empaquetador y en la regla de Firestore. Si alguien sube uno de
   * los dos y se olvida del otro, la publicación empieza a fallar con `permission-denied` en silencio.
   */
  it('el tope del empaquetado es el que valida la regla', () => {
    expect(ACHIEVEMENTS_LIST_MAX).toBe(1024);
  });
});

/**
 * LO CONSEGUIDO NO SE DEVUELVE (§5.5), Y EL ESPEJO ES UNO POR CUENTA.
 *
 * La marca de agua que protege un logro es de DISPOSITIVO (`ACHIEVEMENTS_PEAK_KEY`, localStorage), pero el espejo
 * lo puede reescribir cualquiera de tus aparatos. Sin unir con lo publicado, bastaba con abrir la app en el móvil
 * —con la biblioteca a medio sincronizar, o en un navegador recién estrenado— para que el espejo se recalculara
 * más pequeño y le borrara medallas a tu vitrina delante de tus amistades.
 */
describe('el espejo publicado nunca encoge', () => {
  it('une lo publicado con lo que ve este dispositivo, en vez de reemplazarlo', () => {
    const publicado = packAchievements([estado('completados-10'), estado('completados-25'), estado('horas-10')]);
    // Un aparato que solo ve parte de la biblioteca y, además, aporta uno nuevo.
    const enEsteAparato = [estado('completados-10'), estado('resenas-5')];

    const resultado = mergeForPublish(publicado, enEsteAparato);

    expect(ids(resultado)).toEqual(['completados-10', 'completados-25', 'horas-10', 'resenas-5']);
  });

  it('sin nada publicado todavía, publica lo de este dispositivo tal cual', () => {
    expect(ids(mergeForPublish('', [estado('completados-10')]))).toEqual(['completados-10']);
    // Y una cadena ilegible se trata como «no hay nada», no como un error.
    expect(ids(mergeForPublish('basura', [estado('completados-10')]))).toEqual(['completados-10']);
  });

  /**
   * LA FECHA VERDADERA ES LA MÁS ANTIGUA. Un dispositivo que llegó tarde a la biblioteca deduce sellos
   * posteriores, y dejarle pisar el bueno movería la medalla de día en la vitrina de todo el mundo.
   *
   * Se compara por DÍA y no por instante porque es lo único que el espejo guarda: un sello al minuto diría a qué
   * horas usas la app, así que la gramática almacena días desde 2020 y el parser devuelve el mediodía.
   */
  it('se queda con la fecha más antigua de las dos, y un 0 nunca pisa a una fecha real', () => {
    const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const antiguo = Date.UTC(2021, 5, 1);
    const tardio = Date.UTC(2024, 5, 1);

    const conAntigua = mergeForPublish(packAchievements([estado('completados-10', antiguo)]), [estado('completados-10', tardio)]);
    expect(dia(parseMirror(conAntigua)[0].unlockedAt)).toBe('2021-06-01');

    // Y al revés: si lo publicado no traía fecha, la del dispositivo la aporta.
    const sinFecha = mergeForPublish(packAchievements([estado('completados-10', 0)]), [estado('completados-10', tardio)]);
    expect(dia(parseMirror(sinFecha)[0].unlockedAt)).toBe('2024-06-01');
    // Un dispositivo sin fecha tampoco borra la que había.
    const noPisa = mergeForPublish(packAchievements([estado('completados-10', antiguo)]), [estado('completados-10', 0)]);
    expect(dia(parseMirror(noPisa)[0].unlockedAt)).toBe('2021-06-01');
  });

  /**
   * LOS DESTACADOS SON UNA PREFERENCIA DEL DUEÑO y puede haberla elegido en otro aparato, que este no conoce.
   * Descartarlos haría que cambiar de móvil te deshiciera la vitrina.
   */
  it('conserva los destacados que ya estaban publicados', () => {
    const publicado = packAchievements([estado('completados-10'), estado('horas-10')], ['horas-10']);
    const resultado = mergeForPublish(publicado, [estado('completados-10')]);
    expect(parseMirror(resultado).find((item) => item.id === 'horas-10')?.featured).toBe(true);
  });

  /** Publicar dos veces seguidas con los mismos datos da la MISMA cadena: si no, se reescribiría en cada sesión. */
  it('es estable: volver a unir lo ya publicado no cambia nada', () => {
    const estados = [estado('completados-10', Date.UTC(2023, 0, 2) + DIA)];
    const primera = mergeForPublish('', estados);
    expect(mergeForPublish(primera, estados)).toBe(primera);
  });
});

/**
 * UN ESPEJO SIN LOGROS NO ES LA CADENA VACÍA. Son 45 caracteres de ceros, porque el bitmap ocupa lo mismo esté
 * lleno o vacío. Es una trampa fácil: un `if (!mirror)` da por bueno ese espejo y publica una vitrina vacía en
 * Firestore para cada usuario nuevo del social. Quien decide si hay algo que publicar mira los ESTADOS.
 */
describe('el espejo vacío', () => {
  it('no es falsy, así que no se puede usar como guarda', () => {
    const vacio = packAchievements([]);
    expect(vacio.length).toBeGreaterThan(0);
    expect(parseMirror(vacio)).toEqual([]);
    // La comprobación honesta es sobre los estados: ninguno conseguido = nada que publicar.
    expect([estado('completados-10', 0), { ...estado('horas-10'), level: 0 }].some((s) => s.level >= 1)).toBe(true);
    expect([{ ...estado('horas-10'), level: 0 }].some((s) => s.level >= 1)).toBe(false);
  });
});
