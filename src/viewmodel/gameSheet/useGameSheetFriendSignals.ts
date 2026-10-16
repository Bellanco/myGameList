import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameSheetSignal } from '../../core/gameSheet/buildGameSheet';
import type { FriendLibraryIndex } from './friendLibraryIndex';

const SIN_SENALES: readonly GameSheetSignal[] = [];
const SIN_INDICE: FriendLibraryIndex = { signals: [], missing: 0 };

/** Lo que la ficha sabe de tus amistades, y de cuántas no se pudo leer la biblioteca. */
export interface GameSheetFriendSignals {
  signals: readonly GameSheetSignal[];
  missing: number;
}

/**
 * LO QUE LA FICHA SABE DE TUS AMISTADES, de dos fuentes que llegan por separado cada vez que la ficha se abre:
 *  · el canal social (F3): reseñas y avisos de lista, de la copia del directorio. Una lectura de IndexedDB, sin red;
 *  · el índice de sus bibliotecas (F4): quién lo tiene aunque no lo haya reseñado ni movido. Llega después, con su
 *    `import()` (va fuera del precache) y, si toca por el plazo del rango, con lecturas condicionales a GitHub.
 * Mientras tanto la ficha se pinta con lo que haya, y lo demás entra después. Las dos cargas van con `import()` y fuera
 * del precache, como la sección que las pinta (`GameSheetFriends`): lo de tus amistades es opcional y el panel no cabía
 * en el presupuesto total con ellas dentro.
 *
 * Sin espacio social, o sin nada de nadie, se queda vacío sin tocar el estado: la ficha no se vuelve a pintar por nada.
 * Si el chunk del índice no llega (sin red tras un despliegue), se queda con lo del canal: es opcional (F0.10).
 */
export function useGameSheetFriendSignals(open: boolean): GameSheetFriendSignals {
  const [canal, setCanal] = useState<readonly GameSheetSignal[]>(SIN_SENALES);
  const [indice, setIndice] = useState<FriendLibraryIndex>(SIN_INDICE);
  const hayCanal = useRef(false);
  const hayIndice = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    let vigente = true;
    void import('./gameSheetFriendSignals')
      .then((modulo) => modulo.loadGameSheetFriendSignals())
      .then((nuevas) => {
        if (!vigente || (!nuevas.length && !hayCanal.current)) return;
        hayCanal.current = nuevas.length > 0;
        setCanal(nuevas);
      })
      .catch(() => {
        // El chunk no llegó: la ficha sigue sin lo de tus amistades.
      });
    void import('./friendLibraryIndex')
      .then((modulo) => modulo.loadFriendLibraryIndex())
      .then((nuevo) => {
        const tieneAlgo = nuevo.signals.length > 0 || nuevo.missing > 0;
        if (!vigente || (!tieneAlgo && !hayIndice.current)) return;
        hayIndice.current = tieneAlgo;
        setIndice(nuevo);
      })
      .catch(() => {
        // El chunk no llegó: la ficha sigue con lo del canal.
      });
    return () => {
      vigente = false;
    };
  }, [open]);

  const signals = useMemo(
    () => (indice.signals.length ? [...canal, ...indice.signals] : canal),
    [canal, indice.signals],
  );
  return { signals, missing: indice.missing };
}
