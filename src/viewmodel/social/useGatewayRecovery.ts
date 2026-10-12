// EL ATAJO DE GOOGLE DE LA PASARELA: quien ya tiene espacio social y llega a un dispositivo sin GitHub conectado
// (otro navegador, datos borrados) no tiene por qué volver a autorizar GitHub. Su cuenta de Google guarda en
// `privateConfig` el token cifrado y el gist de juegos: entrando con Google se recuperan, se conecta la
// sincronización y el hub enlaza solo el espacio que ya existía (el auto-enlace de `useSocialGateway`).
//
// Lo único que guarda esta pieza es la respuesta «tu cuenta no tiene nada», y atada a la cuenta que la dio: si se
// cierra la sesión y entra otra, esa respuesta ya no vale y el atajo vuelve.
import { useCallback, useState } from 'react';
import type { GithubConnection } from '../sync/githubConnection';

export interface GatewayRecovery {
  /** ¿Se ofrece el atajo? Solo sin sincronización y mientras no conste que la cuenta no tiene nada. */
  available: boolean;
  /** La cuenta con sesión ya respondió que no tiene nada guardado: el camino es GitHub. */
  accountHasNothing: boolean;
  recovering: boolean;
  recover: () => void;
}

export function useGatewayRecovery(
  connection: GithubConnection | null,
  hasMainSync: boolean,
  authUid: string | undefined,
): GatewayRecovery {
  const [emptyAccountUid, setEmptyAccountUid] = useState('');
  const recoverFromGoogle = connection?.recoverFromGoogle;

  const recover = useCallback(() => {
    if (!recoverFromGoogle) return;
    void recoverFromGoogle('social').then((result) => {
      if (result.outcome === 'missing' && result.uid) setEmptyAccountUid(result.uid);
    });
  }, [recoverFromGoogle]);

  const accountHasNothing = Boolean(authUid) && emptyAccountUid === authUid;
  return {
    available: Boolean(recoverFromGoogle) && !hasMainSync && !accountHasNothing,
    accountHasNothing: !hasMainSync && accountHasNothing,
    recovering: Boolean(connection?.recoveringGistId),
    recover,
  };
}
