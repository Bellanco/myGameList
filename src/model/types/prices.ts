// LOS PRECIOS DE ISTHEREANYDEAL (Parte 2 del plan de la ficha y los precios, `docs/plan-ficha-de-juego-y-precios.md`).
// Los comparten el borde (`functions/_lib/itad.ts`, que los arma) y el cliente (`pricesRepository`, que los guarda y
// los pinta). Sin dependencias: `functions/` solo puede importar del bundle módulos así.

/** Una oferta de una tienda. Las `url` van tal cual las da ITAD (sus condiciones lo piden). */
export interface OfertaItad {
  tienda: string;
  precio: number;
  /** Precio sin rebaja; `null` si ITAD no lo da. */
  normal: number | null;
  /** Descuento en %, 0 si no hay. */
  descuento: number;
  /** Hasta cuándo dura (ISO), si se sabe. */
  hasta: string | null;
  url: string;
}

/** El precio de un juego, como lo pinta el recuadro de la ficha (F0.15). */
export interface PrecioItad {
  /** El título con el que acertó ITAD: el tuyo o su variante con los números cambiados («Precio de: …», P3). */
  titulo: string;
  itadId: string;
  /** La oferta más barata ahora, o `null` si ninguna tienda lo vende. */
  mejor: OfertaItad | null;
  /** Las dos tiendas siguientes más baratas (distintas de la mejor). */
  otras: OfertaItad[];
  minimos: {
    historico: { precio: number; fecha: string | null } | null;
    anio: number | null;
    tresMeses: number | null;
  };
  /** La página del juego en ITAD (crédito y «ver más»), tal cual la da ITAD. */
  urlFicha: string | null;
  /** Los packs activos que lo contienen (para el aviso de la P4). */
  bundles: Array<{ titulo: string; url: string; expira: string | null }>;
}

/** Lo que devuelve `/api/precios`: un precio por título pedido (`null` si ITAD no lo encuentra). */
export interface PreciosRespuesta {
  juegos: Record<string, PrecioItad | null>;
  /** ITAD no contestó: parte de lo que hay salió de lo guardado en el borde, o vacío. */
  incompleto?: boolean;
}
