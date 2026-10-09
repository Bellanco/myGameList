// UNA SOLA EJECUCIÓN EN VUELO.
//
// Envuelve una acción asíncrona para que, mientras una llamada no termine, las siguientes se ignoren. Hace falta
// cuando la acción espera algo ANTES de poder marcarse como ocupada (descifrar un token, leer la configuración):
// el `disabled` del botón llega un render tarde, y un doble clic en ese hueco lanzaba la escritura dos veces —dos
// escrituras del gist y dos reconciliaciones al guardar el perfil (09-10-2026)—. El cerrojo es una ref, síncrona, así
// que el segundo clic lo encuentra cerrado aunque React aún no haya repintado nada.
import { useCallback, useRef } from 'react';

export function useSingleFlight<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  const inFlight = useRef(false);
  return useCallback(async (...args: Args) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await action(...args);
    } finally {
      inFlight.current = false;
    }
  }, [action]);
}
