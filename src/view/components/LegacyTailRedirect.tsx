import { Navigate, useLocation, useParams } from 'react-router-dom';
import { legacyRedirectTarget } from '../../core/constants/routes';

/**
 * Redirección de un nombre RETIRADO que tenía sub-rutas: manda al nombre nuevo arrastrando lo que colgaba del
 * viejo. Un `<Navigate to="/stats">` a secas se come la cola, y con ella el enlace que alguien copió: el detalle
 * de una reseña (`/perfil/resenas/7`) está hecho para abrirse en otra pestaña y compartirse, así que perderlo
 * significaría rebotar a `FALLBACK_ROUTE` a quien lo tuviera guardado. La búsqueda y el ancla viajan también,
 * que no cuestan nada y son parte de la dirección.
 *
 * Lo pinta `App` para cada entrada de `LEGACY_ROUTE_REDIRECTS` cuyo `from` acabe en `/*`; las demás siguen
 * siendo un `<Navigate>` normal, que para un nombre sin hijos es exactamente lo que hace falta.
 */
export function LegacyTailRedirect({ to }: { to: string }) {
  const { '*': tail } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${legacyRedirectTarget(to, tail ?? '')}${search}${hash}`} replace />;
}
