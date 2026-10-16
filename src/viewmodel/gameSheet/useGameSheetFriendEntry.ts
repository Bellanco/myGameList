import { useEffect, useState } from 'react';
import type { FriendGameEntry } from './friendLibraryIndex';

/**
 * EL BLOQUE DE LA AMISTAD DESDE CUYO PERFIL SE ABRIÓ LA FICHA (`?de=`, F0.7): lo que esa persona tiene de ese juego, o
 * `null` mientras llega, si no lo tiene o si no se puede leer. Se carga con `import()`, como todo lo de tus amistades:
 * va fuera del precache y es opcional (F0.10).
 *
 * Se guarda con la clave y la amistad para las que se pidió: al pasar a otra ficha, el bloque de la anterior no se
 * queda pintado mientras llega el nuevo.
 */
export function useGameSheetFriendEntry(open: boolean, friendId: string, slug: string): FriendGameEntry | null {
  const [cargada, setCargada] = useState<{ clave: string; entrada: FriendGameEntry | null } | null>(null);
  const clave = `${friendId}|${slug}`;

  useEffect(() => {
    if (!open || !friendId || !slug) return undefined;
    let vigente = true;
    void import('./friendLibraryIndex')
      .then((modulo) => modulo.loadFriendGameEntry(friendId, slug))
      .then((entrada) => {
        if (vigente && entrada) setCargada({ clave: `${friendId}|${slug}`, entrada });
      })
      .catch(() => {
        // El chunk no llegó: la ficha sigue sin el bloque.
      });
    return () => {
      vigente = false;
    };
  }, [open, friendId, slug]);

  return cargada?.clave === clave ? cargada.entrada : null;
}
