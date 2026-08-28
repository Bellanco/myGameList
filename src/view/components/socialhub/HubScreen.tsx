import type { ReactNode } from 'react';
import type { IconName } from '../../../core/constants/icons';
import { Icon } from '../Icon';

/**
 * Cáscara de una pantalla del hub social: la sección, su tarjeta y el encabezado con icono, título y subtítulo.
 *
 * Existe porque ese armazón estaba escrito a mano en todas las pantallas del hub —y DOS veces dentro de varias
 * de ellas, una para el estado vacío y otra para el estado con datos—, siempre con el mismo marcado y la misma
 * jerarquía de clases. Va en la línea de `HubStatus`, `HubAvatar` y `HubBackButton`, que ya viven aquí.
 *
 * Lo que va debajo del encabezado —la fila de acciones con el botón "Atrás", el contenido, el `HubStatus`— lo
 * pone cada pantalla como `children`: es lo que de verdad cambia entre unas y otras.
 *
 * Tres pantallas se quedan fuera, y ninguna por olvido:
 *
 *  - `SocialFeedScreen` mete el texto del encabezado en un envoltorio propio y cuelga el avatar del usuario como
 *    hermano; encajarlo aquí habría pedido tres props más para tapar una sola diferencia.
 *  - `SocialProfileDetailScreen` cuelga el modal de la ruleta como HERMANO de la tarjeta, dentro de la sección.
 *    Meterlo dentro lo pondría bajo `.hub-hub-card p`, que da estilo a cualquier párrafo descendiente, así que
 *    sería un cambio de aspecto disfrazado de refactorización.
 *  - La pantalla pública de una reseña y el esqueleto de carga viven fuera del chunk del hub y no deben
 *    arrastrarlo.
 */
export interface HubScreenProps {
  /** Etiqueta accesible de la sección. */
  ariaLabel: string;
  title: string;
  subtitle?: string;
  /** Icono del encabezado. `bottom-hub` es el del hub; el detalle de una reseña usa `signature`. */
  icon?: IconName;
  /** Añadido dentro del título, a la derecha (hoy: el chip de estado del perfil propio). */
  titleExtra?: ReactNode;
  /** Clase extra de la tarjeta. Casi todas usan la del feed; el perfil propio tiene la suya. */
  cardClassName?: string;
  children: ReactNode;
}

export function HubScreen({
  ariaLabel,
  title,
  subtitle,
  icon = 'bottom-hub',
  titleExtra,
  cardClassName = 'hub-feed-card-shell',
  children,
}: HubScreenProps) {
  return (
    <section className="hub-hub hub-screen" aria-label={ariaLabel}>
      <div className={`hub-hub-card hub-screen-card ${cardClassName}`.trim()}>
        <header className="hub-screen-header">
          <div className="hub-hub-title-wrap">
            <Icon name={icon} className="hub-hub-icon" />
            <h2>{title}</h2>
            {titleExtra}
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}
