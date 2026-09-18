// Tabla de rutas de la app: FUENTE ÚNICA para el matching y para el render.
//
// Antes había dos listas que había que mantener a mano y en sincronía: una cadena de ternarios sobre el
// `pathname` decidía QUÉ pantalla pintar, y un `<Routes>` aparte —con todos sus `element={null}`— existía solo
// para que el catch-all no rebotara las rutas válidas. Olvidar una entrada en la segunda hacía que la pantalla
// desapareciera rebotando a /completados, que es exactamente el fallo que tuvo `/social/requests`.
//
// Ahora `<Routes>` se genera de esta tabla y la sección activa se resuelve con el MISMO matcher de react-router
// (ver `matchAppSection`), así que no hay dos sitios que puedan discrepar.
import { matchRoutes } from 'react-router-dom';
import { LEGAL_ROUTES } from './legal';

/** Zona de la app; decide la navegación inferior, el encabezado y el cromo alrededor del contenido. */
export type AppSection = 'lists' | 'social' | 'stats' | 'settings' | 'account' | 'inbox' | 'legal' | 'admin' | 'shared-review';

export const APP_ROUTES: ReadonlyArray<{ path: string; section: AppSection }> = [
  { path: '/completados', section: 'lists' },
  { path: '/abandonados', section: 'lists' },
  { path: '/en-curso', section: 'lists' },
  { path: '/proximos', section: 'lists' },
  // Comodín: las sub-rutas sociales (perfil, directorio, solicitudes, detalle de reseña…) las resuelve el propio
  // hub con `matchSocialRoute`. Declararlas aquí una a una era la causa de la clase de fallo descrita arriba:
  // añadir una pantalla social obligaba a tocar este fichero o la ruta quedaba inaccesible.
  { path: '/social/*', section: 'social' },
  // Panel de estadísticas. Se llamó `/perfil` porque así se llamaba la pestaña, y ese nombre chocaba con el
  // PERFIL SOCIAL —la ficha pública, que vive en `/social/profile`—: la sección ya era `stats` para deshacer el
  // equívoco, y ahora también lo es la dirección. El nombre viejo sigue resolviendo, ver `LEGACY_ROUTE_REDIRECTS`.
  // Comodín: el panel resuelve por su cuenta la sub-ruta de tus reseñas (listado y detalle), igual que hace el
  // hub social con las suyas.
  { path: '/stats/*', section: 'stats' },
  { path: '/stats', section: 'stats' },
  // Los LOGROS son de primer nivel y no una sub-ruta del panel, a diferencia de `/stats/resenas`. Cuesta esta
  // línea, y a cambio es una dirección que se dice en voz alta: el comodín `/stats/*` habría salido gratis, pero
  // deja la pantalla escondida detrás del nombre de otra cosa. La sección sigue siendo `stats` porque el cromo
  // es el mismo y lo resuelve `StatsHub`.
  { path: '/logros', section: 'stats' },
  // Ajustes y sus cuatro grupos. Comodín por el mismo motivo que en social y en el panel: la pantalla resuelve
  // por su cuenta cuál de los cuatro toca (ver `SETTINGS_ROUTES`), y así añadir uno no obliga a tocar esta tabla.
  { path: '/ajustes/*', section: 'settings' },
  { path: '/ajustes', section: 'settings' },
  { path: '/cuenta', section: 'account' },
  { path: '/bandeja', section: 'inbox' },
  { path: LEGAL_ROUTES.terms, section: 'legal' },
  { path: LEGAL_ROUTES.privacy, section: 'legal' },
  { path: LEGAL_ROUTES.cookies, section: 'legal' },
  // Ruta OCULTA (sin enlace en la navegación); quien decide el acceso son las reglas de Firestore, no esta tabla.
  { path: '/admin', section: 'admin' },
  // Reseña compartida con enlace público. Quien NO tiene la app en este navegador ni llega aquí: `main.tsx` monta
  // una pantalla suelta antes del enrutador (modo artículo). Esta entrada es para quien SÍ la tiene, y sin ella
  // el enlace rebotaría a `FALLBACK_ROUTE` — que es exactamente el fallo que documenta la nota de arriba.
  { path: '/r/:token', section: 'shared-review' },
];

