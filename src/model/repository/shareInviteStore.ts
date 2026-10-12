// «Compartir» sin lo social: si ya se contestó «Ahora no» en este dispositivo (ver `SHARE_INVITE_DECLINED_KEY`).
//
// Con forma de almacén (`get` / `subscribe`) para `useSyncExternalStore`: la respuesta se da en la burbuja de la
// guía y el botón, que vive en otra parte del árbol, tiene que irse en ese mismo momento.
import { SHARE_INVITE_DECLINED_KEY, SHARE_TIP_SEEN_KEY } from '../../core/constants/storageKeys';

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

/** ¿Se enseñó ya en este dispositivo la burbuja de «puedes compartirla» (ver `SHARE_TIP_SEEN_KEY`)? */
export function readShareTipSeen(): boolean {
  try {
    return localStorage.getItem(SHARE_TIP_SEEN_KEY) === 'on';
  } catch {
    // Sin almacenamiento no se puede recordar: mejor no enseñarla que enseñarla en cada visita.
    return true;
  }
}

export function markShareTipSeen(): void {
  try {
    localStorage.setItem(SHARE_TIP_SEEN_KEY, 'on');
  } catch {
    // Ver `readShareTipSeen`.
  }
}
