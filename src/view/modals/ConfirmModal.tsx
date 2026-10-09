import { memo } from 'react';
import { useNativeDialog } from './useNativeDialog';
import { DIALOG_MESSAGES } from '../../core/constants/labels';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Texto del botón de confirmación. Por defecto "Eliminar" (borrado de juego). */
  confirmLabel?: string;
  /**
   * Lo que hay que leer antes de decidir, debajo de la pregunta. El título va en cuerpo grande y en negrita:
   * una explicación de tres líneas ahí dentro no es una pregunta, es un muro.
   */
  body?: string;
  /**
   * El tono del botón que confirma. `danger` por defecto, que es de donde viene este diálogo (borrar un juego);
   * `primary` para lo que no destruye nada —abrir una votación, por ejemplo—, porque un botón rojo diciendo
   * «Abrir votación» avisa de un peligro que no existe.
   */
  tone?: 'danger' | 'primary';
  /**
   * Una TERCERA salida, entre cancelar y confirmar, para cuando la pregunta no es sí o no. La usa el panel de
   * premios al abrir con la sección oculta: abrir y enseñarla, abrir y dejarla oculta, o no abrir.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export const ConfirmModal = memo(function ConfirmModal({
  open,
  title,
  onCancel,
  onConfirm,
  confirmLabel = DIALOG_MESSAGES.confirmDelete,
  body,
  tone = 'danger',
  secondaryLabel,
  onSecondary,
}: ConfirmModalProps) {
  // A11y-1: `showModal()` (no el atributo `open`) → focus trap, restauración de foco, `::backdrop` y Esc → onCancel.
  const dialogRef = useNativeDialog(open, onCancel);

  return (
    <dialog
      ref={dialogRef}
      className="alert-dialog"
      data-type={tone === 'danger' ? 'delete' : 'confirm'}
      aria-label={title}
    >
      {open ? (
        <div className="dialog-content">
          <div className="dialog-title">{title}</div>
          {body ? <p className="dialog-body">{body}</p> : null}
          <div className="dialog-actions">
            <button className="btn btn-quiet" type="button" onClick={onCancel}>
              {DIALOG_MESSAGES.cancel}
            </button>
            {secondaryLabel && onSecondary ? (
              <button className="btn" type="button" onClick={onSecondary}>
                {secondaryLabel}
              </button>
            ) : null}
            <button className={`btn btn-${tone}`} type="button" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
});
