import { memo } from 'react';

interface StatusBannerProps {
  notice: { kind: 'ok' | 'warn' | 'err'; message: string } | null;
  remoteChangesApplied?: number | null;
}

const KIND_LABEL = { ok: 'Correcto', warn: 'Aviso', err: 'Error' } as const;

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

      {notice ? (
        <div className="status-banner">
          <div className={notice.kind === 'ok' ? 'ok' : notice.kind === 'warn' ? 'warn' : 'err'}>
            <div className="status-line">
              <strong>{KIND_LABEL[notice.kind]}</strong>
              <span className="status-copy">{notice.message}</span>
              {notice.kind === 'ok' && remoteChangesApplied !== null ? (
                <span className="status-copy">Cambios remotos aplicados: {remoteChangesApplied}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});
