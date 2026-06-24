import { useEffect, useRef } from 'react';

/**
 * A11y-1: gestiona un `<dialog>` nativo en modo MODAL (`showModal()`), que aporta gratis:
 *  - focus trap (el tabulador no escapa del diálogo),
 *  - restauración del foco al elemento que lo tenía antes de abrir (al llamar `close()`),
 *  - `::backdrop` nativo,
 *  - Esc → evento `cancel`.
 *
 * Devuelve la ref a enganchar al `<dialog>`. Llama `onClose` cuando el usuario pulsa Esc (interceptamos el
 * `cancel` para cerrar vía estado de React en vez del cierre nativo "a secas", que dejaría el estado desincronizado).
 *
 * Importante: el `<dialog>` debe permanecer MONTADO (no devolver `null` al cerrar) para que `close()` restaure el
 * foco; oculta su contenido con `{open && ...}`.
 */
export function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;

    const handleCancel = (event: Event) => {
      event.preventDefault(); // evita el cierre nativo; cerramos vía estado de React
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [open, onClose]);

  return ref;
}
