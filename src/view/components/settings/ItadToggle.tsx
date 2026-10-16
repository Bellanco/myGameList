import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { useItad } from '../../hooks/useItad';
import { useShowWishlist } from '../../hooks/useShowWishlist';

const T = SETTINGS_UI.itad;

/**
 * EL INTERRUPTOR DE ISTHEREANYDEAL (P0.1 del plan de la ficha y los precios), dentro de la tarjeta de integraciones:
 * es una integración, no una opción de diseño. Apagado por defecto; encendido, el servidor pregunta a ITAD por los
 * títulos de tu lista de deseos. Por eso lleva explicación, como las carátulas: quien lo enciende sabe qué sale.
 *
 * Solo se monta con espacio social (P0.2): quien lo pinta lo decide. Con la lista de deseos oculta no se piden
 * precios aunque esté encendido, y se dice debajo para que no parezca roto.
 */
export function ItadToggle() {
  const { itad, setItad } = useItad();
  const { showWishlist } = useShowWishlist();

  return (
    <div className="settings-itad">
      <h3>{T.title}</h3>
      <p className="settings-card-sub">{T.note}</p>
      <div className="theme-mode-row" role="group" aria-label={T.aria}>
        <button
          type="button"
          className={`btn btn-toggle${itad ? ' active' : ''}`}
          aria-pressed={itad}
          onClick={() => { if (!itad) setItad(true); }}
        >
          <span>{T.on}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!itad ? ' active' : ''}`}
          aria-pressed={!itad}
          onClick={() => { if (itad) setItad(false); }}
        >
          <span>{T.off}</span>
        </button>
      </div>
      {itad && !showWishlist ? <p className="settings-itad-hint">{T.wishlistHidden}</p> : null}
    </div>
  );
}
