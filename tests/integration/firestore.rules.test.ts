import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ADMIN_EMAIL } from '../../src/core/security/admin';

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
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { scoreScale: 'grade', palette: 'persona', theme: 'dark', uppercase: true, showSteamButton: false }));
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { theme: 'light' }));
      await assertFails(setDoc(doc(ownerDb('uid-b'), 'publicConfig', 'uid-a'), { palette: 'persona' }));
    });
    it('rechaza valores inválidos y claves fuera de la allowlist', async () => {
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { theme: 'neon' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { scoreScale: 'weird' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { uppercase: 'yes' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { showSteamButton: 'yes' }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { hackField: 'x' }));
    });

    it('L2: admite `effects`, que el cliente ya escribía y la allowlist denegaba en silencio', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { effects: false }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { effects: 'off' }));
    });

    it('L4: acepta el consentimiento con forma válida y rechaza el malformado', async () => {
      await assertSucceeds(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { consent: { version: '2026-07', agreedAt: 1 } }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { consent: { version: '2026-07' } }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { consent: { version: 1, agreedAt: 1 } }));
      await assertFails(setDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a'), { consent: { version: '2026-07', agreedAt: 1, extra: true } }));
    });
  });

  // L3 — sin estos permisos el borrado de cuenta es imposible: `allow write` con validación de esquema denegaba
  // TODO delete (en un delete no hay `request.resource` que validar).
  describe('L3 — borrado de cuenta por el dueño', () => {
    it('el dueño borra sus cuatro documentos; un tercero no puede borrar ninguno', async () => {
      await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });
      await seed('privateConfig', 'uid-a', { profileId: 'p' });
      await seed('publicConfig', 'uid-a', { scoreScale: 'stars' });
      await seed('userMap', 'uid-a', { profileId: 'p' });

      await assertFails(deleteDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a')));
      await assertFails(deleteDoc(doc(ownerDb('uid-b'), 'privateConfig', 'uid-a')));
      await assertFails(deleteDoc(doc(ownerDb('uid-b'), 'publicConfig', 'uid-a')));
      await assertFails(deleteDoc(doc(ownerDb('uid-b'), 'userMap', 'uid-a')));

      await assertSucceeds(deleteDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a')));
      await assertSucceeds(deleteDoc(doc(ownerDb('uid-a'), 'privateConfig', 'uid-a')));
      await assertSucceeds(deleteDoc(doc(ownerDb('uid-a'), 'publicConfig', 'uid-a')));
      await assertSucceeds(deleteDoc(doc(ownerDb('uid-a'), 'userMap', 'uid-a')));
    });

    it('el placeholder de perfiles sigue sin poder borrarse', async () => {
      await seed('profiles', '_placeholder', { uid: '_placeholder' });
      await assertFails(deleteDoc(doc(ownerDb('_placeholder'), 'profiles', '_placeholder')));
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

  // Panel de administración (`/admin`): estas reglas son la ÚNICA barrera real del panel — el gate del cliente
  // solo esconde la interfaz. Cada operación que ofrece el panel tiene aquí su contraparte permitida/denegada.
  describe('panel de administración', () => {
    it('el correo del panel y el de las reglas son el mismo (si cambia uno, hay que cambiar el otro)', () => {
      expect(ADMIN_EMAIL).toBe(ADMIN.email);
    });

    it('el admin lista TODOS los perfiles, incluidos los que tienen el social desactivado; un usuario normal no', async () => {
      await seed('profiles', 'uid-on', { uid: 'uid-on', social: { enabled: true } });
      await seed('profiles', 'uid-off', { uid: 'uid-off', social: { enabled: false } });

      await assertSucceeds(getDocs(collection(adminDb(), 'profiles')));
      // Un autenticado cualquiera solo puede consultar el subconjunto social.enabled: la colección entera se le
      // deniega porque la regla no se cumple para el perfil desactivado.
      await assertFails(getDocs(collection(ownerDb('uid-x'), 'profiles')));
    });

    it('el admin lista todas las amistades; un usuario normal solo las suyas', async () => {
      await seed('friendships', 'uid-a__uid-b', { users: ['uid-a', 'uid-b'], status: 'accepted' });
      await seed('friendships', 'uid-c__uid-d', { users: ['uid-c', 'uid-d'], status: 'pending' });

      await assertSucceeds(getDocs(collection(adminDb(), 'friendships')));
      await assertFails(getDocs(collection(ownerDb('uid-a'), 'friendships')));
      await assertSucceeds(
        getDocs(query(collection(ownerDb('uid-a'), 'friendships'), where('users', 'array-contains', 'uid-a'))),
      );
    });

    it('el admin suspende el social de otro usuario y purga sus restos legacy', async () => {
      await seed('profiles', 'uid-a', {
        uid: 'uid-a',
        email: 'legacy@example.com',
        social: { enabled: true, gamesGistId: 'gg', githubToken: 'ghp_legacy' },
      });

      await assertSucceeds(updateDoc(doc(adminDb(), 'profiles', 'uid-a'), { 'social.enabled': false }));
      await assertSucceeds(
        updateDoc(doc(adminDb(), 'profiles', 'uid-a'), {
          email: deleteField(),
          'social.gamesGistId': deleteField(),
          'social.githubToken': deleteField(),
        }),
      );
      // Y nadie más puede hacerlo sobre un perfil ajeno.
      await assertFails(updateDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a'), { 'social.enabled': false }));
    });

    it('el admin borra el perfil y las amistades de un usuario, pero no el placeholder', async () => {
      await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });
      await seed('profiles', '_placeholder', { uid: '_placeholder' });
      await seed('friendships', 'uid-a__uid-b', { users: ['uid-a', 'uid-b'], status: 'accepted' });

      await assertSucceeds(deleteDoc(doc(adminDb(), 'friendships', 'uid-a__uid-b')));
      await assertSucceeds(deleteDoc(doc(adminDb(), 'profiles', 'uid-a')));
      await assertFails(deleteDoc(doc(adminDb(), 'profiles', '_placeholder')));
    });

    describe('rango del perfil (tier)', () => {
      it('el admin asigna el rango; el dueño no puede estrenárselo', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });

        await assertSucceeds(updateDoc(doc(adminDb(), 'profiles', 'uid-a'), { tier: 'gold' }));
        await assertFails(setDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-b'), { uid: 'uid-b', tier: 'mithril' }));
      });

      it('el dueño no puede ascenderse ni descenderse el rango que le pusieron', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'silver', social: { enabled: true } });

        await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', tier: 'mithril' }, { merge: true }));
        await assertFails(setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', tier: 'bronze' }, { merge: true }));
      });

      // REGRESIÓN de la trampa del `hasOnly`: en un update, `request.resource.data` es el documento RESULTANTE.
      // Si "tier" no estuviera en la allowlist, en cuanto el admin asignara un rango, TODAS las escrituras del
      // dueño sobre su propio perfil (nombre, foto, gist) quedarían denegadas y su perfil, congelado.
      it('un perfil CON rango sigue pudiendo ser editado por su dueño', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', displayName: 'Ada', social: { enabled: true } });

        await assertSucceeds(
          setDoc(
            doc(ownerDb('uid-a'), 'profiles', 'uid-a'),
            { uid: 'uid-a', displayName: 'Ada Lovelace', social: { gistId: 'g2', enabled: true } },
            { merge: true },
          ),
        );
      });

      it('el admin puede retirar el rango (volver a bronce = borrar el campo)', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', social: { enabled: true } });
        await assertSucceeds(updateDoc(doc(adminDb(), 'profiles', 'uid-a'), { tier: deleteField() }));
      });

      // AUDITORÍA ADVERSARIAL: el rango solo lo asigna el admin. Aquí se ataca esa invariante desde la cuenta del
      // dueño por todas las vías que tiene a mano un cliente hostil (no la app, que ni lo intenta: Firestore acepta
      // escrituras de cualquier cliente con el token del usuario).
      describe('nadie puede tocarse su propio rango', () => {
        it('no puede estrenárselo en un perfil que NO tenía rango', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', displayName: 'Ada', social: { enabled: true } });

          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'mithril' }));
          await assertFails(
            setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', tier: 'gold' }, { merge: true }),
          );
        });

        it('no puede subirlo ni bajarlo', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'silver', social: { enabled: true } });

          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'mithril' }));
          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'gold' }));
          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'bronze' }));
        });

        it('no puede BORRAR el campo para degradarse a bronce', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', social: { enabled: true } });

          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: deleteField() }));
        });

        it('no puede colarlo camuflado en una escritura por lo demás legítima', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'bronze', displayName: 'Ada', social: { enabled: true } });

          await assertFails(
            setDoc(
              doc(ownerDb('uid-a'), 'profiles', 'uid-a'),
              { uid: 'uid-a', displayName: 'Ada Lovelace', photoURL: 'x', tier: 'mithril' },
              { merge: true },
            ),
          );
        });

        it('no puede reescribir el documento entero sin rango (sobrescritura no-merge)', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', displayName: 'Ada', social: { enabled: true } });

          // Sin `merge`, el documento resultante no tendría `tier`: sería una autodegradación encubierta.
          await assertFails(
            setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), {
              uid: 'uid-a',
              displayName: 'Ada',
              social: { enabled: true },
            }),
          );
        });

        it('tampoco puede tocar el rango de OTRO usuario', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', social: { enabled: true } });

          await assertFails(updateDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a'), { tier: 'bronze' }));
          await assertFails(
            setDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a'), { uid: 'uid-a', tier: 'mithril' }, { merge: true }),
          );
        });

        it('un rango inventado tampoco cuela (no hay lista blanca de valores, pero no puede escribir ninguno)', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });

          await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'adamantium' }));
        });

        // RESIDUO CONOCIDO Y ACEPTADO. El dueño puede borrar su perfil (derecho de supresión, RGPD art. 17) y
        // crear otro sin rango. No se puede cerrar sin quitarle el borrado de cuenta, y no hace falta: es una
        // AUTODEGRADACIÓN a bronce que le cuesta el perfil entero. Por ninguna vía puede SUBIR de rango, que es
        // la propiedad que importa. Este test existe para que, si algún día deja de ser cierto, se sepa.
        it('borrar el perfil y recrearlo solo permite quedarse en bronce, nunca subir', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', social: { enabled: true } });

          await assertSucceeds(deleteDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a')));
          // Al recrearlo NO puede ponerse rango: vuelve como bronce (ausencia de campo).
          await assertFails(
            setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', tier: 'mithril', social: { enabled: true } }),
          );
          await assertSucceeds(
            setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', social: { enabled: true } }),
          );
        });

        // El allowlist de claves es de PRIMER NIVEL: dentro de `social` el dueño puede escribir lo que quiera. Que
        // eso no sirva para falsear el rango depende de que el lector use SIEMPRE el campo de primer nivel.
        // La contraparte de este test vive en tests/unit/socialDirectoryRecency.test.ts.
        it('puede escribir `social.tier`, pero es un campo que nadie lee', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', social: { enabled: true } });

          await assertSucceeds(
            setDoc(
              doc(ownerDb('uid-a'), 'profiles', 'uid-a'),
              { uid: 'uid-a', social: { enabled: true, tier: 'mithril' } },
              { merge: true },
            ),
          );
        });

        // Lo que SÍ debe seguir funcionando: conservar el rango en las escrituras normales del dueño.
        it('conservar el mismo rango no bloquea las escrituras legítimas', async () => {
          await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', displayName: 'Ada', social: { enabled: true } });

          await assertSucceeds(
            setDoc(
              doc(ownerDb('uid-a'), 'profiles', 'uid-a'),
              { uid: 'uid-a', displayName: 'Ada Lovelace' },
              { merge: true },
            ),
          );
          // Reenviar el MISMO valor es un no-op y no tiene por qué denegarse.
          await assertSucceeds(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { tier: 'gold' }));
        });
      });
    });

    // FECHA DE ALTA. Es el dato con el que el panel juzga la antigüedad, así que solo vale si nadie puede
    // reescribirla. Se sella al crear el perfil y queda congelada incluso para su dueño.
    describe('fecha de alta (createdAt)', () => {
      it('el dueño puede sellarla al crear su perfil', async () => {
        await assertSucceeds(
          setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), {
            uid: 'uid-a',
            createdAt: 1000,
            social: { enabled: true },
          }),
        );
      });

      it('una vez sellada, el dueño NO puede cambiarla ni borrarla', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', createdAt: 1000, social: { enabled: true } });

        await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { createdAt: 5 }));
        await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { createdAt: deleteField() }));
        // Y tampoco reescribiendo el documento entero sin ella (la vía que el rango destapó).
        await assertFails(
          setDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', social: { enabled: true } }),
        );
      });

      // REGRESIÓN de la trampa del `hasOnly`, la misma que con `tier`: sin la clave en la allowlist, en cuanto un
      // perfil tuviera fecha de alta, TODAS las escrituras merge de su dueño quedarían denegadas.
      it('un perfil CON fecha de alta sigue pudiendo editarse', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', createdAt: 1000, displayName: 'Ada', social: { enabled: true } });

        await assertSucceeds(
          setDoc(
            doc(ownerDb('uid-a'), 'profiles', 'uid-a'),
            { uid: 'uid-a', displayName: 'Ada Lovelace' },
            { merge: true },
          ),
        );
      });

      it('el admin tampoco la necesita tocar, pero puede (se salta la validación)', async () => {
        await seed('profiles', 'uid-a', { uid: 'uid-a', createdAt: 1000, social: { enabled: true } });
        await assertSucceeds(updateDoc(doc(adminDb(), 'profiles', 'uid-a'), { createdAt: 2000 }));
      });

      it('un tercero no puede sellar la fecha de otro', async () => {
        await assertFails(
          setDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a'), { uid: 'uid-a', createdAt: 1000 }),
        );
      });
    });

    // LÍMITE CONOCIDO del panel, verificado a propósito: el borrado desde `/admin` es PARCIAL. Estos tres
    // documentos son owner-only y sobreviven; para borrarlos haría falta el Admin SDK en servidor.
    it('el admin NO puede leer ni borrar la configuración privada de otro usuario', async () => {
      await seed('privateConfig', 'uid-a', { profileId: 'p', encryptedGithubToken: 'x' });
      await seed('publicConfig', 'uid-a', { scoreScale: 'stars' });
      await seed('userMap', 'uid-a', { profileId: 'p' });

      await assertFails(getDoc(doc(adminDb(), 'privateConfig', 'uid-a')));
      await assertFails(getDoc(doc(adminDb(), 'publicConfig', 'uid-a')));
      await assertFails(getDoc(doc(adminDb(), 'userMap', 'uid-a')));
      await assertFails(deleteDoc(doc(adminDb(), 'privateConfig', 'uid-a')));
    });
  });

  // Auto-saneado al iniciar sesión (`firebaseProfileHealRepository`): el dueño se purga a sí mismo los restos
  // legacy del documento público. Si las reglas no lo permitieran, la migración fallaría en silencio.
  describe('auto-saneado del perfil legacy por su dueño', () => {
    it('el dueño puede borrarse email, gist de juegos y token en claro de una sola escritura', async () => {
      await seed('profiles', 'uid-a', {
        uid: 'uid-a',
        email: 'legacy@example.com',
        displayName: 'Ada',
        social: { enabled: true, gistId: 'gs', gamesGistId: 'gg', githubToken: 'ghp_legacy' },
      });

      await assertSucceeds(
        updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), {
          uid: 'uid-a',
          email: deleteField(),
          'social.gamesGistId': deleteField(),
          'social.githubToken': deleteField(),
        }),
      );
    });

    // Regresión del motivo por el que la purga incluye `uid`: sin ese campo, `profileWriteIsValid` falla
    // (`request.resource.data.uid` sería null) y el saneado quedaría bloqueado justo en los perfiles más viejos.
    it('un perfil tan viejo que no tiene campo `uid` se sanea porque la escritura lo incluye', async () => {
      await seed('profiles', 'uid-a', { email: 'legacy@example.com', social: { enabled: true, githubToken: 'ghp' } });

      await assertFails(updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { 'social.githubToken': deleteField() }));
      await assertSucceeds(
        updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), { uid: 'uid-a', 'social.githubToken': deleteField() }),
      );
    });

    it('el saneado no permite de rebote tocar el perfil de otro', async () => {
      await seed('profiles', 'uid-a', { uid: 'uid-a', email: 'legacy@example.com', social: { enabled: true } });
      await assertFails(
        updateDoc(doc(ownerDb('uid-b'), 'profiles', 'uid-a'), { uid: 'uid-a', email: deleteField() }),
      );
    });

    it('un perfil CON rango se sanea sin perderlo ni poder cambiarlo', async () => {
      await seed('profiles', 'uid-a', { uid: 'uid-a', tier: 'gold', email: 'x@y.z', social: { enabled: true, githubToken: 'ghp' } });

      await assertSucceeds(
        updateDoc(doc(ownerDb('uid-a'), 'profiles', 'uid-a'), {
          uid: 'uid-a',
          email: deleteField(),
          'social.githubToken': deleteField(),
        }),
      );
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
