import React from 'react';
import { HubAvatar } from './HubAvatar';
import { PROFILE_TIER_LABELS, normalizeTier } from '../../../core/constants/tiers';
import type { ProfileTier } from '../../../core/constants/tiers';

/**
 * Tarjeta de PERSONA del hub social: la misma pieza en el directorio (`/social/profiles`) y en la bandeja de
 * solicitudes (`/social/requests`).
 *
 * Antes cada pantalla se pintaba con lo suyo: el directorio con una tarjeta de rejilla y la bandeja reutilizando
 * `.hub-feed-activity-item`, que es la BURBUJA del feed —ancho al contenido, apilada en columna y con 1rem de aire
 * entre burbujas—. Con tres bloques (recibidas, enviadas, amigos) eso era una torre: había que bajar dos pantallas
 * para llegar a los amigos. Una sola tarjeta, compacta y en rejilla, resuelve las dos cosas a la vez: mismo
 * lenguaje visual y mucha más gente por pantalla.
 *
 * Forma vertical: avatar arriba, nombre debajo y las acciones al pie. Es la que mejor aguanta la rejilla, porque
 * todas las columnas quedan a la misma altura sin depender de lo largo que sea cada nombre.
 *
 * PRESENTACIONAL: las acciones llegan como `children` (el botón de amistad, aceptar/rechazar…), así que esta
 * tarjeta no sabe nada de relaciones ni de peticiones.
 */
export function HubUserCard({
  name,
  photoURL,
  tier,
  busy = false,
  onOpen,
  openAriaLabel,
  onKeyDown,
  children,
}: {
  name: string;
  photoURL?: string;
  /** Rango del perfil. Sin él no se pinta el punto: en la bandeja hay gente que no está en el directorio. */
  tier?: ProfileTier;
  /** Acción en curso sobre esta persona: la tarjeta se atenúa y deja de aceptar clics (ver `.is-busy`). */
  busy?: boolean;
  /** Si se pasa, la tarjeta entera abre el perfil. Sin él es una tarjeta de solo lectura. */
  onOpen?: () => void;
  openAriaLabel?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  children?: React.ReactNode;
}) {
  const clickable = Boolean(onOpen);
  const rank = tier ? normalizeTier(tier) : null;

  return (
    <article
      className={`hub-feed-card hub-user-card ${clickable ? 'is-clickable' : ''} ${busy ? 'is-busy' : ''}`.trim()}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? openAriaLabel : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {/* Muesca de rango, esquina superior derecha (ver `_tiers.scss`). El color solo no informa a quien no lo
          distingue: el nombre del rango va en `title` y, para lectores de pantalla, en un texto oculto. */}
      {rank ? (
        <span className={`hub-tier-notch tier-${rank}`} title={PROFILE_TIER_LABELS[rank]}>
          <span className="sr-only">{PROFILE_TIER_LABELS[rank]}</span>
        </span>
      ) : null}

      <HubAvatar photoURL={photoURL} sizeClass="hub-avatar-md" />
      {/* `title` con el nombre completo: en una columna estrecha el nombre se corta a dos líneas. */}
      <h3 className="hub-user-card-name" title={name}>{name}</h3>

      {/* Las acciones no deben abrir el perfil: se detiene la propagación del clic y del teclado. */}
      {children ? (
        <div
          className="hub-user-card-actions"
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

/** Tarjeta fantasma mientras cargan los datos: misma silueta, sin contenido. */
export function HubUserCardSkeleton() {
  return (
    <article className="hub-feed-card hub-user-card hub-skeleton-card">
      <span className="hub-avatar hub-avatar-md hub-skeleton" />
      <span className="hub-skeleton hub-skeleton-line" style={{ width: '70%' }} />
      <span className="hub-skeleton hub-skeleton-line" style={{ width: '90%', height: '1.6rem' }} />
    </article>
  );
}
