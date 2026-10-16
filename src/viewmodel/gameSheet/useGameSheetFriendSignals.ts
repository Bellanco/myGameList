import { useEffect, useRef, useState } from 'react';
import type { GameSheetSignal } from '../../core/gameSheet/buildGameSheet';
import { loadGameSheetFriendSignals } from './gameSheetFriendSignals';

const SIN_SENALES: readonly GameSheetSignal[] = [];

/**
 * LAS SEÑALES DE TUS AMISTADES PARA LA FICHA (F3), leídas de la copia del directorio social cada vez que la ficha se
 * abre: es una lectura de IndexedDB, sin red, y así lo que el hub haya refrescado mientras tanto entra en la siguiente
 * ficha. Mientras llegan, la ficha se pinta con lo tuyo y la sección de amistades entra después.
 *
 * Sin espacio social, o sin nada de nadie, se queda en la lista vacía de siempre, sin tocar el estado: la ficha no se
 * vuelve a pintar por nada.
 */
export function useGameSheetFriendSignals(open: boolean): readonly GameSheetSignal[] {
  const [signals, setSignals] = useState<readonly GameSheetSignal[]>(SIN_SENALES);
  const hayAlgo = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    let vigente = true;
    void loadGameSheetFriendSignals().then((nuevas) => {
      if (!vigente || (!nuevas.length && !hayAlgo.current)) return;
      hayAlgo.current = nuevas.length > 0;
      setSignals(nuevas);
    });
    return () => {
      vigente = false;
    };
  }, [open]);

  return signals;
}
