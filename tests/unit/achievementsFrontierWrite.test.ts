import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS_BY_LADDER } from '../../src/core/achievements/catalog';

// LA FRONTERA COMUNITARIA NUNCA RETROCEDE POR UN FALLO DE LECTURA (docs/plan-degradacion-servicios.md, fase 1).
//
// La pantalla de logros calcula qué publicar sobre lo que cree publicado. Si la lectura había fallado (Firestore
// sin cuota de lecturas pero con escrituras, o caído un momento), creía que no había nada, y la escritura pisaba
// con el escalón propio los más altos que la comunidad ya tenía abiertos.

const getDocMock = vi.fn();
const setDocMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));

const { advanceOpenFrontier } = await import('../../src/model/repository/achievementsConfigRepository');

const steps = (ladder: string): string[] => (ACHIEVEMENTS_BY_LADDER.get(ladder) || []).map((def) => def.id);

function publicado(open: Record<string, string>) {
  return { exists: () => true, data: () => ({ open }) };
}

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockClear();
});

describe('advanceOpenFrontier', () => {
  it('si no puede leer lo publicado, no escribe nada', async () => {
    getDocMock.mockRejectedValue(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const [primero] = steps('completados');

    await advanceOpenFrontier({ completados: primero });

    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('escribe la unión con lo leído: un escalón comunitario más alto no baja', async () => {
    const [primero, , tercero] = steps('completados');
    const [primeraResena] = steps('resenas');
    getDocMock.mockResolvedValue(publicado({ completados: tercero }));

    // Lo que llega es lo propio: menos en `completados`, algo nuevo en `resenas`.
    await advanceOpenFrontier({ completados: primero, resenas: primeraResena });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][1]).toEqual({ open: { completados: tercero, resenas: primeraResena } });
  });

  it('si lo propio no adelanta nada a lo publicado, no escribe', async () => {
    const [primero, , tercero] = steps('completados');
    getDocMock.mockResolvedValue(publicado({ completados: tercero }));

    await advanceOpenFrontier({ completados: primero });

    expect(setDocMock).not.toHaveBeenCalled();
  });
});
