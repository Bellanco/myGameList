/**
 * Auditoría PREVIA al despliegue de `firestore.rules`: ¿hay documentos REALES que la validación de contenido
 * (C7) rechazaría?
 *
 * POR QUÉ HACE FALTA. Los tests de emulador cubren las formas de documento que conocemos, no los datos de
 * producción. Si un perfil real trae un `displayName` larguísimo o un `photoURL` que no es https, al desplegar las
 * reglas su dueño deja de poder guardar su perfil — y en SILENCIO, porque el auto-saneado del arranque se traga
 * sus errores a propósito. Lo mismo con un documento de amistad: un campo denormalizado fuera de rango bloquea
 * las escrituras de LAS DOS partes (aceptar, sanear identidad).
 *
 * Este script NO ESCRIBE NADA, nunca. Solo lee y lista lo que habría que arreglar antes.
 *
 * Requisitos (no se añaden al proyecto: es una herramienta de un solo uso, como purge-profile-pii.js):
 *   npm i --no-save firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account.json   # NUNCA dentro del repo
 *
 * Uso:
 *   node scripts/audit-profile-rules.mjs
 *
 * Código de salida: 0 si no hay nada que rechazar, 1 si hay algún documento problemático (sirve de puerta antes
 * de `firebase deploy --only firestore:rules`).
 *
 * SI ENCUENTRA ALGO: no despliegues las reglas todavía. Corrige el dato desde el panel de administración (que
 * puede escribir cualquier perfil) o con un script de un solo uso, y vuelve a pasar esta auditoría.
 *
 * Los PREDICADOS viven en `scripts/lib/profile-rules-predicates.mjs`, sin dependencias, para que los tests
 * puedan comprobarlos contra las reglas. Aquí queda solo el barrido contra Firestore.
 *
 * MANTENER EN SINCRONÍA con `profileFieldsAreSane()` / `profileSocialIsSane()` y las funciones `denorm*IsSane()`
 * de `firestore.rules`. Los predicados de abajo están cubiertos por `tests/unit/auditProfileRules.test.ts`, que
 * usa los mismos casos que los tests de emulador; si cambias un límite en las reglas, ese test falla.
 */

import { auditFriendship, auditProfile, LIMITS } from './lib/profile-rules-predicates.mjs';

async function main() {
  let admin;
  try {
    admin = (await import('firebase-admin')).default;
  } catch {
    console.error('Falta firebase-admin. Instálalo sin guardarlo:  npm i --no-save firebase-admin');
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Falta GOOGLE_APPLICATION_CREDENTIALS (ruta al service-account.json, FUERA del repo).');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  let revisados = 0;
  const hallazgos = [];

  for (const [coleccion, auditor] of [['profiles', auditProfile], ['friendships', auditFriendship]]) {
    const snap = await db.collection(coleccion).get();
    for (const doc of snap.docs) {
      if (doc.id === '_placeholder') continue;
      revisados += 1;
      const problemas = auditor(doc.data());
      if (problemas.length) hallazgos.push({ coleccion, id: doc.id, problemas });
    }
  }

  console.log(`Auditoría de reglas — ${revisados} documentos revisados (solo lectura, no se ha escrito nada).\n`);

  if (!hallazgos.length) {
    console.log('Ningún documento sería rechazado por las reglas. Puedes desplegarlas.');
    process.exit(0);
  }

  for (const h of hallazgos) {
    console.log(`${h.coleccion}/${h.id}`);
    for (const p of h.problemas) {
      console.log(`   ${p.nuevo ? '[C7 · NUEVO]' : '[ya rechazado antes]'} ${p.motivo}`);
    }
  }

  const nuevos = hallazgos.filter((h) => h.problemas.some((p) => p.nuevo)).length;
  console.log(
    `\n${hallazgos.length} documento(s) con problemas; ${nuevos} los rechazaría la validación NUEVA (C7).\n` +
      'Los marcados "ya rechazado antes" fallaban también con las reglas actuales: no son una regresión de este ' +
      'despliegue, pero conviene arreglarlos igual.\n' +
      'NO despliegues las reglas hasta corregir los marcados [C7 · NUEVO]: su dueño se quedaría sin poder ' +
      'guardar su perfil, y sin ver ningún error.',
  );
  process.exit(1);
}

// Los predicados se exportan arriba (los tests los importan). El barrido contra Firestore solo corre cuando este
// fichero ES el punto de entrada, no al importarlo.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error('La auditoría ha fallado:', error);
    process.exit(1);
  });
}
