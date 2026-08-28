/**
 * Predicados de la auditoría previa al despliegue de `firestore.rules`: dado un documento, ¿lo rechazarían las
 * reglas? Viven aparte, SIN NINGUNA dependencia, por dos razones:
 *  - el script que barre Firestore necesita `firebase-admin` (una dependencia opcional que no está en el
 *    proyecto), y arrastrarla haría imposible importar estas funciones desde los tests;
 *  - así `tests/unit/auditProfileRules.test.ts` puede comprobar que dicen lo mismo que las reglas, que es lo
 *    único que hace fiable la auditoría.
 *
 * MANTENER EN SINCRONÍA con `profileFieldsAreSane()` / `profileSocialIsSane()` y las funciones `denorm*IsSane()`
 * de `firestore.rules`. Si cambias un límite allí, el test falla.
 */

// Límites: los MISMOS que exigen las reglas.
export const LIMITS = {
  profileId: 128,
  displayName: 120,
  email: 320,
  photoURL: 512,
  etag: 256,
  gistId: 128,
};

/** Claves admitidas en `profiles` (allowlist `hasOnly` de `profileWriteIsValid`). SIN `email` desde L1. */
const PROFILE_ALLOWED_KEYS = [
  'schemaVersion', 'uid', 'profileId', 'displayName', 'photoURL', 'social', 'updatedAt', 'tier', 'createdAt',
];

/** Subclaves admitidas en `social` (allowlist `hasOnly` de `profileSocialIsSane`). `githubToken` NO está. */
const SOCIAL_ALLOWED_KEYS = ['enabled', 'etag', 'gistId', 'gamesGistId'];

const isTimestampLike = (v) => Boolean(v) && typeof v === 'object' && typeof v.toMillis === 'function';
const isNumberOrTimestamp = (v) => typeof v === 'number' || isTimestampLike(v);
const isStringWithin = (v, max) => typeof v === 'string' && v.length <= max;
const isHttpsOrEmpty = (v) => typeof v === 'string' && (v === '' || /^https:\/\/.+/.test(v));

/**
 * Devuelve los motivos por los que las reglas RECHAZARÍAN una escritura sobre este perfil. Lista vacía = pasa.
 * Cada campo se comprueba SOLO si está presente, igual que en las reglas (en un merge, el documento resultante
 * arrastra los campos legacy que las escrituras nuevas ya no mandan).
 */
export function auditProfile(data) {
  const problemas = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);

  // `email` va aparte del resto de claves desconocidas, y la distinción no es cosmética: el informe solo obliga a
  // corregir lo marcado como NUEVO antes de desplegar. `email` ESTABA admitido y deja de estarlo con este
  // despliegue, así que marcarlo como "ya rechazado antes" invitaría a desplegar y congelar a su dueño.
  if (has('email')) {
    problemas.push({ nuevo: true, motivo: 'email ya no cabe en el perfil público (lo lee cualquier autenticado)' });
  }
  const extra = Object.keys(data).filter((k) => k !== 'email' && !PROFILE_ALLOWED_KEYS.includes(k));
  if (extra.length) problemas.push({ nuevo: false, motivo: `claves fuera de la allowlist: ${extra.join(', ')}` });

  if (has('schemaVersion') && typeof data.schemaVersion !== 'number') {
    problemas.push({ nuevo: true, motivo: `schemaVersion no es número (${typeof data.schemaVersion})` });
  }
  if (has('profileId') && !isStringWithin(data.profileId, LIMITS.profileId)) {
    problemas.push({ nuevo: true, motivo: `profileId inválido o de más de ${LIMITS.profileId} caracteres` });
  }
  if (has('displayName') && !isStringWithin(data.displayName, LIMITS.displayName)) {
    problemas.push({
      nuevo: true,
      motivo: `displayName inválido o de más de ${LIMITS.displayName} caracteres (${
        typeof data.displayName === 'string' ? data.displayName.length : typeof data.displayName
      })`,
    });
  }
  if (has('photoURL')) {
    if (!isStringWithin(data.photoURL, LIMITS.photoURL)) {
      problemas.push({ nuevo: true, motivo: `photoURL inválido o de más de ${LIMITS.photoURL} caracteres` });
    } else if (!isHttpsOrEmpty(data.photoURL)) {
      problemas.push({ nuevo: true, motivo: `photoURL no es https ni vacío: ${String(data.photoURL).slice(0, 60)}` });
    }
  }
  if (has('social')) {
    const s = data.social;
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      problemas.push({ nuevo: true, motivo: 'social no es un mapa' });
    } else {
      const hasS = (k) => Object.prototype.hasOwnProperty.call(s, k);
      const extraSocial = Object.keys(s).filter((k) => !SOCIAL_ALLOWED_KEYS.includes(k));
      if (extraSocial.length) {
        // `social.githubToken` cae aquí: es el resto legacy más grave y ahora la allowlist lo rechaza.
        problemas.push({ nuevo: true, motivo: `subclaves de social fuera de la allowlist: ${extraSocial.join(', ')}` });
      }
      if (hasS('enabled') && typeof s.enabled !== 'boolean') {
        problemas.push({ nuevo: true, motivo: `social.enabled no es booleano (${typeof s.enabled})` });
      }
      if (hasS('etag') && s.etag !== null && !isStringWithin(s.etag, LIMITS.etag)) {
        problemas.push({ nuevo: true, motivo: `social.etag inválido o de más de ${LIMITS.etag} caracteres` });
      }
      for (const k of ['gistId', 'gamesGistId']) {
        if (hasS(k) && !isStringWithin(s[k], LIMITS.gistId)) {
          problemas.push({ nuevo: true, motivo: `social.${k} inválido o de más de ${LIMITS.gistId} caracteres` });
        }
      }
    }
  }
  for (const k of ['updatedAt', 'createdAt']) {
    if (has(k) && !isNumberOrTimestamp(data[k])) {
      problemas.push({ nuevo: true, motivo: `${k} no es número ni timestamp (${typeof data[k]})` });
    }
  }

  return problemas;
}

/** Igual, para los campos denormalizados de un documento de amistad. `null` se admite a propósito. */
export function auditFriendship(data) {
  const problemas = [];
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
  const okNulo = (v) => v === null || v === undefined;

  for (const k of ['requesterName', 'recipientName']) {
    if (has(k) && !okNulo(data[k]) && !isStringWithin(data[k], LIMITS.displayName)) {
      problemas.push({ nuevo: true, motivo: `${k} inválido o de más de ${LIMITS.displayName} caracteres` });
    }
  }
  for (const k of ['requesterPhoto', 'recipientPhoto']) {
    if (has(k) && !okNulo(data[k])) {
      if (!isStringWithin(data[k], LIMITS.photoURL)) {
        problemas.push({ nuevo: true, motivo: `${k} inválido o de más de ${LIMITS.photoURL} caracteres` });
      } else if (!isHttpsOrEmpty(data[k])) {
        problemas.push({ nuevo: true, motivo: `${k} no es https ni vacío: ${String(data[k]).slice(0, 60)}` });
      }
    }
  }
  for (const k of ['requesterSocialGistId', 'recipientSocialGistId', 'requesterGamesGistId', 'recipientGamesGistId']) {
    if (has(k) && !okNulo(data[k]) && !isStringWithin(data[k], LIMITS.gistId)) {
      problemas.push({ nuevo: true, motivo: `${k} inválido o de más de ${LIMITS.gistId} caracteres` });
    }
  }

  return problemas;
}
