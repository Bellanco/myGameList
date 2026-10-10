import type { IconName } from '../../core/constants/icons';
import { useToastAnnouncement, useToastLife } from '../hooks/useLaneToast';
import { Icon } from './Icon';
import '../../styles/laneCapsule.scss';

/**
 * LA CÁPSULA PULSABLE DEL CARRIL: la del logro y la del administrador (ver `AnnouncementToast`), con un botón que
 * ocupa la cápsula entera y lleva a una pantalla de la app. La comparten el aviso del resumen del año y el de
 * condiciones nuevas, que eran el mismo componente escrito dos veces con otro texto y otro destino.
 *
 * Vive `lifeMs`, en pausa mientras se lee (ratón, foco o pestaña de fondo), y se anuncia en su región viva, que nace
 * vacía y recibe el texto un instante después (ver `useToastAnnouncement`). Al pulsarla se da por cerrada y se sigue.
 */
export function LaneCapsuleButton({
  className,
  icon,
  kicker,
  title,
  text,
  ariaLabel,
  announcement,
  lifeMs,
  resetKey,
  onOpen,
  onDone,
}: {
  /** Marca de cada aviso (`is-year-summary`, `is-legal`), por si una paleta quiere distinguirlos. */
  className: string;
  icon: IconName;
  kicker: string;
  title: string;
  text: string;
  ariaLabel: string;
  /** Lo que lee el lector de pantalla al aparecer. */
  announcement: string;
  lifeMs: number;
  /** Cambiarlo reinicia la vida (otro año, otro aviso). */
  resetKey?: unknown;
  /** Lo que hace al pulsarla, además de cerrarla. */
  onOpen: () => void;
  /** Se cerró: por pulsarla o porque se agotó su vida. */
  onDone?: () => void;
}) {
  const pause = useToastLife(onDone, { lifeMs, resetKey });
  const announced = useToastAnnouncement(announcement);

  const open = () => {
    onDone?.();
    onOpen();
  };

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{announced}</div>
      <div className={`ach-toast is-lane-link ${className}`}>
        <span className="ach-toast-sheen" aria-hidden="true" />
        <button type="button" className="ach-toast-body" aria-label={ariaLabel} onClick={open} {...pause}>
          <span className="ach-toast-disc" aria-hidden="true">
            <Icon name={icon} />
          </span>
          <span className="ach-toast-text">
            <span className="ach-toast-kicker">{kicker}</span>
            <span className="ach-toast-name">{title}</span>
            <span className="ach-toast-desc">{text}</span>
          </span>
        </button>
      </div>
    </>
  );
}
