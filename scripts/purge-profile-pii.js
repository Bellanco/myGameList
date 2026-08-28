/**
 * L1 — Barrido de restos legacy en `profiles`, la colección que puede LEER cualquier usuario autenticado con
 * `social.enabled == true` (ver el `allow read` de `firestore.rules`). La app ya no escribe ninguno de estos
 * campos y los purga en el siguiente guardado de cada usuario (`firebaseProfileHealRepository`), pero eso solo
 * alcanza a quien vuelve; este script cubre a los inactivos, que son los que llevan años expuestos.
 *
 * QUÉ BORRA, y en qué orden de gravedad:
 *   social.githubToken  el PAT de GitHub EN CLARO. Es un secreto en un documento que lee cualquiera con cuenta:
 *                       con él se leen y escriben todos los gists de esa persona. Se purga SIEMPRE.
 *   social.gistId       id del canal social. Un gist "secreto" no es privado: quien tiene el id lo lee entero.
 *   social.gamesGistId  id del gist de juegos → la biblioteca completa, con reseñas y horas.
 *   email               correo de la cuenta. Se purga solo cuando el documento se identifica por su uid (abajo).
 *
 * CUÁNDO EJECUTARLO: semanas después de desplegar la release que deja de escribir esos campos, para que la
 * inmensa mayoría se haya purgado sola y el barrido sea el remate. El contador `legacy` del panel `/admin` dice
 * si queda alguno.
 *
 * Requisitos (no se añaden al proyecto: es una herramienta de un solo uso):
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json   # NUNCA dentro del repo
 *
 * Uso:
 *   node scripts/purge-profile-pii.js                    # simulacro (no escribe nada)
 *   node scripts/purge-profile-pii.js --apply            # aplica los borrados, con respaldo previo
 *   node scripts/purge-profile-pii.js --apply --no-backup
 *
 * RESPALDO ANTES DE BORRAR: para algunos usuarios estos campos son la ÚNICA copia que queda de su token y de los
 * ids de sus gists (es justo lo que el saneado del cliente pone a salvo en `privateConfig` antes de purgar, y lo
 * que no puede hacer quien no vuelve a entrar). El script escribe lo que va a borrar en un JSON local ANTES de
 * tocar nada, para que la operación sea reversible desde una copia FUERA del documento público. Ese fichero
 * contiene secretos: guárdalo cifrado o bórralo cuando ya no haga falta. Nunca dentro del repositorio.
 *
 * OJO CON `email` Y LOS PERFILES DE ID LEGACY: los documentos cuyo id NO es el uid dependen de `email` para que
 * la app los encuentre (fallback legacy de `resolveOwnProfile`), así que ahí el correo se CONSERVA. Lo que no se
 * les perdona es el token ni los ids de gist: esos se purgan igual, porque en esos documentos están tan
 * expuestos como en cualquier otro. Antes el script se saltaba estos perfiles enteros, y eran precisamente los
 * más viejos —los más propensos a arrastrar un token en claro—.
 */
const fs = require('node:fs');
const path = require('node:path');

const APPLY = process.argv.includes('--apply');
const NO_BACKUP = process.argv.includes('--no-backup');

/** Campos que se purgan siempre: son secretos o llaves de lectura en un documento de acceso público. */
const ALWAYS_PURGE = [
  ['social.githubToken', (data) => data.social && data.social.githubToken],
  ['social.gistId', (data) => data.social && data.social.gistId],
  ['social.gamesGistId', (data) => data.social && data.social.gamesGistId],
];

function backupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), `profile-legacy-backup-${stamp}.json`);
}

