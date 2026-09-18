import { memo } from 'react';

/**
 * Pie de estado de una pantalla social (mensaje + tono). Nulo si no hay mensaje.
 *
 * `memo` porque lo pintan las cinco pantallas del hub y sus dos props son cadenas: mientras el mensaje no cambie
 * —que es lo normal, no cambia al escribir ni al desplazarse— no hay nada que volver a pintar.
 */
export const HubStatus = memo(function HubStatus({ status, statusKind }: { status: string; statusKind: string }) {
  if (!status) return null;
  return <div className={`sync-status-msg ${statusKind}`}>{status}</div>;
});
