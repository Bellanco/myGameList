import { memo } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { useAppUpdate } from '../hooks/useAppUpdate';

const U = UI_MESSAGES.update;

/**
 * Aviso de "hay una versión nueva", con su botón de recargar.
 *
 * Solo se ve en el caso en el que `useAppUpdate` NO puede recargar sola: app en primer plano, o con algo a medias.
 * Lo normal es que este componente no llegue a enseñar nada nunca.
 *
 * Va en el mismo hueco y con el mismo lenguaje visual que `StatusBanner` (misma franja bajo la cabecera, misma
 * tarjeta con borde de acento) porque es un aviso más de la app. A propósito NO es un banner flotante como el de
 * consentimiento: ese se apoya sobre la barra inferior, y dos avisos fijos ahí abajo se taparían entre sí.
 *
 * A11y: la región viva va SIEMPRE montada aunque esté vacía, por lo mismo que en `StatusBanner` — una región
 * viva solo anuncia los cambios que ocurren mientras ella existe, así que montarla junto con el mensaje llega
 * tarde y no se anuncia nada.
 */
export const UpdateNotice = memo(function UpdateNotice() {
  const { updateReady, reload } = useAppUpdate();

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">
        {updateReady ? U.announce : ''}
      </div>

      {updateReady ? (
        <div className="update-notice">
          <div className="update-notice-card">
            <div className="update-notice-text">
              <strong>{U.title}</strong>
              <span>{U.body}</span>
            </div>
            <button type="button" className="btn" onClick={reload}>
              {U.action}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
});
