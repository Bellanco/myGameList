import { memo } from 'react';
import { Notice } from './Notice';
import { UI_MESSAGES } from '../../core/constants/labels';

interface StatusBannerProps {
  notice: { kind: 'ok' | 'warn' | 'err'; message: string } | null;
  remoteChangesApplied?: number | null;
}

const KIND_LABEL = UI_MESSAGES.statusKind;

/**
 * Avisos de la app ("Juego guardado", errores de sync…).
 *
 * A11y-4: el aviso se anuncia por una REGIÓN VIVA que está siempre en el DOM, aunque esté vacía. Ese detalle es
 * todo el arreglo: una región viva solo anuncia los cambios que ocurren MIENTRAS ella existe, así que montarla
 * junto con el mensaje (como hacía este componente, que devolvía `null` sin aviso) llega tarde y no se anuncia
 * nada. El usuario guardaba un juego, o fallaba una sincronización, y con lector de pantalla no había ni rastro.
 *
 * Se separa lo visible de lo anunciado, que es el mismo patrón que ya usan el contador de caracteres de
 * `FormModal` y el del compositor del feed: el banner visible no lleva semántica de región viva (evita anuncios
 * duplicados o a destiempo por re-render) y a su lado va un texto solo-para-lectores con `role="status"`.
 * `role="status"` (y no `alert`) porque es información de cortesía: no debe interrumpir lo que se esté leyendo.
 */
export const StatusBanner = memo(function StatusBanner({ notice, remoteChangesApplied = null }: StatusBannerProps) {
  const remoteSuffix =
    notice?.kind === 'ok' && remoteChangesApplied !== null ? ` Cambios remotos aplicados: ${remoteChangesApplied}` : '';

  return (
    <>
      {/* SIEMPRE montada: es la que anuncia. Vacía no ocupa ni se ve. */}
      <div className="sr-only" role="status" aria-live="polite">
        {notice ? `${KIND_LABEL[notice.kind]}: ${notice.message}${remoteSuffix}` : ''}
      </div>

      {/* VA AL CARRIL FLOTANTE de abajo a la izquierda, el mismo del aviso de logro y del administrador: lo monta
          `App` y aquí solo se pinta la cápsula. Antes era una franja pegajosa bajo la cabecera, que es de donde
          venía su viejo problema —con la lista desplazada nacía fuera de la pantalla— y obligaba a un `sticky`
          para taparlo. En el carril no hay nada que tapar: está siempre a la vista, encima de la barra inferior.

          El reparto de las tres filas: el rótulo dice QUÉ CLASE de aviso es, el nombre lo que ha pasado y la
          descripción el detalle que no siempre hay. */}
      {notice ? (
        <Notice tone={notice.kind} kicker={KIND_LABEL[notice.kind]} title={notice.message}>
          {notice.kind === 'ok' && remoteChangesApplied !== null
            ? `Cambios remotos aplicados: ${remoteChangesApplied}`
            : null}
        </Notice>
      ) : null}
    </>
  );
});
