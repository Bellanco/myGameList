import { memo } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';

/**
 * Pie de estado de una pantalla social (mensaje + tono).
 *
 * `memo` porque lo pintan las cinco pantallas del hub y sus dos props son cadenas: mientras el mensaje no cambie
 * —que es lo normal, no cambia al escribir ni al desplazarse— no hay nada que volver a pintar.
 *
 * SE ANUNCIA. «Solicitud enviada», «Petición cancelada» o un error solo se veían: no había región viva, y quien usa
 * lector de pantalla no se enteraba de que su gesto había funcionado (09-10-2026). La región va SIEMPRE montada,
 * aunque esté vacía, como la del `StatusBanner`: una que nace ya con el texto dentro no se anuncia.
 */
export const HubStatus = memo(function HubStatus({ status, statusKind }: { status: string; statusKind: string }) {
  const kindLabel = UI_MESSAGES.statusKind[statusKind as keyof typeof UI_MESSAGES.statusKind];
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {status ? (kindLabel ? `${kindLabel}: ${status}` : status) : ''}
      </div>
      {status ? <div className={`sync-status-msg ${statusKind}`}>{status}</div> : null}
    </>
  );
});
