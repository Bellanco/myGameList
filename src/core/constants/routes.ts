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
  { path: '/visitados', section: 'lists' },
  { path: '/en-curso', section: 'lists' },
  { path: '/proximos', section: 'lists' },
  // Comodín: las sub-rutas sociales (perfil, directorio, solicitudes, detalle de reseña…) las resuelve el propio
  // hub con `matchSocialRoute`. Declararlas aquí una a una era la causa de la clase de fallo descrita arriba:
  // añadir una pantalla social obligaba a tocar este fichero o la ruta quedaba inaccesible.
  { path: '/social/*', section: 'social' },
  // Panel de estadísticas. La ruta se llamó `/perfil` cuando la pestaña tenía ese nombre; la sección es `stats`
  // para no confundirla con el PERFIL SOCIAL, que es la ficha pública y vive en `/social/profile`.
  // Comodín: el panel resuelve por su cuenta la sub-ruta de tus reseñas (listado y detalle), igual que hace el
  // hub social con las suyas.
  { path: '/perfil/*', section: 'stats' },
  { path: '/perfil', section: 'stats' },
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

/** Ruta a la que rebota cualquier cosa no listada arriba. */
export const FALLBACK_ROUTE = '/completados';

/**
 * ¿El pathname corresponde a una ruta DECLARADA? `matchAppSection` no sirve para preguntarlo: todo lo que no
 * casa cae en `'lists'`. Lo usa el "Volver" con origen ({@link useReturnTo}) para no fiarse de un `state` que
 * viene del historial del navegador.
 */
export function isKnownRoute(pathname: string): boolean {
  return !!matchRoutes(APP_ROUTES as Array<{ path: string; section: AppSection }>, pathname)?.length;
}

/** Sección activa para un pathname, con el mismo matcher que usa `<Routes>`. */
export function matchAppSection(pathname: string): AppSection {
  return matchRoutes(APP_ROUTES as Array<{ path: string; section: AppSection }>, pathname)?.[0]?.route.section
    ?? 'lists';
}
