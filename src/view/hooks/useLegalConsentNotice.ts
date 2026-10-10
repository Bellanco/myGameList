import { useCallback, useEffect, useState } from 'react';
import { LEGAL_VERSION } from '../../core/constants/legal';
import { LEGAL_NOTICE_TOLD_KEY } from '../../core/constants/storageKeys';
import { getLocalMeta } from '../../model/repository/indexedDbRepository';

/** Lo emite `sealLegalConsent` (`socialConsentGate`) al sellar la versión aceptada. Mismo nombre allí. */
export const LEGAL_CONSENT_SEALED_EVENT = 'mis-listas:legal-consent-sealed';

function readTold(): string {
  try {
    return localStorage.getItem(LEGAL_NOTICE_TOLD_KEY) || '';
  } catch {
    return '';
  }
}

function writeTold(): void {
  try {
    localStorage.setItem(LEGAL_NOTICE_TOLD_KEY, LEGAL_VERSION);
  } catch {
    /* Sin almacenamiento podría volver a salir en otra visita: es un aviso, no un dato. */
  }
}

/**
 * LA CÁPSULA DEL AVISO LEGAL (docs/plan-feed-sin-vacio.md, Fase 6): ¿hay que decirle a esta persona que tiene
 * condiciones nuevas por aceptar?
 *
 * Solo si tiene el social dado de alta aquí, si CONSTA que la versión aceptada es otra —lo sella la puerta de lo que
 * sale fuera del hub (`canPublishSocialInBackground`) con su propia lectura, así que esto no lee nada de Firestore— y
 * si no se le ha dicho ya para esta versión. Sin nada sellado no se sabe, y no se avisa. Se vuelve a mirar cuando la
 * puerta sella (aparece en cuanto se sabe, se va en cuanto se acepta) y al volver a la pestaña.
 *
 * Se apunta como dado al MONTARSE la cápsula (`markShown`), como el resumen del año y el aviso del administrador.
 */
export function useLegalConsentNotice(hasSocialProfile: boolean): { show: boolean; markShown: () => void; dismiss: () => void } {
  const [pending, setPending] = useState(false);
  const [closed, setClosed] = useState(() => readTold() === LEGAL_VERSION);

  useEffect(() => {
    if (!hasSocialProfile) {
      setPending(false);
      return undefined;
    }
    let cancelled = false;
    const check = () => {
      void getLocalMeta()
        .then((meta) => {
          const version = meta?.legalConsent?.version;
          if (!cancelled) setPending(typeof version === 'string' && version !== LEGAL_VERSION);
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    window.addEventListener(LEGAL_CONSENT_SEALED_EVENT, check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(LEGAL_CONSENT_SEALED_EVENT, check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hasSocialProfile]);

  const markShown = useCallback(() => writeTold(), []);
  const dismiss = useCallback(() => {
    writeTold();
    setClosed(true);
  }, []);
  return { show: hasSocialProfile && pending && !closed, markShown, dismiss };
}
