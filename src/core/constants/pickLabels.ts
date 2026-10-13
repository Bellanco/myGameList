// TEXTOS DE «¿A QUÉ JUEGO AHORA?» (la pantalla `/elegir`). Aparte de `labels.ts` porque la pantalla llega por `lazy()`:
// allí viajarían en el arranque de todo el mundo, y el arranque va justo de peso.
import type { TabId } from '../../model/types/game';

/** El nombre de la lista de la que sale cada juego, en la pastilla de su caja. Dice qué se haría con él, no dónde está. */
const LIST_TAG: Record<TabId, string> = {
  p: 'Próximo',
  v: 'Otra oportunidad',
  c: 'Rejugar',
  e: 'En curso',
  d: 'Deseado',
};

export const PICK_UI = {
  title: '¿A qué juego ahora?',
  genres: 'Género',
  platforms: 'Plataforma',
  clear: 'Quitar',
  clearAria: (facet: string) => `Quitar el filtro de ${facet.toLowerCase()}`,
  showAll: 'Ver todos',
  showLess: 'Ver menos',
  /** El contador de una opción, para el lector de pantalla: el número suelto no dice de qué es. */
  optionAria: (value: string, count: number) => `${value}, ${count} ${count === 1 ? 'juego' : 'juegos'}`,
  count: (total: number) => `${total} ${total === 1 ? 'opción' : 'opciones'}`,
  breakdown: (p: number, v: number, c: number) => `${p} próximos, ${v} abandonados, ${c} completados`,
  legendAria: 'Qué color tiene cada lista',
  legend: { p: 'Próximo', v: 'Abandonado', c: 'Completado' } as Record<'p' | 'v' | 'c', string>,
  listTag: (tab: TabId) => LIST_TAG[tab],
  spin: 'Gira ahora',
  spinTitle: 'Elige tu próximo juego',
  start: 'Empezar',
  startAria: (name: string) => `Empezar ${name}: pasa a En curso`,
  started: 'Empezado',
  empty: 'No hay juegos para elegir. Añade próximos, o marca «Rejugar» en un completado o «¿Dar otra oportunidad?» en un abandonado.',
  noMatch: 'Ningún juego cumple los filtros.',
  clearAll: 'Quitar los filtros',
  results: 'Juegos que puedes empezar',
} as const;
