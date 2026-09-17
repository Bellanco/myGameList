import { useMemo } from 'react';
import { buildListsPool, buildListsWeigher } from '../../../core/roulette/roulette';
import { RouletteModal, type RouletteAction } from './RouletteModal';
import type { RouletteCandidate } from '../../../core/roulette/roulette';
import type { TabData } from '../../../model/types/game';

/**
 * LA RULETA DE LOS LISTADOS: el mismo modal de siempre, con el sorteo de los listados ya puesto.
 *
 * Existe por dónde se calcula el pool, no por lo que hace. `RouletteModal` es genérico a propósito —lo usan
 * también los perfiles ajenos, con otros candidatos y otra ponderación—, así que recibe `candidates` y `weight`
 * ya resueltos. Mientras quien los resolvía era `App`, `buildListsPool` y `buildListsWeigher` se importaban de
 * forma ESTÁTICA y viajaban en el chunk de arranque de todo el mundo, aunque el modal sea perezoso y aunque
 * nadie llegue a abrir la ruleta nunca.
 *
 * Con el cálculo aquí, esas dos funciones —y todo lo que solo ellas usan— entran en el chunk del modal, que es
 * donde se necesitan. De `core/roulette/roulette` el arranque solo conserva `normalizeName`, que la usan el
 * listado y la importación para comparar nombres y no tiene nada que ver con sortear.
 *
 * Los `useMemo` son los mismos que estaban en `App`, con la misma dependencia: `data` cambia en cada edición y
 * recorrer la biblioteca entera en cada render del modal abierto sería trabajo repetido.
 */
interface ListsRouletteModalProps {
  data: TabData;
  open: boolean;
  onClose: () => void;
  title: string;
  tag?: (candidate: RouletteCandidate) => string;
  action?: RouletteAction | null;
}

export function ListsRouletteModal({ data, ...resto }: ListsRouletteModalProps) {
  const candidates = useMemo(() => buildListsPool(data), [data]);
  const weight = useMemo(() => buildListsWeigher(data), [data]);
  return <RouletteModal candidates={candidates} weight={weight} {...resto} />;
}
