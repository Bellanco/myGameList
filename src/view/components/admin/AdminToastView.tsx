import { memo, useState } from 'react';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { Icon } from '../Icon';
import type { AdminToast } from './AdminPanelContext';

/**
 * EL RESULTADO DE CADA ACCIÓN, abajo a la izquierda. Sustituye a las tres líneas de texto que el panel pintaba
 * encima del censo (error, estado y acuse), que obligaban a subir para ver si algo había salido. Lo reversible trae
 * «Deshacer»: un cambio de rango o de cuota se arregla con un clic en vez de con otro viaje a la ficha.
 */
export const AdminToastView = memo(function AdminToastView({ toast, onDismiss }: { toast: AdminToast | null; onDismiss: () => void }) {
  const [undoing, setUndoing] = useState(false);
  if (!toast) return null;
  return (
    <div className={`adm-toast is-${toast.kind}`} role={toast.kind === 'err' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      {toast.undo ? (
        <button
          type="button"
          className="btn btn-secondary adm-xs"
          disabled={undoing}
          onClick={async () => {
            // Se cierra ANTES de deshacer: lo que diga el deshacer («Deshecho…», o por qué no se puede) llega como
            // aviso nuevo, y cerrar después lo tapaba.
            const undo = toast.undo;
            setUndoing(true);
            onDismiss();
            try {
              await undo?.();
            } finally {
              setUndoing(false);
            }
          }}
        >
          <Icon name="undo" />
          <span>{ADMIN_SHELL_UI.toast.undo}</span>
        </button>
      ) : null}
      <button type="button" className="adm-toast-close" aria-label={ADMIN_SHELL_UI.toast.dismiss} onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
});
