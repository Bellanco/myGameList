import { Icon } from '../Icon';
import type { RelationshipState } from '../../../model/types/social';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';

/**
 * Botón de relación de amistad, reutilizado en las tarjetas del directorio y en el detalle de perfil.
 * Presentacional: recibe el estado ya calculado y callbacks ya ligados al uid del "otro".
 * - none     → "Añadir amigo"
 * - incoming → "Aceptar"
 * - outgoing → "Pendiente" (al pulsar, retira la petición enviada)
 * - friends  → chip "Amigos" (+ "Eliminar amistad" si se pasa onRemove, p. ej. en el detalle)
 *
 * El rótulo de los botones con icono va envuelto en `.btn-label` porque en la tarjeta de persona, y en pantalla
 * estrecha, se oculta y queda solo el icono (el `aria-label` sigue diciendo la acción entera). "Pendiente" no lo
 * lleva a propósito: no tiene icono que lo sustituya, y además nombra un ESTADO, que es lo que hay que poder leer.
 * Todos llevan además `title`: con el rótulo oculto, es lo que descubre la acción al pasar por encima.
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
  SOCIAL_UI: SocialUiLabels;
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
            title={F.removeAria(name)}
            onClick={onRemove}
          >
            <Icon name="close" />
            <span className="btn-label">{F.remove}</span>
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
        title={F.acceptAria(name)}
        onClick={onAddOrAccept}
      >
        <Icon name="check" />
        <span className="btn-label">{F.accept}</span>
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
      title={F.addAria(name)}
      onClick={onAddOrAccept}
    >
      <Icon name="plus" />
      <span className="btn-label">{F.add}</span>
    </button>
  );
}
