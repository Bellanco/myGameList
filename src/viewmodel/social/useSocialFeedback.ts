// LOS AVISOS DEL ESPACIO SOCIAL: el mensaje de estado (con su tono y su plazo), el bloqueo por error, y los dos
// avisos persistentes —sin red y servicio limitado—, con las tres funciones que los encienden y apagan.
//
// Sale de `useSocialViewModel` entero: todo el hub avisa a través de `setFeedback` y `reportFailure`, pero el estado
// solo lo tocan ellas (y el retorno de la red, que apaga el de sin red).
import { useCallback, useEffect, useRef, useState } from 'react';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import { isNetworkFailure, isOffline, isServiceUnavailable } from '../../core/utils/network';

export function useSocialFeedback() {
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'ok' | 'warn' | 'err'>('ok');
  const [hasBlockingSocialIssue, setHasBlockingSocialIssue] = useState(false);
  /**
   * ¿Ha fallado la RED en la última operación del espacio social?
   *
   * No basta con `navigator.onLine`: dice que hay red en cuanto hay interfaz levantada, así que un wifi sin salida
   * o un portal cautivo pasan por conexión buena y el usuario se quedaba con un error de red sin explicación. Este
   * indicador lo enciende el propio fallo (`reportFailure`) y lo apaga la primera operación que vuelve a funcionar.
   */
  const [networkFailure, setNetworkFailure] = useState(false);
  /** Algún servicio (Firestore, GitHub) no atiende ahora: se está viendo lo guardado. Ver `reportFailure`. */
  const [serviceLimited, setServiceLimited] = useState(false);

  /**
   * Temporizador que borra el mensaje de estado. Uno SOLO, reutilizado.
   *
   * Antes cada aviso creaba el suyo y nadie los cancelaba, con dos consecuencias. La visible: dos avisos seguidos
   * se pisaban —el temporizador del PRIMERO seguía vivo y borraba el mensaje del SEGUNDO al cumplirse su plazo, así
   * que un aviso podía durar medio segundo en vez de tres—. Y la de fondo: al salir del hub quedaban temporizadores
   * pendientes que acababan tocando el estado de un componente ya desmontado.
   */
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFeedback = useCallback((kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => {
    setStatusKind(kind);
    setStatus(message);

    // El aviso anterior deja de contar en cuanto llega uno nuevo: si no, su plazo borraría este.
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }

    // Only hard errors should block feed access.
    if (kind === 'ok') {
      setHasBlockingSocialIssue(false);
    } else if (kind === 'err') {
      setHasBlockingSocialIssue(true);
    } else {
      setHasBlockingSocialIssue(false);
    }

    if (kind === 'err') {
      return;
    }

    const ms = duration === 'long' ? 6000 : 3000;
    statusTimerRef.current = setTimeout(() => {
      statusTimerRef.current = null;
      setStatus('');
    }, ms);
  }, []);

  /**
   * Traduce un fallo a un aviso para el usuario. Un fallo de RED no es un error del que haya que hacer nada, así
   * que se cuenta con el mensaje de "sin conexión" y en tono `warn`: en tono `err` encendería
   * `hasBlockingSocialIssue`, que frena la hidratación del feed y bloquea el editor de perfil —o sea, quedarse sin
   * red dejaba el espacio social cerrado además de sin datos nuevos—.
   *
   * Un fallo del SERVICIO (Firestore sin cuota o caído, GitHub limitando, 429/5xx) tampoco: no se arregla tocando
   * nada, solo esperando. Antes salía con su mensaje crudo («Quota exceeded.», en inglés) y en tono `err`, que
   * cerraba el feed y el editor durante horas por un cupo diario. Ahora enciende `serviceLimited` —el aviso
   * persistente de «servicio limitado»— y se sigue con lo guardado (docs/plan-degradacion-servicios.md, fase 2).
   *
   * Lo demás mantiene el comportamiento de siempre (el mensaje del error, que en un 401/403/404 sí dice algo útil,
   * con el texto de la aplicación como respaldo).
   */
  const reportFailure = useCallback((error: unknown, fallback: string, kind: 'err' | 'warn' = 'err') => {
    if (isNetworkFailure(error) || isOffline()) {
      setNetworkFailure(true);
      setFeedback('warn', SOCIAL_UI.status.offline, 'long');
      return;
    }
    setNetworkFailure(false);
    if (isServiceUnavailable(error)) {
      setServiceLimited(true);
      setFeedback('warn', SOCIAL_UI.status.serviceLimited, 'long');
      return;
    }
    setFeedback(kind, error instanceof Error ? error.message : fallback);
  }, [setFeedback]);

  /**
   * La red y el servicio han respondido: se retiran los dos avisos persistentes. Lo llama la hidratación del feed
   * cuando termina bien de verdad (no cuando sale de una copia guardada).
   */
  const markSocialServiceHealthy = useCallback((failed: boolean) => {
    setNetworkFailure(failed);
    if (!failed) setServiceLimited(false);
  }, []);

  // Limpia al desmontar el timer que borra el mensaje de estado (evita setState tras desmontar). El hub se
  // desmonta al salir de /social, así que esto ocurre a menudo. El del cooldown del botón "Actualizar" lo limpia
  // `useSocialDirectory`, que es quien lo arma.
  useEffect(() => () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  }, []);

  return {
    status,
    statusKind,
    hasBlockingSocialIssue,
    networkFailure,
    setNetworkFailure,
    serviceLimited,
    setFeedback,
    reportFailure,
    markSocialServiceHealthy,
  };
}
