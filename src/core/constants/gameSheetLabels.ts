// TEXTOS DE LA FICHA DE UN JUEGO (el panel lateral que sustituye al detalle de la fila; ver
// `docs/plan-ficha-de-juego-y-precios.md`). Aparte de `labels.ts` porque el panel llega por `lazy()`: allí viajarían
// en el arranque de todo el mundo. Los rótulos del detalle (plataformas, puntos fuertes, «Ver análisis»…) siguen en
// `UI_MESSAGES.detail`, que comparten la tabla y la ficha.
import type { TabId } from '../../model/types/game';
import { APP_LOCALE } from './locale';

/** Tu lista, en la pastilla de la cabecera: dice dónde está el juego, no qué hacer con él. */
const LIST_PILL: Record<TabId, string> = {
  c: 'Completado',
  v: 'Abandonado',
  e: 'En curso',
  p: 'En próximos',
  d: 'En tus deseos',
};

/** Lo mismo, en minúscula, para la línea de una entrega de la saga («Tú: en deseos»). */
const LIST_SHORT: Record<TabId, string> = {
  c: 'completado',
  v: 'abandonado',
  e: 'en curso',
  p: 'en próximos',
  d: 'en deseos',
};

const MONTH_YEAR = new Intl.DateTimeFormat(APP_LOCALE, { month: 'long', year: 'numeric' });

export const GAME_SHEET_UI = {
  /** Nombre accesible del panel. */
  panelAria: (name: string) => `Ficha de ${name}`,
  close: 'Cerrar',
  listPill: (tab: TabId) => LIST_PILL[tab],
  /** Desde cuándo está en esa lista (`enteredAt`). */
  since: (at: number) => `desde ${MONTH_YEAR.format(at)}`,
  yourScore: 'Tu nota',
  yourInterest: 'Tu interés',
  friendsAverage: 'Media de tus amistades',
  friendsAverageCount: (count: number) => `· ${count} ${count === 1 ? 'nota' : 'notas'}`,
  friendsOwning: 'Lo tienen',
  friendsCount: (count: number) => (count === 1 ? 'amistad' : 'amistades'),
  /** La sección de quienes lo tienen, y la de quienes lo quieren (sus deseos, aparte y sin nota). */
  friendsTitle: 'Tus amistades',
  wishersTitle: 'Lo quieren',
  /** Adelanto de su reseña, entre comillas latinas como el resto de citas de la app. */
  friendSnippet: (snippet: string) => `«${snippet}»`,
  friendOpenAria: (name: string) => `Ver el perfil de ${name}`,
  /** El tiempo jugado, en las cifras de la cabecera: la cifra grande y la unidad pequeña («46 horas»). */
  hours: (hours: number) => String(hours).replace('.', ','),
  hoursUnit: (hours: number) => (hours === 1 ? 'hora' : 'horas'),
  yearsAria: 'Años en los que se completó',
  saga: 'Saga',
  sagaOwn: (tab: TabId | null) => (tab ? `Tú: ${LIST_SHORT[tab]}` : 'No lo tienes'),
  sagaFriends: (count: number) => `${count} ${count === 1 ? 'amistad' : 'amistades'}`,
  sagaOpenAria: (name: string) => `Abrir la ficha de ${name}`,
  platformsAria: 'Plataformas',
  genresAria: 'Géneros',
} as const;
