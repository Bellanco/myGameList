/**
 * Identidad del administrador.
 *
 * La comprobación de este módulo es SOLO para la interfaz (mostrar u ocultar el panel). La barrera de verdad está
 * en `firestore.rules` (`isAdmin()`), que exige el mismo correo Y `email_verified == true`: aunque alguien fuerce
 * la ruta `/admin` en el cliente, toda consulta y toda escritura le responderán `permission-denied`.
 *
 * Por eso el correo puede vivir en el bundle sin ser un secreto: no concede nada, solo describe quién manda.
 * Si cambia, hay que cambiarlo TAMBIÉN en `firestore.rules` y desplegar las reglas; el test de reglas los ata.
 */
export const ADMIN_EMAIL = 'bellanco3@gmail.com';

/** ¿Este correo es el del administrador? Comparación normalizada (Google puede variar la caja). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}
