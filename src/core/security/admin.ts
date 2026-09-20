/**
 * Identidad del administrador: un CUSTOM CLAIM del token, no un correo.
 *
 * ANTES ERA UN CORREO escrito aquí y repetido en `firestore.rules`. Funcionaba, pero ataba el permiso a una
 * dirección concreta —publicada en el bundle y en las reglas desplegadas—, no dejaba sitio a un segundo
 * administrador y obligaba a desplegar reglas para cambiar de cuenta. El claim lo emite el servidor con el Admin
 * SDK (`scripts/set-admin-claim.mjs`), viaja firmado dentro del ID token y NO se puede falsificar desde el
 * cliente, que es justo lo que se le pide a la única barrera real.
 *
 * ESTE MÓDULO ES SOLO PARA LA INTERFAZ (mostrar u ocultar el panel). La barrera de verdad está en
 * `firestore.rules` (`isAdmin()`), que exige el MISMO claim: aunque alguien fuerce la ruta `/admin` en el
 * cliente, toda consulta y toda escritura le responderán `permission-denied`.
 *
 * EL NOMBRE DEL CLAIM ES UN PAR DUPLICADO: vive aquí y en `firestore.rules`. Si cambia uno, cambia el otro —y
 * `tests/integration/firestore.rules.test.ts` lo ata para que no puedan divergir en silencio.
 *
 * CUIDADO CON EL TOKEN CACHEADO: el claim recién asignado no aparece hasta que el ID token se refresca (hasta una
 * hora, o al volver a entrar). Por eso `readAdminClaim` acepta forzar el refresco; ver su cabecera.
 */

/** Nombre del custom claim que concede el panel. Espejo de `firestore.rules`. */
export const ADMIN_CLAIM = 'admin';

/** Los claims de un ID token tal y como los entrega `getIdTokenResult`: un mapa sin tipar. */
export type TokenClaims = Record<string, unknown> | null | undefined;

/**
 * ¿Este token concede el panel?
 *
 * Comparación ESTRICTA contra `true`: un claim con la cadena `"true"`, un `1` o cualquier otro valor veraz no
 * vale. Las reglas de Firestore comparan igual (`== true`), y las dos comprobaciones tienen que decir lo mismo o
 * la interfaz ofrecería un panel que el servidor deniega.
 */
export function hasAdminClaim(claims: TokenClaims): boolean {
  return Boolean(claims) && (claims as Record<string, unknown>)[ADMIN_CLAIM] === true;
}
