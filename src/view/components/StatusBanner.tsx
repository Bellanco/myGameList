interface StatusBannerProps {
  notice: { kind: 'ok' | 'warn' | 'err'; message: string } | null;
}

export function StatusBanner({ notice }: StatusBannerProps) {
  if (!notice) return null;

  return (
    <div className="status-banner">
      <div className={notice.kind === 'ok' ? 'ok' : notice.kind === 'warn' ? 'warn' : 'err'}>
        <div className="status-line">
          <strong>{notice.kind === 'ok' ? 'Correcto' : notice.kind === 'warn' ? 'Aviso' : 'Error'}</strong>
          <span className="status-copy">{notice.message}</span>
        </div>
      </div>
    </div>
  );
}
