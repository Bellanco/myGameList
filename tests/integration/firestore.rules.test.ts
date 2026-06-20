import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// Test de integración: requiere el emulador de Firestore. Ejecutar con `npm run test:rules`.
// Excluido de `npm run test`/`test:all` y de tsc (tests/integration).

describe('firestore.rules (modelo destino index-only)', () => {
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

  // Tiempo REAL: las reglas comparan expiresAt/autoExpireAt contra request.time del emulador (ahora real).
  const now = () => Date.now();
  const publicProfile = {
    profileId: 'p-abc', displayName: 'Bellanco', socialGistId: 'g1', private: false,
    consent: { agreedAt: now(), autoExpireAt: now() + 86_400_000 }, updatedAt: now(),
  };

  async function seedOwnerMapping() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'userMap', 'uid-abc'), { profileId: 'p-abc' });
      await setDoc(doc(ctx.firestore(), 'profiles', 'p-abc'), publicProfile);
    });
  }

  it('userMap: lectura/escritura denegada incluso autenticado', async () => {
    const db = env.authenticatedContext('uid-abc').firestore();
    await assertFails(getDoc(doc(db, 'userMap', 'uid-abc')));
    await assertFails(setDoc(doc(db, 'userMap', 'uid-abc'), { profileId: 'x' }));
  });

  it('privateConfig: solo el dueño lee/escribe', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'privateConfig', 'uid-abc'), { profileId: 'p-abc', gamesGistId: 'g', socialGistId: 's' });
    });
    await assertSucceeds(getDoc(doc(env.authenticatedContext('uid-abc').firestore(), 'privateConfig', 'uid-abc')));
    await assertFails(getDoc(doc(env.authenticatedContext('uid-other').firestore(), 'privateConfig', 'uid-abc')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'privateConfig', 'uid-abc')));
  });

  it('profiles: lectura pública si no privado y consentimiento vigente', async () => {
    await seedOwnerMapping();
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'profiles', 'p-abc')));
  });

  it('profiles: deniega lectura si consentimiento caducado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'profiles', 'p-exp'), { ...publicProfile, profileId: 'p-exp', consent: { agreedAt: now(), autoExpireAt: now() - 1000 } });
    });
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'profiles', 'p-exp')));
  });

  it('profiles: deniega escritura con campos privados (githubToken/uid)', async () => {
    await seedOwnerMapping();
    const db = env.authenticatedContext('uid-abc').firestore();
    await assertFails(updateDoc(doc(db, 'profiles', 'p-abc'), { githubToken: 'secreto' }));
    await assertFails(updateDoc(doc(db, 'profiles', 'p-abc'), { uid: 'uid-abc' }));
  });

  it('feed: lectura anónima de tarjeta activa; create con review denegado', async () => {
    const card = {
      reviewId: 'p-abc:1:r', profileId: 'p-abc', displayName: 'B', avatarHash: 'h', socialGistId: 'g1',
      gameId: 1, gameName: 'X', genres: ['RPG'], rating: 5, snippet: 'corto', status: 'active',
      createdAt: now(), updatedAt: now(), expiresAt: now() + 86_400_000,
    };
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'feed', 'p-abc:1:r'), card);
      await setDoc(doc(ctx.firestore(), 'userMap', 'uid-abc'), { profileId: 'p-abc' });
    });
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'feed', 'p-abc:1:r')));
    const db = env.authenticatedContext('uid-abc').firestore();
    await assertFails(setDoc(doc(db, 'feed', 'p-abc:2:r'), { ...card, reviewId: 'p-abc:2:r', gameId: 2, review: 'full' }));
  });
});
