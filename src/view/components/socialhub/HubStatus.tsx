/** Pie de estado de una pantalla social (mensaje + tono). Nulo si no hay mensaje. */
export function HubStatus({ status, statusKind }: { status: string; statusKind: string }) {
  if (!status) return null;
  return <div className={`sync-status-msg ${statusKind}`}>{status}</div>;
}
