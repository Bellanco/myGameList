import { describe, it, expect } from 'vitest';
import { isOwnProfileIdentity } from '../../src/viewmodel/useSocialViewModel';

// P1 (privacidad index-only): la propiedad de un perfil/evento se detecta por IDENTIDAD (uid o profileId),
// no por email. Tolera ambas eras: hoy el id del doc de directorio es el uid; tras el cutover será el profileId.
describe('isOwnProfileIdentity', () => {
  const UID = 'uid-123';
  const PID = 'profile-abc';

  it('reconoce al dueño por uid (era actual: id del doc === uid)', () => {
    expect(isOwnProfileIdentity(UID, UID, PID)).toBe(true);
  });

  it('reconoce al dueño por profileId (era index-only: id del doc === profileId)', () => {
    expect(isOwnProfileIdentity(PID, UID, PID)).toBe(true);
  });

  it('NO reconoce un perfil ajeno (id no coincide ni con uid ni con profileId)', () => {
    expect(isOwnProfileIdentity('otro-uid', UID, PID)).toBe(false);
  });

  it('es robusto ante valores nulos/ausentes', () => {
    expect(isOwnProfileIdentity(null, UID, PID)).toBe(false);
    expect(isOwnProfileIdentity('', UID, PID)).toBe(false);
    expect(isOwnProfileIdentity(UID, null, null)).toBe(false);
    expect(isOwnProfileIdentity(UID, undefined, undefined)).toBe(false);
  });

  it('si solo se ha resuelto el uid (profileId aún null), sigue detectando por uid', () => {
    expect(isOwnProfileIdentity(UID, UID, null)).toBe(true);
    expect(isOwnProfileIdentity(PID, UID, null)).toBe(false);
  });
});
