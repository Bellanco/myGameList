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
export type AppSection = 'lists' | 'social' | 'settings' | 'account' | 'integrations' | 'inbox' | 'legal' | 'admin';

export const APP_ROUTES: ReadonlyArray<{ path: string; section: AppSection }> = [
  { path: '/completados', section: 'lists' },
  { path: '/visitados', section: 'lists' },
  { path: '/en-curso', section: 'lists' },
  { path: '/proximos', section: 'lists' },
  // Comodín: las sub-rutas sociales (perfil, directorio, solicitudes, detalle de reseña…) las resuelve el propio
  // hub con `matchSocialRoute`. Declararlas aquí una a una era la causa de la clase de fallo descrita arriba:
  // añadir una pantalla social obligaba a tocar este fichero o la ruta quedaba inaccesible.
  { path: '/social/*', section: 'social' },
  { path: '/ajustes', section: 'settings' },
  { path: '/cuenta', section: 'account' },
  { path: '/integraciones', section: 'integrations' },
  { path: '/bandeja', section: 'inbox' },
  { path: LEGAL_ROUTES.terms, section: 'legal' },
  { path: LEGAL_ROUTES.privacy, section: 'legal' },
  { path: LEGAL_ROUTES.cookies, section: 'legal' },
  // Ruta OCULTA (sin enlace en la navegación); quien decide el acceso son las reglas de Firestore, no esta tabla.
  { path: '/admin', section: 'admin' },
];

/** Ruta a la que rebota cualquier cosa no listada arriba. */
export const FALLBACK_ROUTE = '/completados';

/** Sección activa para un pathname, con el mismo matcher que usa `<Routes>`. */
export function matchAppSection(pathname: string): AppSection {
  return matchRoutes(APP_ROUTES as Array<{ path: string; section: AppSection }>, pathname)?.[0]?.route.section
    ?? 'lists';
}
