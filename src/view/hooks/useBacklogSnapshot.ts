import { useEffect } from 'react';
import { runWhenIdle } from '../../core/utils/idle';
import { recordBacklogSnapshot } from '../../model/repository/statsSnapshotRepository';
import type { TabData } from '../../model/types/game';

/**
 * Anota el tamaño de las listas del mes en curso. Se monta APP-WIDE (en `App`) y no en el panel "Perfil": el
 * histórico tiene que acumularse se visite o no esa pantalla, que además es perezosa.
 *
 * Se dispara con cada cambio de `data` para que el punto del mes refleje el último estado observado, pero el
 * trabajo va en idle y el repositorio descarta lo que no cambia nada, así que editar un juego no escribe en
 * IndexedDB por este camino.
 */
export function useBacklogSnapshot(data: TabData): void {
  useEffect(() => runWhenIdle(() => {
    void recordBacklogSnapshot(data, Date.now());
  }), [data]);
}