async function main() {
  // Los SUBPATHS y no el paquete raíz: desde firebase-admin v13 el espacio de nombres antiguo dejó de traer
  // `credential` y `firestore`, así que `admin.credential.applicationDefault()` revienta con un
  // `Cannot read properties of undefined`. Estos dos existen desde la v10 y son la forma estable de pedirlos.
  let initializeApp;
  let applicationDefault;
  let getFirestore;
  let FieldValue;
  try {
    ({ initializeApp, applicationDefault } = require('firebase-admin/app'));
    ({ getFirestore, FieldValue } = require('firebase-admin/firestore'));
  } catch {
    console.error('Falta firebase-admin. Instálalo sin guardarlo:  npm i --no-save firebase-admin');
    process.exit(1);
  }

  const credenciales = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credenciales) {
    console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta a la clave de servicio, fuera del repo).');
    process.exit(1);
  }
  // Mismo diagnóstico temprano que en `audit-profile-rules.mjs`, y aquí importa más: este script SÍ escribe, y
  // conviene que falle antes de tocar nada en vez de a mitad de un barrido.
  const rutaCredenciales = path.resolve(credenciales);
  if (!fs.existsSync(rutaCredenciales)) {
    console.error(`GOOGLE_APPLICATION_CREDENTIALS apunta a un fichero que no existe:\n  ${rutaCredenciales}`);
    console.error('Descarga la clave de servicio desde la consola de Firebase (Configuración → Cuentas de');
    console.error('servicio → Generar nueva clave privada) y apunta la variable a donde la hayas dejado.');
    process.exit(1);
  }
  if (!path.relative(process.cwd(), rutaCredenciales).startsWith('..')) {
    console.warn(`AVISO: la clave de servicio está DENTRO del repositorio (${rutaCredenciales}).`);
    console.warn('Muévela fuera: se salta las reglas y App Check, y un `git add .` la publicaría.\n');
  }

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db.collection('profiles').get();

  let scanned = 0;
  let purged = 0;
  let tokensPurged = 0;
  let emailsKept = 0;
  const emailKeptIds = [];
  const backup = [];
  const plan = [];

  for (const entry of snapshot.docs) {
    scanned += 1;
    const data = entry.data() || {};
    const social = data.social || {};

    // El doc del dueño se identifica por su uid. Si difiere, `email` es la ÚNICA vía de resolución que le queda a
    // ese usuario: se conserva. El resto de campos legacy se purgan igual.
    const uid = typeof data.uid === 'string' ? data.uid : '';
    const idMatchesUid = Boolean(uid) && uid === entry.id;

    const fields = [];
    for (const [field, present] of ALWAYS_PURGE) {
      if (present(data)) fields.push(field);
    }
    const hasEmail = typeof data.email === 'string' && data.email.length > 0;
    if (hasEmail && idMatchesUid) {
      fields.push('email');
    } else if (hasEmail) {
      emailsKept += 1;
      emailKeptIds.push(entry.id);
    }

    if (fields.length === 0) {
      continue;
    }

    // Lo que se va a borrar, con su valor, para poder devolverlo si hiciera falta.
    backup.push({
      docId: entry.id,
      uid,
      idMatchesUid,
      values: {
        ...(fields.includes('email') ? { email: data.email } : {}),
        ...(fields.includes('social.githubToken') ? { 'social.githubToken': social.githubToken } : {}),
        ...(fields.includes('social.gistId') ? { 'social.gistId': social.gistId } : {}),
        ...(fields.includes('social.gamesGistId') ? { 'social.gamesGistId': social.gamesGistId } : {}),
      },
    });

    if (fields.includes('social.githubToken')) tokensPurged += 1;
    plan.push({ ref: entry.ref, docId: entry.id, fields });
  }

  // El respaldo se escribe ANTES de la primera escritura, no al final: si el barrido se corta a mitad, lo ya
  // borrado tiene que estar en el fichero de todas formas.
  let backupFile = '';
  if (APPLY && !NO_BACKUP && backup.length > 0) {
    backupFile = backupPath();
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), { mode: 0o600 });
    console.log(`Respaldo escrito en ${backupFile} (contiene SECRETOS: protégelo o bórralo cuando sobre)\n`);
  }

  for (const item of plan) {
    const patch = {};
    for (const field of item.fields) {
      patch[field] = FieldValue.delete();
    }
    if (APPLY) {
      await item.ref.update(patch);
    }
    purged += 1;
    console.log(`${APPLY ? 'purgado' : 'purgaría'} ${item.docId}: ${item.fields.join(', ')}`);
  }

  console.log('');
  console.log(`Perfiles revisados: ${scanned}`);
  console.log(`${APPLY ? 'Purgados' : 'A purgar'}: ${purged}`);
  console.log(`  de los cuales con TOKEN en claro: ${tokensPurged}`);
  console.log(
    `Correos conservados por id legacy (id != uid): ${emailsKept}${emailKeptIds.length ? ` → ${emailKeptIds.join(', ')}` : ''}`,
  );
  if (!APPLY) {
    console.log('\nSimulacro: no se ha escrito nada. Repite con --apply para aplicarlo.');
  } else if (NO_BACKUP) {
    console.log('\nSin respaldo (--no-backup): lo borrado no se puede recuperar.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
