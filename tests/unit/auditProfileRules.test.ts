import { describe, expect, it } from 'vitest';
import { auditFriendship, auditProfile, LIMITS } from '../../scripts/lib/profile-rules-predicates.mjs';
// El fichero de reglas entra como TEXTO vía `?raw` (lo resuelve Vite). Así este test no usa ninguna API de Node y
// puede vivir dentro del typecheck, que no tiene `@types/node`.
import rules from '../../firestore.rules?raw';

/**
 * `scripts/audit-profile-rules.mjs` es la auditoría que se pasa a los datos de PRODUCCIÓN antes de desplegar
 * `firestore.rules`, para saber si algún documento real dejaría a su dueño sin poder guardar. Su valor depende
 * por completo de que sus predicados digan lo MISMO que las reglas: una auditoría que aprueba lo que las reglas
 * rechazan es peor que no tenerla, porque da vía libre al despliegue.
 *
 * De ahí estos tests: los mismos casos que los de emulador (`tests/integration/firestore.rules.test.ts`), más la
 * comprobación de que los límites numéricos coinciden literalmente con los del fichero de reglas.
 */

const big = (n: number) => 'x'.repeat(n);
const perfilValido = () => ({ uid: 'uid-a', social: { enabled: true } }) as Record<string, unknown>;

describe('auditoría previa al despliegue de reglas', () => {
  it('los límites del script son los mismos que exigen las reglas', () => {
    expect(rules).toContain(`request.resource.data.displayName.size() <= ${LIMITS.displayName}`);
    expect(rules).toContain(`request.resource.data.profileId.size() <= ${LIMITS.profileId}`);
    expect(rules).toContain(`request.resource.data.email.size() <= ${LIMITS.email}`);
    expect(rules).toContain(`request.resource.data.photoURL.size() <= ${LIMITS.photoURL}`);
    expect(rules).toContain(`request.resource.data.social.etag.size() <= ${LIMITS.etag}`);
    expect(rules).toContain(`request.resource.data.social.gistId.size() <= ${LIMITS.gistId}`);
  });

  describe('perfiles', () => {
    it('aprueba las formas legítimas, incluidas las legacy y las de serverTimestamp', () => {
      expect(auditProfile(perfilValido())).toEqual([]);
      expect(auditProfile({
        schemaVersion: 1, uid: 'uid-a', profileId: 'pid', displayName: 'Ada Lovelace',
        photoURL: 'https://lh3.googleusercontent.com/a/foto', social: { enabled: true, etag: null },
        updatedAt: 1, createdAt: 1000, tier: 'gold',
      })).toEqual([]);
      // Legacy: email y restos en `social` que las escrituras nuevas ya no mandan.
      expect(auditProfile({
        uid: 'uid-a', email: 'legacy@example.com', photoURL: '',
        social: { enabled: true, gistId: 'gs', gamesGistId: 'gg', githubToken: 'ghp_x' },
      })).toEqual([]);
      // `updatedAt` como Timestamp del Admin SDK (tiene toMillis), no como número.
      expect(auditProfile({ uid: 'uid-a', updatedAt: { toMillis: () => 1 } })).toEqual([]);
    });

    it('detecta lo que la validación C7 rechazaría', () => {
      const motivos = (d: Record<string, unknown>) => auditProfile(d).map((p) => p.motivo).join(' | ');

      expect(motivos({ ...perfilValido(), displayName: big(121) })).toMatch(/displayName/);
      expect(motivos({ ...perfilValido(), displayName: 123 })).toMatch(/displayName/);
      expect(motivos({ ...perfilValido(), profileId: big(129) })).toMatch(/profileId/);
      expect(motivos({ ...perfilValido(), email: big(321) })).toMatch(/email/);
      expect(motivos({ ...perfilValido(), schemaVersion: 'uno' })).toMatch(/schemaVersion/);
      expect(motivos({ ...perfilValido(), updatedAt: 'ayer' })).toMatch(/updatedAt/);
      expect(motivos({ ...perfilValido(), photoURL: 'javascript:alert(1)' })).toMatch(/no es https/);
      expect(motivos({ ...perfilValido(), photoURL: 'http://insegura.example/f' })).toMatch(/no es https/);
      expect(motivos({ ...perfilValido(), photoURL: `https://x.example/${big(512)}` })).toMatch(/photoURL/);
      expect(motivos({ uid: 'uid-a', social: { enabled: 'sí' } })).toMatch(/social\.enabled/);
      expect(motivos({ uid: 'uid-a', social: { enabled: true, etag: big(257) } })).toMatch(/social\.etag/);
      expect(motivos({ uid: 'uid-a', social: { enabled: true, gistId: big(129) } })).toMatch(/social\.gistId/);
      expect(motivos({ uid: 'uid-a', social: 'no soy un mapa' })).toMatch(/social no es un mapa/);
    });

    // Los campos fuera de la allowlist ya se rechazaban ANTES de C7: hay que informarlos, pero distinguiéndolos,
    // para que nadie crea que este despliegue los rompe.
    it('marca como pre-existente lo que ya rechazaba la allowlist de claves', () => {
      const problemas = auditProfile({ ...perfilValido(), campoInventado: 'x' });
      expect(problemas).toHaveLength(1);
      expect(problemas[0].nuevo).toBe(false);
      expect(problemas[0].motivo).toMatch(/allowlist/);
    });
  });

  describe('amistades', () => {
    it('aprueba las formas legítimas y admite nulos de clientes antiguos', () => {
      expect(auditFriendship({
        users: ['a', 'b'], requester: 'a', recipient: 'b', status: 'accepted',
        requesterName: 'Ada', requesterPhoto: 'https://lh3.googleusercontent.com/a/f',
        requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
      })).toEqual([]);
      expect(auditFriendship({ recipientName: null, recipientPhoto: null, recipientSocialGistId: null })).toEqual([]);
      expect(auditFriendship({ requesterPhoto: '' })).toEqual([]);
    });

    it('detecta los campos denormalizados que bloquearían a LAS DOS partes', () => {
      const motivos = (d: Record<string, unknown>) => auditFriendship(d).map((p) => p.motivo).join(' | ');
      expect(motivos({ requesterPhoto: 'javascript:alert(1)' })).toMatch(/requesterPhoto no es https/);
      expect(motivos({ recipientPhoto: 'http://x.example/f' })).toMatch(/recipientPhoto no es https/);
      expect(motivos({ requesterName: big(121) })).toMatch(/requesterName/);
      expect(motivos({ recipientSocialGistId: big(129) })).toMatch(/recipientSocialGistId/);
      expect(motivos({ requesterGamesGistId: 42 })).toMatch(/requesterGamesGistId/);
    });
  });
});
