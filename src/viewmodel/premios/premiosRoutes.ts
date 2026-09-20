/**
 * Sub-rutas de la porra. Mismo patrón que `social/socialRoutes`: una tabla de patrones de react-router en vez de
 * expresiones regulares escritas a mano, para que no puedan divergir del resto del enrutado.
 *
 * AQUÍ ES DONDE LOS PASOS DEJAN DE SER ESTADO. En la aplicación de origen la votación avanzaba con un número en
 * memoria y empujaba entradas de historial sin cambiar la URL: el botón «atrás» funcionaba, pero nadie podía
 * enlazar una categoría, recargar sin volver al principio, ni abrir dos pestañas. Con el paso en la dirección,
 * todo eso sale gratis y el historial lo lleva el router.
 */
import { matchPath } from 'react-router-dom';

/** Panel visible de la sección. `portada` es el estado por defecto y el de `/premios` a secas. */
export type PremiosPanel = 'portada' | 'votar' | 'revisar' | 'enviada' | 'resultados';

export const PREMIOS_ROUTES = {
  home: '/premios',
  vote: '/premios/votar/:paso',
  review: '/premios/revisar',
  /** Confirmación de envío. Tiene dirección propia para que recargar no la haga desaparecer. */
  sent: '/premios/enviada',
  results: '/premios/resultados',
  /** Una edición concreta del histórico. Es la dirección que se comparte. */
  resultsSeason: '/premios/resultados/:seasonId',
} as const;

export interface PremiosRouteState {
  panel: PremiosPanel;
  /** Paso de votación, 1..n. 0 cuando no se está votando. */
  paso: number;
  /** Edición pedida en la dirección; vacío = la última publicada. */
  seasonId: string;
}

const EMPTY: PremiosRouteState = { panel: 'portada', paso: 0, seasonId: '' };

/** Descodifica un parámetro. Tolera lo mal formado: una URL manipulada no puede tumbar el render. */
function decode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function matchPremiosRoute(pathname: string): PremiosRouteState {
  const vote = matchPath(PREMIOS_ROUTES.vote, pathname);
  if (vote) {
    // Un paso que no sea un número positivo se trata como el primero: es una dirección escrita a mano, y llevar a
    // la primera categoría es más útil que una pantalla vacía.
    const paso = Number.parseInt(decode(vote.params.paso), 10);
    return { ...EMPTY, panel: 'votar', paso: Number.isFinite(paso) && paso > 0 ? paso : 1 };
  }

  if (matchPath(PREMIOS_ROUTES.review, pathname)) {
    return { ...EMPTY, panel: 'revisar' };
  }

  if (matchPath(PREMIOS_ROUTES.sent, pathname)) {
    return { ...EMPTY, panel: 'enviada' };
  }

  const season = matchPath(PREMIOS_ROUTES.resultsSeason, pathname);
  if (season) {
    return { ...EMPTY, panel: 'resultados', seasonId: decode(season.params.seasonId) };
  }

  if (matchPath(PREMIOS_ROUTES.results, pathname)) {
    return { ...EMPTY, panel: 'resultados' };
  }

  return EMPTY;
}

/** Dirección del paso de votación pedido. */
export function votePath(paso: number): string {
  return `/premios/votar/${Math.max(1, Math.trunc(paso))}`;
}

/** Dirección de una edición archivada. */
export function resultsPath(seasonId?: string): string {
  return seasonId ? `/premios/resultados/${encodeURIComponent(seasonId)}` : PREMIOS_ROUTES.results;
}

/**
 * ¿Este panel exige sesión iniciada?
 *
 * SOLO VOTAR Y REVISAR. La portada y los resultados se ven SIN CUENTA a propósito: el calendario es de lectura
 * pública y el archivo de una edición publicada también, porque quien recibe el enlace tiene que poder ver quién
 * ganó (ver `docs/plan-unificar-premios.md` §4.2).
 *
 * Vive aquí, como función pura, porque la primera versión lo resolvía con un `panel !== 'portada'` escrito en el
 * componente y eso dejaba los RESULTADOS pidiendo sesión — justo la pantalla que se comparte por enlace. Con la
 * regla fuera de la vista se puede probar sin montar el hub entero.
 */
export function panelNeedsSession(panel: PremiosPanel): boolean {
  return panel === 'votar' || panel === 'revisar';
}
