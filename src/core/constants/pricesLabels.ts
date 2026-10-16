// LOS TEXTOS DE LOS PRECIOS DE ISTHEREANYDEAL (P3 del plan de la ficha y los precios). Solo los importa el chunk
// perezoso de los precios (`view/components/prices/Prices.tsx`), así que no pesan en el arranque.

export const PRICES_UI = {
  /** La marca corta del renglón y de la caja del mosaico, cuando el precio de ahora iguala el mínimo histórico. */
  lowShort: 'Mínimo',
  /** El sello del recuadro de la ficha. */
  historicLow: 'Mínimo histórico',
  boxAria: 'Precio',
  /** Dónde está el mejor precio. */
  inStore: (store: string) => `En ${store}`,
  noOffer: (store: string) => `Sin oferta ahora · ${store}`,
  until: (date: string) => ` · hasta el ${date}`,
  lowsAria: 'Precios mínimos',
  lows: { historic: 'Histórico', year: 'Último año', months3: '3 meses' },
  otherStoresAria: 'Otras tiendas',
  seeIn: (store: string) => `Ver en ${store}`,
  /** El crédito: en la ficha y al pie de Deseados, con enlace a ITAD. */
  credit: 'Precios de IsThereAnyDeal',
  /**
   * EL EMPAREJAMIENTO, A LA VISTA (P3): ITAD acertó con otro título (la variante con los números cambiados, o un
   * juego distinto). Se dice cuál, para que un emparejamiento equivocado se vea.
   */
  matchedAs: (title: string) => `Precio de: ${title}`,
} as const;
