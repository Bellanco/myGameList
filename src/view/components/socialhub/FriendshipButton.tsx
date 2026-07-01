import { Icon } from '../Icon';
import type { RelationshipState } from '../../../model/types/social';

/**
 * Botón de relación de amistad, reutilizado en las tarjetas del directorio y en el detalle de perfil.
 * Presentacional: recibe el estado ya calculado y callbacks ya ligados al uid del "otro".
 * - none     → "Añadir amigo"
 * - incoming → "Aceptar"
 * - outgoing → "Pendiente" (al pulsar, cancela la petición enviada)
 * - friends  → chip "Amigos" (+ "Eliminar amistad" si se pasa onRemove, p. ej. en el detalle)
 */
export function FriendshipButton({
  SOCIAL_UI,
  state,
  name,
  busy = false,
  onAddOrAccept,
  onCancel,
  onRemove,
}: {
  SOCIAL_UI: any;
  state: RelationshipState;
  name: string;
  busy?: boolean;
  onAddOrAccept: () => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const F = SOCIAL_UI.friendship;

  if (state === 'friends') {
    return (
      <span className="hub-friend-state">
        <span className="hub-friend-chip">{F.friends}</span>
        {onRemove ? (
          <button
            className="btn btn-danger btn-sm"
            type="button"
            disabled={busy}
            aria-label={F.removeAria(name)}
            onClick={onRemove}
          >
            <Icon name="close" />
            {F.remove}
          </button>
        ) : null}
      </span>
    );
  }

  if (state === 'incoming') {
    return (
      <button
        className="btn btn-secondary btn-accent"
        type="button"
        disabled={busy}
        aria-label={F.acceptAria(name)}
        onClick={onAddOrAccept}
      >
        <Icon name="plus" />
        {F.accept}
      </button>
    );
  }

  if (state === 'outgoing') {
    return (
      <button
        className="btn btn-secondary"
        type="button"
        disabled={busy}
        aria-label={F.cancelAria(name)}
        title={F.cancelAria(name)}
        onClick={onCancel}
      >
        {F.pending}
      </button>
    );
  }

  return (
    <button
      className="btn btn-secondary btn-accent"
      type="button"
      disabled={busy}
      aria-label={F.addAria(name)}
      onClick={onAddOrAccept}
    >
      <Icon name="plus" />
      {F.add}
    </button>
  );
}
