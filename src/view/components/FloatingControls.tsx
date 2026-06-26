import { memo, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

interface FloatingControlsProps {
  syncStatus: string;
  syncLabel: string;
  showSync: boolean;
  onSyncClick: () => void;
}

const STATUS_CLASS: Record<string, string> = {
  idle: 's-idle',
  ok: 's-ok',
  syncing: 's-syncing',
  error: 's-error',
};

const SCROLL_HIDE_THRESHOLD = 24;

/** Icono de sincronización (FontAwesome "rotate", solid). Gira al sincronizar. */
function SyncIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M142.9 142.9c-17.5 17.5-30.1 38-37.8 59.8c-5.9 16.7-24.2 25.4-40.8 19.5s-25.4-24.2-19.5-40.8C55.6 150.7 73.2 122 97.6 97.6c87.2-87.2 228.3-87.5 315.8-1L455 55c6.9-6.9 17.2-8.9 26.2-5.2s14.8 12.5 14.8 22.2l0 128c0 13.3-10.7 24-24 24l-8.4 0c0 0 0 0 0 0L344 224c-9.7 0-18.5-5.8-22.2-14.8s-1.7-19.3 5.2-26.2l41.1-41.1c-62.6-61.5-163.1-61.2-225.3 1zM16 312c0-13.3 10.7-24 24-24l7.6 0 .7 0L168 288c9.7 0 18.5 5.8 22.2 14.8s1.7 19.3-5.2 26.2l-41.1 41.1c62.6 61.5 163.1 61.2 225.3-1c17.5-17.5 30.1-38 37.8-59.8c5.9-16.7 24.2-25.4 40.8-19.5s25.4 24.2 19.5 40.8c-10.8 30.6-28.4 59.3-52.9 83.8c-87.2 87.2-228.3 87.5-315.8 1L57 457c-6.9 6.9-17.2 8.9-26.2 5.2S16 449.7 16 440l0-119.6 0-.7 0-7.6z" />
    </svg>
  );
}

/**
 * Controles flotantes en la esquina superior derecha (diseño "headerless": sin barra ni título).
 * El indicador de sincronización (botón → Ajustes) solo aparece en Listados; el cambio de tema, siempre.
 * Se ocultan al hacer scroll y reaparecen al volver arriba, para no estorbar la lectura.
 */
export const FloatingControls = memo(function FloatingControls({ syncStatus, syncLabel, showSync, onSyncClick }: FloatingControlsProps) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const target = event.target;
        let top = 0;
        if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
          top = target.scrollTop;
        } else {
          top = window.scrollY || document.documentElement.scrollTop || 0;
        }
        setHidden(top > SCROLL_HIDE_THRESHOLD);
      });
    };

    // Captura para detectar también scrolls en contenedores anidados (p. ej. la tabla).
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`floating-controls ${hidden ? 'is-hidden' : ''}`.trim()}>
      {showSync ? (
        <button
          type="button"
          className={`sync-badge ${STATUS_CLASS[syncStatus] ?? 's-idle'}`}
          onClick={onSyncClick}
          aria-label={`Sincronización: ${syncLabel}. Abrir Ajustes.`}
          title={syncLabel}
        >
          <SyncIcon />
        </button>
      ) : null}
      <ThemeToggle />
    </div>
  );
});
