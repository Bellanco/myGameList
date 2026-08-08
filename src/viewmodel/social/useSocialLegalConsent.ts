// L4 — puerta legal del espacio social: la aceptación de las condiciones de uso y la política de privacidad
// vigentes, registrada en `publicConfig/{uid}` (owner-only, así que sigue al usuario entre dispositivos).
//
// Solo afecta a lo SOCIAL: las listas propias, la sincronización con el gist de juegos y el borrado de cuenta
// nunca dependen de esto.
import { useCallback, useEffect, useState } from 'react';
import { LEGAL_CONSENT_UI, LEGAL_VERSION } from '../../core/constants/legal';
import { getPublicConfig, setPublicConfig } from '../../model/repository/firebaseGateway';

type Feedback = (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;

/**
 * Resultado de la comprobación ANOTADO CON EL UID al que corresponde.
 *
 * Guardar el uid es lo que evita la carrera: entre que aparece la sesión y responde la comprobación hay renders
 * en los que aún no se sabe nada, y sin esa marca se colaría un "adelante" que luego habría que revertir (el
 * usuario entraría y se le sacaría acto seguido).
 *
 * `unknown` = la comprobación falló (offline/reglas) → se deja pasar; `required` = hay que pedir la aceptación.
 */
type ConsentCheck = { uid: string; status: 'accepted' | 'required' | 'unknown' };

export interface SocialLegalConsent {
  /**
   * ¿Puede abrirse el espacio social? Sin sesión no hay nada que consentir (el gateway ya pide iniciarla); con
   * sesión, solo cuando consta la comprobación DE ESE uid y no exige aceptación.
   */
  gateOpen: boolean;
  /**
   * ¿La comprobación sigue en vuelo? Es una LECTURA de Firestore, así que con sesión ya iniciada hay un intervalo
   * en el que aún no consta nada de ese uid y `gateOpen` es false. Sin distinguirlo, el hub caía al gateway
   * durante esas décimas de segundo —con su botón de "Cerrar sesión" justo bajo el dedo— para volver acto seguido
   * al espacio social. Mientras esté pendiente, la pantalla debe seguir "cargando".
   */
  pending: boolean;
  /** ¿Hay que pedir la aceptación a este usuario? */
  required: boolean;
  saving: boolean;
  accept: () => Promise<void>;
}

export function useSocialLegalConsent(uid: string | null | undefined, setFeedback: Feedback): SocialLegalConsent {
  const [check, setCheck] = useState<ConsentCheck | null>(null);
  const [saving, setSaving] = useState(false);

  // Si la LECTURA falla (offline, reglas, Firebase ausente) se deja pasar: bloquear el espacio social por un fallo
  // de red convertiría un requisito legal en una avería. Solo se exige cuando CONSTA que no hay aceptación vigente.
  useEffect(() => {
    if (!uid) {
      setCheck(null);
      return;
    }

    let cancelled = false;
    void getPublicConfig(uid)
      .then((cfg) => {
        if (cancelled) return;
        setCheck({ uid, status: cfg?.consent?.version === LEGAL_VERSION ? 'accepted' : 'required' });
      })
      .catch(() => {
        if (!cancelled) setCheck({ uid, status: 'unknown' });
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const accept = useCallback(async () => {
    if (!uid || saving) {
      return;
    }
    setSaving(true);
    try {
      await setPublicConfig(uid, { consent: { version: LEGAL_VERSION, agreedAt: Date.now() } });
      setCheck({ uid, status: 'accepted' });
    } catch {
      setFeedback('err', LEGAL_CONSENT_UI.error);
    } finally {
      setSaving(false);
    }
  }, [uid, saving, setFeedback]);

  return {
    gateOpen: !uid || (check?.uid === uid && check.status !== 'required'),
    pending: Boolean(uid) && check?.uid !== uid,
    required: check?.status === 'required' && check.uid === uid,
    saving,
    accept,
  };
}
