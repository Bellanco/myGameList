import { BACK_LABEL } from '../../../core/constants/labels';
import { Icon } from '../Icon';

export interface HubBackButtonProps {
  onBack: () => void;
  /**
   * A dónde lleva («Volver a la actividad»). No se ve: va en el nombre accesible, que tiene que empezar por lo
   * que se ve —«Volver»— (WCAG 2.5.3).
   */
  destination?: string;
}

/**
 * EL BOTÓN DE VOLVER, UNO PARA TODA LA APP. Dice «Volver» y nada más, sea cual sea el destino (decisión del
 * usuario, 13-10-2026): antes cada pantalla rotulaba el suyo y unos decían a dónde iban y otros no.
 */
export function HubBackButton({ onBack, destination }: HubBackButtonProps) {
  return (
    <button
      className="btn btn-secondary btn-back"
      type="button"
      onClick={onBack}
      aria-label={destination && destination !== BACK_LABEL ? destination : undefined}
    >
      <Icon name="arrow-back" />
      {BACK_LABEL}
    </button>
  );
}

/**
 * Y SIEMPRE EN EL MISMO SITIO: en su propia fila, ENCIMA de la tarjeta de la pantalla y alineado con su borde,
 * como ya lo llevaban Legal, la bandeja y el panel de administración. Dentro de la tarjeta, debajo del título,
 * competía con las acciones de cada pantalla y en móvil se quedaba en una flecha sola.
 */
export function HubBackRow(props: HubBackButtonProps) {
  return (
    <div className="hub-back-row">
      <HubBackButton {...props} />
    </div>
  );
}
