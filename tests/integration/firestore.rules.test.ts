import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

  describe('publicConfig (apariencia + escala)', () => {
    it('el dueño escribe scoreScale/palette/theme/uppercase válidos; un no-dueño no', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { scoreScale: 'grade', palette: 'persona', theme: 'dark', uppercase: true }));
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { theme: 'light' }));
      await assertFails(setDoc(doc(ownerDb('uid-b'), 'publicConfig', 'uid-a'), { palette: 'persona' }));
    });
    it('rechaza valores inválidos y claves fuera de la allowlist', async () => {
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { theme: 'neon' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { scoreScale: 'weird' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { uppercase: 'yes' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { hackField: 'x' }));
    });
  });

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

    it('C5/T4: acepta el esquema esperado y rechaza campos fuera de la allowlist', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), {
        schemaVersion: 1, uid: 'uid-a', profileId: 'p', email: 'a@b.c', displayName: 'A', photoURL: '', social: { enabled: true }, updatedAt: 1,
      }));
      // Campo arbitrario no permitido → denegado.
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', social: { enabled: true }, hackField: 'x' }));
      // Token en claro a nivel raíz → denegado.
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', social: { enabled: true }, githubToken: 'ghp_x' }));
    });
  });

  describe('privateConfig (solo dueño)', () => {
    it('el dueño lee/escribe; otros y anónimo no', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a'), { profileId: 'p', encryptedGithubToken: 'x' }));
      await assertSucceeds(getDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a')));
      await assertFails(getDoc(doc(ownerDb('uid-b'), 'privateConfig', 'uid-a')));
      await assertFails(getDoc(doc(anonDb(), 'privateConfig', 'uid-a')));
    });

    it('C5/T4: rechaza una escritura con campos fuera de la allowlist', async () => {
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a'), { profileId: 'p', secretoArbitrario: 'x' }));
    });
  });

  describe('userMap (solo dueño)', () => {
    it('el dueño lee/escribe; otros no', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'userMap', 'uid-a'), { profileId: 'p-a' }));
      await assertFails(getDoc(doc(ownerDb('uid-b'), 'userMap', 'uid-a')));
    });

    it('ST9: rechaza campos fuera de la allowlist (profileId/schemaVersion)', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'userMap', 'uid-a'), { profileId: 'p-a', schemaVersion: 1 }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'userMap', 'uid-a'), { profileId: 'p-a', hackField: 'x' }));
    });
  });

  describe('recommendations (solo admin)', () => {
    it('admin escribe/lee; un usuario normal no', async () => {
      await assertSucceeds(setDoc(doc(adminDb(), 'recommendations', 'r1'), { toEmail: 'x@y.z' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'recommendations', 'r2'), { toEmail: 'x@y.z' }));
      await assertFails(getDoc(doc(ownerDb('uid-a'), 'recommendations', 'r1')));
    });
  });

  describe('friendships (aceptación mutua)', () => {
    // A < B lexicográficamente → doc canónico 'uid-a__uid-b', users ['uid-a','uid-b'].
    const DOC_ID = 'uid-a__uid-b';
    const pendingFromAtoB = () => ({
      users: ['uid-a', 'uid-b'],
      requester: 'uid-a',
      recipient: 'uid-b',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
      requesterName: 'A',
      requesterPhoto: '',
      requesterSocialGistId: 'gsA',
      requesterGamesGistId: 'ggA',
    });

    it('create: el requester crea la petición canónica (pending) con sus propios campos', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID), pendingFromAtoB()));
    });

    it('create: rechaza si el requester no es quien escribe', async () => {
      // uid-b intenta crear una petición diciendo que la envía uid-a.
      await assertFails(setDoc(doc(ownerDb('uid-b'), 'friendships', DOC_ID), pendingFromAtoB()));
    });

    it('create: rechaza id no canónico o users desordenados', async () => {
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'friendships', 'uid-b__uid-a'), pendingFromAtoB()));
      await assertFails(
        setDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID), { ...pendingFromAtoB(), users: ['uid-b', 'uid-a'] }),
      );
    });

    it('create: rechaza escribir campos del recipient o estado != pending', async () => {
      await assertFails(
        setDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID), { ...pendingFromAtoB(), recipientName: 'B' }),
      );
      await assertFails(
        setDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID), { ...pendingFromAtoB(), status: 'accepted' }),
      );
    });

    it('query: un participante consulta sus amistades por array-contains (patrón feed/bandeja)', async () => {
      await seed('friendships', DOC_ID, pendingFromAtoB());
      // Es EXACTAMENTE la consulta de getMyFriendships. Si las reglas la deniegan, la bandeja/feed salen vacíos.
      const q = (uid: string) => query(collection(ownerDb(uid), 'friendships'), where('users', 'array-contains', uid));
      await assertSucceeds(getDocs(q('uid-a')));
      await assertSucceeds(getDocs(q('uid-b')));
    });

    it('query+create: el requester crea y luego SE VE su petición en la consulta (read-your-write)', async () => {
      const dbA = ownerDb('uid-a');
      await assertSucceeds(setDoc(doc(dbA, 'friendships', DOC_ID), pendingFromAtoB()));
      const snap = await getDocs(query(collection(dbA, 'friendships'), where('users', 'array-contains', 'uid-a')));
      if (snap.empty) {
        throw new Error('La petición recién creada no aparece en la consulta del propio requester');
      }
    });

    it('read: solo los participantes leen el doc; un tercero no', async () => {
      await seed('friendships', DOC_ID, pendingFromAtoB());
      await assertSucceeds(getDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID)));
      await assertSucceeds(getDoc(doc(ownerDb('uid-b'), 'friendships', DOC_ID)));
      await assertFails(getDoc(doc(ownerDb('uid-c'), 'friendships', DOC_ID)));
    });

    it('accept: el recipient pasa pending→accepted escribiendo sus campos; el requester no puede aceptar', async () => {
      await seed('friendships', DOC_ID, pendingFromAtoB());
      // El requester (uid-a) NO puede autoaceptar.
      await assertFails(
        updateDoc(doc(ownerDb('uid-a'), 'friendships', DOC_ID), { status: 'accepted', updatedAt: 2 }),
      );
      // El recipient (uid-b) acepta y añade sus campos denormalizados.
      await assertSucceeds(
        updateDoc(doc(ownerDb('uid-b'), 'friendships', DOC_ID), {
          status: 'accepted',
          updatedAt: 2,
          recipientName: 'B',
          recipientPhoto: '',
          recipientSocialGistId: 'gsB',
          recipientGamesGistId: 'ggB',
        }),
      );
    });

    it('accept: rechaza si el recipient intenta modificar campos del requester', async () => {
      await seed('friendships', DOC_ID, pendingFromAtoB());
      await assertFails(
        updateDoc(doc(ownerDb('uid-b'), 'friendships', DOC_ID), { status: 'accepted', requesterName: 'hack' }),
      );
    });

    it('delete: cualquier participante puede borrar (cancelar/rechazar/eliminar); un tercero no', async () => {
      await seed('friendships', DOC_ID, pendingFromAtoB());
      await assertFails(deleteDoc(doc(ownerDb('uid-c'), 'friendships', DOC_ID)));
      await assertSucceeds(deleteDoc(doc(ownerDb('uid-b'), 'friendships', DOC_ID)));
    });
  });

  describe('catch-all', () => {
    it('deniega cualquier otra colección', async () => {
      await assertFails(getDoc(doc(ownerDb('uid-a'), 'whatever', 'x')));
    });
  });
});
