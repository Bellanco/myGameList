import { memo } from 'react';
import { useNativeDialog } from './useNativeDialog';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = memo(function ConfirmModal({ open, title, onCancel, onConfirm }: ConfirmModalProps) {
  // A11y-1: `showModal()` (no el atributo `open`) → focus trap, restauración de foco, `::backdrop` y Esc → onCancel.
  const dialogRef = useNativeDialog(open, onCancel);

  return (
    <dialog ref={dialogRef} className="alert-dialog" data-type="delete" aria-label={title}>
      {open ? (
        <div className="dialog-content">
          <div className="dialog-title">{title}</div>
          <div className="dialog-actions">
            <button className="btn btn-secondary" type="button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="btn btn-danger" type="button" onClick={onConfirm}>
              Eliminar
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
});
