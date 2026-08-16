// Consentimiento para publicar una reseña con enlace público, POR DISPOSITIVO.
//
// Mismo patrón que `analyticsConsentRepository`: es una decisión de quien usa ESTE navegador, no de la cuenta,
// así que no se replica a Firestore. Vive en un repositorio y no en el diálogo porque la vista no toca el
// almacenamiento (regla que vigila `scripts/audit-privacy.js`).
//
// Se guarda la VERSIÓN legal aceptada, no un `true`: si cambia lo que se publica, `LEGAL_VERSION` cambia y el
// aviso completo vuelve a mostrarse en vez de darse por leído para siempre.
import { LEGAL_VERSION } from '../../core/constants/legal';
import { SHARE_CONSENT_KEY } from '../../core/constants/storageKeys';

/** ¿Ya aceptó el aviso vigente? Un aviso de otra versión cuenta como no aceptado. */
export function hasShareConsent(): boolean {
  try {
    return localStorage.getItem(SHARE_CONSENT_KEY) === LEGAL_VERSION;
  } catch {
    return false;
  }
}

/** Sella la aceptación del aviso vigente. */
export function grantShareConsent(): void {
  try {
    // `scripts/audit-privacy.js` marca esto como [B] («localStorage fuera de los repositorios designados»),
    // igual que a `analyticsConsentRepository` y a `importFieldPrefsRepository`. Se deja marcado a propósito en
    // vez de silenciarlo con `audit-allow`: son los tres el mismo caso —preferencia local que no se sincroniza—
    // y lo que procede es decidir si la lista de repositorios designados del script se amplía, no taparlo aquí.
    localStorage.setItem(SHARE_CONSENT_KEY, LEGAL_VERSION);
  } catch {
    // Sin almacenamiento (modo privado estricto) se volverá a pedir la próxima vez, que es el lado seguro por
    // el que fallar.
  }
}
