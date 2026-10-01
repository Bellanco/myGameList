import type { TabData } from '../../model/types/game';
import { useBacklogSnapshot } from '../hooks/useBacklogSnapshot';
import { useCoverBackfill } from '../hooks/useCoverBackfill';
import { useShootingStars } from '../hooks/useShootingStars';
import { useSignatureEffects } from '../hooks/useSignatureEffects';

interface IdleWorkProps {
  data: TabData;
}

/**
 * LO QUE `App` HACE DE FONDO, en un componente que no pinta nada, para poder sacarlo del chunk de arranque.
 *
 * Son cuatro hooks que no hacen falta para el primer pintado:
 *   · Los EFECTOS DE FIRMA (`useSignatureEffects`) responden a una interacción —un clic en un botón, cerrar un
 *     juego, cambiar de tema—, y ninguna puede ocurrir antes de que la pantalla esté delante.
 *   · Las ESTRELLAS FUGACES de Sea of Stars (`useShootingStars`) salen a ratos y al azar: que la primera llegue
 *     unos milisegundos más tarde no se distingue.
 *   · El HISTÓRICO DEL BACKLOG (`useBacklogSnapshot`) y el RECORRIDO DE CARÁTULAS (`useCoverBackfill`) ya
 *     esperaban a que el navegador quedara ocioso; ahora su código también. Se montan desde `App` y no desde el
 *     panel de estadísticas porque la serie del backlog tiene que acumularse se visite o no esa pantalla
 *     (`listedAt` se reescribe al mover de lista: sin este registro no hay forma de saber cómo evoluciona).
 *
 * Como hooks llamados desde `App` entraban en el arranque (~1,6 kB comprimidos los tres últimos, medido el
 * 01-10-2026); envueltos así, `lazy()` se los lleva a UN chunk —uno y no cuatro: una sola petición— y `App` lo
 * monta cuando el navegador queda ocioso, igual que el resto del sprite de iconos. Si el chunk no llega (sin red,
 * recién desplegado) no hay efectos ni recorrido en esa sesión, y la lista sigue igual.
 *
 * NO SE TOCAN LOS HOOKS. Este fichero existe precisamente para no tener que reescribirlos: lo que se mueve es
 * DÓNDE se montan, no lo que hacen.
 */
export function IdleWork({ data }: IdleWorkProps): null {
  useSignatureEffects();
  useShootingStars();
  useBacklogSnapshot(data);
  useCoverBackfill(data);
  return null;
}
