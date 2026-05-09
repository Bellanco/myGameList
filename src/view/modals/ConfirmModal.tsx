interface ConfirmModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ open, title, onCancel, onConfirm }: ConfirmModalProps) {
  if (!open) return null;

  return (
    <dialog open className="alert-dialog" data-type="delete">
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
    </dialog>
  );
}
