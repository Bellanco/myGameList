import type React from 'react';
import { HubAvatar } from './HubAvatar';

/**
 * RENGLÓN DE PERSONA de «Perfiles» (`/social/profiles`), para amigos y para el resto (14-10-2026): avatar, nombre,
 * una línea de estado y, si hay acción, la acción a la derecha.
 *
 * Sustituye a la tarjeta vertical (`HubUserCard`, que sigue en la bandeja), que era una caja grande con una silueta y
 * un nombre: casi vacía, y en el móvil cinco amigos ocupaban tres filas. En renglón cabe más gente por pantalla y
 * queda sitio para decir algo de cada uno.
 *
 * LA CARÁTULA, DETRÁS. Con un amigo, la portada de lo que juega o acaba de terminar va recortada en franja detrás de
 * la fila, con la receta del renglón del listado (`_table.scss`, «LA CARÁTULA EN EL RENGLÓN»). Va en un HIJO y no en
 * un seudoelemento: el `::after` de la tarjeta de persona es el del estado «ocupado».
 *
 * Lleva las clases de la tarjeta de persona (`hub-feed-card hub-user-card`) para heredar la piel de cada tema
 * —moldura, filete, sombra—, y del nombre (`hub-user-card-name`), que Witcher escribe con su letra.
 *
 * PRESENTACIONAL: la acción llega como `children` y el estado ya escrito; no sabe nada de amistades.
 */
export function HubPersonRow({
  name,
  photoURL,
  status,
  lastSeen,
  coverUrl,
  highlight = false,
  busy = false,
  onOpen,
  openAriaLabel,
  onKeyDown,
  children,
}: {
  name: string;
  photoURL?: string;
  /** La línea de debajo del nombre: a qué juega, o en qué punto está la solicitud. */
  status?: React.ReactNode;
  /** «Última conexión: …». Solo llega para la administración (lo marca el punto del mithril). */
  lastSeen?: string;
  /** La portada de fondo, ya resuelta con la política de carátulas del hub. */
  coverUrl?: string | null;
  /** Una solicitud recibida: el filete del renglón lo dice también, no solo el botón. */
  highlight?: boolean;
  /** Acción en curso sobre esta persona: se atenúa y deja de aceptar clics (`.is-busy`). */
  busy?: boolean;
  onOpen: () => void;
  openAriaLabel: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={['hub-feed-card', 'hub-user-card', 'hub-person-row', 'is-clickable', highlight ? 'is-incoming' : '', busy ? 'is-busy' : '']
        .filter(Boolean)
        .join(' ')}
      tabIndex={0}
      aria-label={openAriaLabel}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {coverUrl ? (
        <span className="hub-person-row-cover" style={{ '--person-cover': `url("${coverUrl}")` } as React.CSSProperties} aria-hidden="true" />
      ) : null}
      <HubAvatar photoURL={photoURL} />
      <div className="hub-person-row-text">
        <h3 className="hub-user-card-name" title={name}>{name}</h3>
        {status}
        {lastSeen ? <span className="hub-person-row-seen tier-mithril">{lastSeen}</span> : null}
      </div>
      {/* La acción no debe abrir el perfil: se detiene la propagación del clic y del teclado. */}
      {children ? (
        <div
          className="hub-person-row-action"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          {children}
        </div>
      ) : null}
    </article>
  );
}

/** Renglón fantasma mientras carga el directorio: misma silueta, sin contenido, para que al llegar no salte nada. */
export function HubPersonRowSkeleton() {
  return (
    <article className="hub-feed-card hub-user-card hub-person-row hub-skeleton-card">
      <span className="hub-avatar hub-skeleton" />
      <div className="hub-person-row-text">
        <span className="hub-skeleton hub-skeleton-line" style={{ width: '55%' }} />
        <span className="hub-skeleton hub-skeleton-line" style={{ width: '80%' }} />
      </div>
    </article>
  );
}
