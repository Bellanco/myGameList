// «Compartir» sin lo social: si ya se contestó «Ahora no» en este dispositivo (ver `SHARE_INVITE_DECLINED_KEY`).
//
// Con forma de almacén (`get` / `subscribe`) para `useSyncExternalStore`: la respuesta se da en la burbuja de la
// guía y el botón, que vive en otra parte del árbol, tiene que irse en ese mismo momento.
import { SHARE_INVITE_DECLINED_KEY } from '../../core/constants/storageKeys';

const listeners = new Set<() => void>();
/** Sin almacenamiento la respuesta vale para esta visita: el botón se va igual y vuelve al recargar. */
let declinedInMemory = false;

export const shareInviteStore = {
  get(): boolean {
    try {
      return localStorage.getItem(SHARE_INVITE_DECLINED_KEY) === 'on' || declinedInMemory;
    } catch {
      return declinedInMemory;
    }
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function declineShareInvite(): void {
  try {
    localStorage.setItem(SHARE_INVITE_DECLINED_KEY, 'on');
  } catch {
    declinedInMemory = true;
  }
  for (const listener of listeners) listener();
}
