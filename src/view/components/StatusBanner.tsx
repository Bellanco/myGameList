import { memo } from 'react';

interface StatusBannerProps {
  notice: { kind: 'ok' | 'warn' | 'err'; message: string } | null;
  remoteChangesApplied?: number | null;
}

export const StatusBanner = memo(function StatusBanner({ notice, remoteChangesApplied = null }: StatusBannerProps) {
  if (!notice) return null;

  return (
    <div className="status-banner">
      <div className={notice.kind === 'ok' ? 'ok' : notice.kind === 'warn' ? 'warn' : 'err'}>
        <div className="status-line">
          <strong>{notice.kind === 'ok' ? 'Correcto' : notice.kind === 'warn' ? 'Aviso' : 'Error'}</strong>
          <span className="status-copy">{notice.message}</span>
          {notice.kind === 'ok' && remoteChangesApplied !== null ? (
            <span className="status-copy">Cambios remotos aplicados: {remoteChangesApplied}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