/**
 * Rutas RETIRADAS que siguen resolviendo, redirigiendo a su nombre actual. La lista de abandonados nació como
 * `/visitados` —un nombre que no decía lo que era— y renombrarla en seco habría mandado a `FALLBACK_ROUTE`
 * cualquier marcador, acceso directo o enlace compartido que ya apuntase allí. Las pinta `App` como `<Navigate>`
 * antes del catch-all; no van en `APP_ROUTES` porque ahí pintarían la pantalla en vez de redirigir.
 */
export const LEGACY_ROUTE_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/visitados', to: '/abandonados' },
  // El panel de estadísticas se llamó `/perfil`. El comodín NO es un adorno de simetría: `/perfil/resenas/:id`
  // es una dirección pensada para abrirse en otra pestaña y copiarse (ver el enlace del detalle en `GameTable`),
  // así que la redirección tiene que conservar LO QUE VENGA DETRÁS o un enlace ya guardado acabaría en
  // `FALLBACK_ROUTE`, que es justo el fallo que documenta la nota de arriba. Las entradas con `/*` las pinta
  // `App` con un redirector que arrastra la cola, la búsqueda y el ancla; va ANTES que la entrada sin comodín
  // porque react-router se queda con la primera que case.
  { from: '/perfil/*', to: '/stats' },
  { from: '/perfil', to: '/stats' },
];

/**
 * ¿Cubre esta entrada retirada el `pathname` dado? Las que acaban en `/*` cubren también todo lo que cuelgue,
 * que es lo que hace que `/perfil/resenas/7` se reconozca como ruta conocida y no como dirección inventada.
 */
function coversLegacy(from: string, pathname: string): boolean {
  if (!from.endsWith('/*')) return from === pathname;
  const base = from.slice(0, -2);
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Destino de una entrada retirada, con lo que colgaba del nombre viejo pegado detrás. */
export function legacyRedirectTarget(to: string, tail: string): string {
  return tail ? `${to}/${tail}` : to;
}

/**
 * LOS CUATRO GRUPOS DE AJUSTES, que son los cuatro puntos del menú de la pestaña. Uno por asunto y cada uno en
 * su dirección, para que la pantalla quepa sin scroll y se pueda enlazar.
 *
 * `personalization` es el único con puerta: reúne lo que se guarda en la nube de quien tiene espacio social
 * (escala de nota, enlaces publicados) junto a la apariencia, así que sin ese espacio no hay nada que enseñar.
 * Los otros tres no dependen de ninguna cuenta —la sincronización usa GitHub, no Google— y por eso están
 * siempre, también para quien usa la aplicación en local.
 */
export const SETTINGS_ROUTES = {
  personalization: '/ajustes/personalizacion',
  integration: '/ajustes/integracion',
  filters: '/ajustes/filtros',
  legal: '/ajustes/legal',
} as const;

export type SettingsGroup = keyof typeof SETTINGS_ROUTES;

/** Ruta a la que rebota cualquier cosa no listada arriba. */
export const FALLBACK_ROUTE = '/completados';

/**
 * ¿El pathname corresponde a una ruta DECLARADA? `matchAppSection` no sirve para preguntarlo: todo lo que no
 * casa cae en `'lists'`. Lo usa el "Volver" con origen ({@link useReturnTo}) para no fiarse de un `state` que
 * viene del historial del navegador.
 */
export function isKnownRoute(pathname: string): boolean {
  if (LEGACY_ROUTE_REDIRECTS.some(({ from }) => coversLegacy(from, pathname))) return true;
  return !!matchRoutes(APP_ROUTES as Array<{ path: string; section: AppSection }>, pathname)?.length;
}

/** Sección activa para un pathname, con el mismo matcher que usa `<Routes>`. */
export function matchAppSection(pathname: string): AppSection {
  return matchRoutes(APP_ROUTES as Array<{ path: string; section: AppSection }>, pathname)?.[0]?.route.section
    ?? 'lists';
}
