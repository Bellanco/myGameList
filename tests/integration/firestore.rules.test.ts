import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Test de integración: requiere el emulador de Firestore. Ejecutar con `npm run test:rules`.
// Valida las reglas REALES desplegables (perfiles, privateConfig/userMap solo-dueño, admin, catch-all).

describe('firestore.rules', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'mygamelist-rules-test',
      firestore: {
        rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'),
      },
    });
  });
  afterEach(async () => { await env.clearFirestore(); });
  afterAll(async () => { await env.cleanup(); });

  const ADMIN = { sub: 'admin-uid', email: 'bellanco3@gmail.com', email_verified: true };
  const ownerDb = (uid: string) => env.authenticatedContext(uid).firestore();
  const adminDb = () => env.authenticatedContext(ADMIN.sub, { email: ADMIN.email, email_verified: true }).firestore();
  const anonDb = () => env.unauthenticatedContext().firestore();

  async function seed(path: string, id: string, data: Record<string, unknown>) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), path, id), data);
    });
  }

  describe('profiles', () => {
    it('el dueño y un autenticado pueden leer un perfil social.enabled; el anónimo no', async () => {
      await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });
      await assertSucceeds(getDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a')));
      await assertSucceeds(getDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a')));
      await assertFails(getDoc(doc(anonDb(), 'profiles', 'uid-a')));
    });

    it('un perfil no social solo lo lee su dueño (o admin)', async () => {
      await seed('profiles', 'uid-priv', { uid: 'uid-priv', social: { enabled: false } });
      await assertSucceeds(getDoc(doc(ownerDb('uid-priv'), 'profiles', 'uid-priv')));
      await assertFails(getDoc(doc(ownerDb('uid-other'), 'profiles', 'uid-priv')));
    });

    it('el dueño escribe su perfil con uid coincidente; con uid distinto se deniega', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', social: { enabled: true } }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-b', social: { enabled: true } }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-b'), { uid: 'uid-b', social: { enabled: true } }));
    });
  });

  describe('privateConfig (solo dueño)', () => {
    it('el dueño lee/escribe; otros y anónimo no', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a'), { profileId: 'p', encryptedGithubToken: 'x' }));
      await assertSucceeds(getDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a')));
      await assertFails(getDoc(doc(ownerDb('uid-b'), 'privateConfig', 'uid-a')));
      await assertFails(getDoc(doc(anonDb(), 'privateConfig', 'uid-a')));
    });
  });

  describe('userMap (solo dueño)', () => {
    it('el dueño lee/escribe; otros no', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'userMap', 'uid-a'), { profileId: 'p-a' }));
      await assertFails(getDoc(doc(ownerDb('uid-b'), 'userMap', 'uid-a')));
    });
  });

  describe('recommendations (solo admin)', () => {
    it('admin escribe/lee; un usuario normal no', async () => {
      await assertSucceeds(setDoc(doc(adminDb(), 'recommendations', 'r1'), { toEmail: 'x@y.z' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'recommendations', 'r2'), { toEmail: 'x@y.z' }));
      await assertFails(getDoc(doc(ownerDb('uid-a'), 'recommendations', 'r1')));
    });
  });

  describe('catch-all', () => {
    it('deniega cualquier otra colección', async () => {
      await assertFails(getDoc(doc(ownerDb('uid-a'), 'whatever', 'x')));
    });
  });
});
