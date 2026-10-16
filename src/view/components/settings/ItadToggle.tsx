import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { useItad } from '../../hooks/useItad';

const T = SETTINGS_UI.itad;

/**
 * EL INTERRUPTOR DE ISTHEREANYDEAL (P0.1 del plan de la ficha y los precios), una caja más de Preferencias, junto a las
 * carátulas (decisión del usuario, 16-10-2026: estaba en Integraciones y no se encontraba). Apagado por defecto;
 * encendido, el servidor pregunta a ITAD por los títulos de tus listas de próximos y de deseos. Sin explicación debajo,
 * como las carátulas (decisión del usuario, 16-10-2026): qué se envía lo dicen la privacidad y las cookies. Preferencias
 * solo se abre con espacio social (P0.2), y ese es el único requisito: ningún rango lo esconde.
 */
export function ItadToggle() {
  const { itad, setItad } = useItad();

  return (
    <div className="appearance-field">
      <p className="settings-card-sub">{T.title}</p>
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
    </div>
  );
}
