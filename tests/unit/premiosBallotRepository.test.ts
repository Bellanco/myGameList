import { describe, expect, it, vi } from 'vitest';
import { buildBallot } from '../../src/model/repository/premios/premiosBallotRepository';
import type { PremiosOption } from '../../src/model/types/premios';

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: async () => ({ firestore: {}, auth: {}, app: {}, analytics: null }),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn(), getDoc: vi.fn() }));

const author = { uid: 'uid-1', displayName: 'Diego', profileId: 'p-diego' };

const userVotes: Record<string, PremiosOption> = {
  cat1: { id: 'cat1_option_0', name: 'Elden Ring' },
  cat2: { id: 'cat2_option_3', name: 'Hades II' },
};

describe('buildBallot', () => {
  // Es lo que hace el voto independiente del idioma y resistente a que se corrija el texto de un nominado.
  it('guarda las selecciones por optionId, no por nombre', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'Diego', season: 2026 });
    expect(ballot.selections).toEqual({ cat1: 'cat1_option_0', cat2: 'cat2_option_3' });
  });

  it('usa el nombre de la cuenta como apodo y el elegido como nombre visible', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'Otro', season: 2026 });
    expect(ballot.userNickname).toBe('Diego');
    expect(ballot.userDisplayName).toBe('Otro');
  });

  it('cae al nombre elegido si la cuenta no tiene ninguno', () => {
    const ballot = buildBallot({
      author: { ...author, displayName: null },
      userVotes,
      displayName: 'Anónimo',
      season: 2026,
    });
    expect(ballot.userNickname).toBe('Anónimo');
  });

  // EL PSEUDÓNIMO es lo único que sobrevive al archivar: sin él, la fila de la clasificación no podría
  // reconocerse ni enlazar a ningún perfil (ver docs/plan-unificar-premios.md §4.1).
  it('lleva el pseudónimo del perfil, y lo omite si la cuenta todavía no tiene', () => {
    expect(buildBallot({ author, userVotes, displayName: 'D', season: 2026 }).profileId).toBe('p-diego');

    const sinPerfil = buildBallot({
      author: { uid: 'uid-2', displayName: 'Sin perfil' },
      userVotes,
      displayName: 'D',
      season: 2026,
    });
    expect('profileId' in sinPerfil).toBe(false);
  });

  // DECISIÓN DEL 20-09-2026: los correos se purgaron de Firestore y no vuelven por esta puerta.
  it('NO guarda el correo de quien vota', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026 }) as unknown as Record<string, unknown>;
    expect('userEmail' in ballot).toBe(false);
  });

  it('manda la temporada como entero, que es lo que exigen las reglas', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026.9 });
    expect(ballot.season).toBe(2026);
    expect(Number.isInteger(ballot.season)).toBe(true);
  });

  it('recorta el nombre elegido al tope que aceptan las reglas', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'N'.repeat(120), season: 2026 });
    expect(ballot.userDisplayName?.length).toBe(50);
  });

  it('escribe exactamente el esquema que validan las reglas: ni un campo de más ni de menos', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026 });

    expect(Object.keys(ballot).sort()).toEqual(
      [
        'editCount',
        'isActive',
        'profileId',
        'season',
        'selections',
        'submittedAt',
        'updatedAt',
        'userDisplayName',
        'userId',
        'userNickname',
      ].sort(),
    );
    expect(ballot.isActive).toBe(true);
    expect(Number.isNaN(Date.parse(ballot.submittedAt as string))).toBe(false);
  });

  it('el envío inicial arranca el contador a cero', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026 });
    expect(ballot.editCount).toBe(0);
    expect(ballot.updatedAt).toBe(ballot.submittedAt);
  });
});

describe('buildBallot al corregir un voto ya emitido', () => {
  const existingBallot = { userId: 'uid-1', selections: {}, submittedAt: '2026-06-01T10:00:00.000Z', editCount: 2 };

  // Es exactamente lo que comprueban las reglas: el anterior más uno, nunca un salto.
  it('avanza el contador de uno en uno', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026, existingBallot });
    expect(ballot.editCount).toBe(3);
  });

  // `submittedAt` es inmutable en las reglas: cambiarlo tumbaría la corrección entera.
  it('conserva la fecha del primer envío y sella la de la corrección', () => {
    const ballot = buildBallot({ author, userVotes, displayName: 'D', season: 2026, existingBallot });
    expect(ballot.submittedAt).toBe(existingBallot.submittedAt);
    expect(ballot.updatedAt).not.toBe(existingBallot.submittedAt);
  });

  it('trata una papeleta antigua sin contador como si tuviera cero correcciones', () => {
    const ballot = buildBallot({
      author,
      userVotes,
      displayName: 'D',
      season: 2026,
      existingBallot: { userId: 'uid-1', selections: {}, submittedAt: '2026-06-01T10:00:00.000Z' },
    });
    expect(ballot.editCount).toBe(1);
  });
});
