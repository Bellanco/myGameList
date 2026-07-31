/**
 * L1 — Barrido de PII en `profiles`: elimina `email` y `social.gamesGistId` de los perfiles que aún los
 * arrastran. La app ya no los escribe y los purga en el siguiente guardado de cada usuario, pero eso solo
 * alcanza a quien vuelve; este script cubre a los inactivos.
 *
 * CUÁNDO EJECUTARLO: semanas después de desplegar la release que deja de escribir esos campos, para que la
 * inmensa mayoría se haya purgado sola y el barrido sea el remate.
 *
 * Requisitos (no se añaden al proyecto: es una herramienta de un solo uso):
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json   # NUNCA dentro del repo
 *
 * Uso:
 *   node scripts/purge-profile-pii.js              # simulacro (no escribe nada)
 *   node scripts/purge-profile-pii.js --apply      # aplica los borrados
 *
 * OJO: los perfiles cuyo id de documento NO es el uid dependen de `email` para que la app los encuentre
 * (fallback legacy de `resolveOwnProfile`). El script los DETECTA y los deja intactos, informando de cuáles
 * son: purgarlos dejaría a esos usuarios sin forma de recuperar su perfil.
 */
const APPLY = process.argv.includes('--apply');

async function main() {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.error('Falta firebase-admin. Instálalo sin guardarlo:  npm i --no-save firebase-admin');
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta a la clave de servicio, fuera del repo).');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;

  const snapshot = await db.collection('profiles').get();

  let scanned = 0;
  let purged = 0;
  let skippedLegacyId = 0;
  const skipped = [];

  for (const entry of snapshot.docs) {
    scanned += 1;
    const data = entry.data() || {};
    const hasEmail = typeof data.email === 'string' && data.email.length > 0;
    const hasGamesGist = Boolean(data.social && data.social.gamesGistId);
    if (!hasEmail && !hasGamesGist) {
      continue;
    }

    // El doc del dueño se identifica por su uid. Si difiere, `email` es la ÚNICA vía de resolución que le
    // queda a ese usuario: no se toca.
    const uid = typeof data.uid === 'string' ? data.uid : '';
    if (!uid || uid !== entry.id) {
      skippedLegacyId += 1;
      skipped.push(entry.id);
      continue;
    }

    const patch = {};
    if (hasEmail) patch.email = FieldValue.delete();
    if (hasGamesGist) patch['social.gamesGistId'] = FieldValue.delete();

    if (APPLY) {
      await entry.ref.update(patch);
    }
    purged += 1;
    console.log(`${APPLY ? 'purgado' : 'purgaría'} ${entry.id}: ${Object.keys(patch).join(', ')}`);
  }

  console.log('');
  console.log(`Perfiles revisados: ${scanned}`);
  console.log(`${APPLY ? 'Purgados' : 'A purgar'}: ${purged}`);
  console.log(`Omitidos por id legacy (id != uid): ${skippedLegacyId}${skipped.length ? ` → ${skipped.join(', ')}` : ''}`);
  if (!APPLY) {
    console.log('\nSimulacro: no se ha escrito nada. Repite con --apply para aplicarlo.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
