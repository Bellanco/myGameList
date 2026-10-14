import { memo, useEffect, useState } from 'react';
import { ADMIN_PANEL_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { DIALOG_MESSAGES } from '../../../core/constants/labels';
import { useNativeDialog } from '../../modals/useNativeDialog';
import type { AdminConfirmRequest } from './AdminPanelContext';

/**
 * LA CONFIRMACIÓN DEL PANEL. Es el diálogo de siempre (`alert-dialog`, el mismo marco que `ConfirmModal`), con una
 * cosa más para lo que no tiene vuelta atrás: `typeToConfirm` obliga a escribir el nombre antes de que el botón se
 * encienda. Borrar un perfil con sus amistades es la única acción del panel que no se puede deshacer, y un clic de
 * más sobre la fila equivocada no puede bastar para hacerlo.
 */
export const AdminConfirmDialog = memo(function AdminConfirmDialog({
  request,
  onClose,
}: {
  request: AdminConfirmRequest | null;
  onClose: () => void;
}) {
  const open = request !== null;
  const dialogRef = useNativeDialog(open, onClose);
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [request]);

  const needsTyping = Boolean(request?.typeToConfirm);
  const typedOk = !needsTyping || typed.trim() === request?.typeToConfirm?.trim();
  const tone = request?.tone || 'danger';

  return (
    <dialog ref={dialogRef} className="alert-dialog" data-type={tone === 'danger' ? 'delete' : 'confirm'} aria-label={request?.title || ''}>
      {request ? (
        <form
          className="dialog-content"
          onSubmit={(event) => {
            event.preventDefault();
            if (!typedOk) return;
            const run = request.run;
            onClose();
            void run();
          }}
        >
          <div className="dialog-title">{request.title}</div>
          {request.body ? <p className="dialog-body">{request.body}</p> : null}
          {needsTyping ? (
            <label className="adm-type-confirm">
              <span>{ADMIN_SHELL_UI.confirm.typeName(request.typeToConfirm || '')}</span>
              <input className="finput" value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
            </label>
          ) : null}
          <div className="dialog-actions">
            <button className="btn btn-quiet" type="button" onClick={onClose}>
              {DIALOG_MESSAGES.cancel}
            </button>
            <button className={`btn btn-${tone}`} type="submit" disabled={!typedOk}>
              {request.confirmLabel || ADMIN_PANEL_UI.confirmAccept}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
});
