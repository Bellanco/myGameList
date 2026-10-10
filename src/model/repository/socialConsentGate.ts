// LA PUERTA LEGAL DE LO QUE SALE FUERA DEL HUB (docs/plan-feed-sin-vacio.md, Fase 2).
//
// El hub no deja entrar sin la aceptación de las condiciones VIGENTES (`useSocialLegalConsent`), pero hay
// publicaciones que no pasan por él: la reseña guardada desde la app principal y, después, la pasada en segundo plano
// que publica movimientos y la «última vez activo». Todas preguntan aquí antes de sacar nada del dispositivo.
//
// Es MÁS ESTRICTA que la del hub, y a propósito: el hub deja pasar si no puede comprobarlo (bloquear el espacio
// social por un fallo de red convertiría un requisito legal en una avería, y la persona está delante). Aquí nadie
// está viendo las condiciones, así que ante la duda no se publica: queda pendiente y sale al aceptar en el hub.
import { LEGAL_VERSION } from '../../core/constants/legal';
import { getPublicConfig } from './firebaseGateway';
import { getLocalMeta, patchLocalMeta } from './indexedDbRepository';

/** Cada cuánto se vuelve a preguntar a Firestore si lo sellado es una versión vieja (pudo aceptar en otro equipo). */
export const LEGAL_CONSENT_RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * Se emite en `window` cada vez que se sella la versión: la cápsula del aviso legal (`useLegalConsentNotice`) lo
 * escucha para aparecer en cuanto se sabe que falta la aceptación, y para irse en cuanto se acepta. El nombre lo
 * define el hook, que es quien lo escucha; aquí se repite para no importar la vista desde el modelo.
 */
const LEGAL_CONSENT_SEALED_EVENT = 'mis-listas:legal-consent-sealed';

/**
 * Sella en este dispositivo la versión que consta aceptada por esa cuenta (cadena vacía = ninguna). Best-effort: sin
 * IndexedDB no hay sello y la puerta preguntará a Firestore, que es lo seguro.
 */
export async function sealLegalConsent(uid: string, version: string): Promise<void> {
  if (!uid) return;
  await patchLocalMeta({ legalConsent: { uid, version, checkedAt: Date.now() } }).catch(() => {});
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LEGAL_CONSENT_SEALED_EVENT));
}

/** ¿Puede salir algo del canal social sin pasar por el hub? Solo con la versión vigente aceptada y comprobada. */
export async function canPublishSocialInBackground(uid: string): Promise<boolean> {
  if (!uid) return false;
  const seal = (await getLocalMeta().catch(() => null))?.legalConsent;
  if (seal?.uid === uid) {
    if (seal.version === LEGAL_VERSION) return true;
    if (Date.now() - Number(seal.checkedAt || 0) < LEGAL_CONSENT_RECHECK_MS) return false;
  }
  let version: string;
  try {
    version = String((await getPublicConfig(uid))?.consent?.version || '');
  } catch {
    // No se ha podido comprobar: no se publica, y como no se sella, la próxima vez se vuelve a preguntar.
    return false;
  }
  await sealLegalConsent(uid, version);
  return version === LEGAL_VERSION;
}
