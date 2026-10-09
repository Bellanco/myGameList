import { Icon } from '../Icon';
import type { RelationshipState } from '../../../model/types/social';
import type { SocialUiLabels } from '../../../core/constants/socialLabels';

/**
 * Botón de relación de amistad, reutilizado en las tarjetas del directorio y en el detalle de perfil.
 * Presentacional: recibe el estado ya calculado y callbacks ya ligados al uid del "otro".
 * - none     → "Añadir amigo"
 * - incoming → "Aceptar"
 * - outgoing → rótulo de estado "Pendiente" + acción callada "Retirar" (pide confirmación)
 * - friends  → chip "Amigos" en la tarjeta; con onRemove (el detalle), un botón rosa "♥ Amigos" que pide
 *               confirmación para dejar de serlo
 *
 * El rótulo de los botones con icono va envuelto en `.btn-label` porque en la tarjeta de persona, y en pantalla
 * estrecha, se oculta y queda solo el icono (el `aria-label` sigue diciendo la acción entera). "Pendiente" es un
 * rótulo y no un botón: nombra un ESTADO, que es lo que hay que poder leer siempre.
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
    if (!onRemove) return <span className="hub-friend-chip">{F.friends}</span>;
    /* EL ESTADO, NO LA RUPTURA (09-10-2026). Era «× Dejar de ser amigos» en rojo: en la fila de la ficha se pulsaba
       por error y, al pie de la cabecera, alargaba la pantalla. Ahora dice lo que hay —«Amigos»—, en el rosa de la
       amistad de cada tema (`.btn-friend`), y al pulsarlo la confirmación de siempre pregunta si se quiere dejar de
       serlo. */
    return (
      <button
        className="btn btn-friend btn-sm"
        type="button"
        disabled={busy}
        aria-label={F.removeAria(name)}
        title={F.removeAria(name)}
        onClick={onRemove}
      >
        <Icon name="heart" />
        <span className="btn-label">{F.friends}</span>
      </button>
    );
  }

  if (state === 'incoming') {
    return (
      <button
        className="btn btn-social"
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
    /* EL ESTADO Y LA ACCIÓN, POR SEPARADO. Era un solo botón que decía «Pendiente» y, al pulsarlo, retiraba la
       petición: se leía como un estado, y en varios temas era además lo más llamativo de la tarjeta (09-10-2026).
       Ahora el estado es un rótulo y retirarla, una acción callada con su nombre. */
    return (
      <>
        <span className="hub-pending-chip">{F.pending}</span>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy}
          aria-label={F.cancelAria(name)}
          title={F.cancelAria(name)}
          onClick={onCancel}
        >
          <Icon name="close" />
          <span className="btn-label">{F.withdraw}</span>
        </button>
      </>
    );
  }

  return (
    <button
      className="btn btn-social"
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
