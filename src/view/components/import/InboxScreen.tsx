import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { TabId } from '../../../model/types/game';
import type { ImportField, ImportFieldGroup, ImportFieldPrefs, ImportedGame } from '../../../model/types/import';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { COMMON_ICONS } from '../../../core/constants/icons';
import { normalizeName } from '../../../core/roulette/roulette';
import { copyText } from '../../../core/utils/clipboard';
import { Icon } from '../Icon';
import { ImportFieldPrefsCard } from './ImportFieldPrefsCard';
import { ImportInboxTable } from './ImportInboxTable';
import '../../../styles/import.scss';

const M = UI_MESSAGES.import.inbox;
const PAGE = 40; // scroll infinito: se renderizan de PAGE en PAGE

interface InboxScreenProps {
  imported: ImportedGame[];
  isInLists: (name: string) => boolean;
  /** ¿En qué lista está el juego? (para mostrarlo junto a la marca "Ya en tus listas"). null si no está. */
  listOf: (name: string) => TabId | null;
  onClassify: (item: ImportedGame, tab: TabId) => void;
  onEnrich: (item: ImportedGame) => void;
  onDiscard: (id: number) => void;
  onClear: () => void;
  /** Preferencia global de qué datos traer (nuevos / ya en tus listas). */
  fieldPrefs: ImportFieldPrefs;
  onFieldPrefChange: (group: ImportFieldGroup, field: ImportField, on: boolean) => void;
  /** Volver a la pantalla desde la que se abrió la bandeja (ajustes, un listado…). */
  onBack: () => void;
  /** Ir a Ajustes, que es donde se importa (la bandeja vacía no puede llenarse desde aquí). */
  onGoSettings: () => void;
}

/** Bandeja: buscador por texto + scroll infinito (render incremental). */
function InboxScreenBase({ imported, isInLists, listOf, onClassify, onEnrich, onDiscard, onClear, fieldPrefs, onFieldPrefChange, onBack, onGoSettings }: InboxScreenProps) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Toast flotante (posición fija): visible aunque la lista esté scrolleada, a diferencia del banner superior.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);
  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return q ? imported.filter((g) => normalizeName(g.name).includes(q)) : imported;
  }, [imported, query]);

  // Reinicia la ventana al buscar (y si mengua la lista).
  useEffect(() => setVisible(PAGE), [query]);

  const shown = filtered.slice(0, visible);

  // Carga más al acercarse al final (IntersectionObserver sobre un centinela).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => (v < filtered.length ? v + PAGE : v));
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const backRow = (
    <div className="import-actions">
      <button type="button" className="btn btn-secondary" onClick={onBack}>
        <Icon name={COMMON_ICONS.arrowBack} />
        <span>{UI_MESSAGES.import.back}</span>
      </button>
    </div>
  );

  if (imported.length === 0) {
    return (
      <div className="import-screen">
        {backRow}
        <div className="settings-card">
          <div className="settings-card-head">
            <h2>{M.title}</h2>
            <p className="settings-card-note">{M.empty}</p>
          </div>
          <button type="button" className="btn btn-secondary import-card-action" onClick={onGoSettings}>
            <Icon name={COMMON_ICONS.upload} />
            <span>{M.goSettings}</span>
          </button>
        </div>
      </div>
    );
  }

  const copyName = async (name: string) => {
    showToast((await copyText(name)) ? M.copyNameSuccess(name) : M.copyNameError);
  };

  return (
    <div className="import-screen">
      {backRow}
      <div className="settings-card">
        <div className="settings-card-head">
          <h2>{M.title}</h2>
          <p className="settings-card-note">{M.note}</p>
        </div>
        <div className="import-toolbar">
          <button type="button" className="btn btn-secondary" onClick={onClear}>
            <Icon name={COMMON_ICONS.trash} />
            <span>{M.clear}</span>
          </button>
        </div>
        <p className="settings-card-note">{M.showing(shown.length, filtered.length)}</p>
      </div>

      <ImportFieldPrefsCard prefs={fieldPrefs} onChange={onFieldPrefChange} />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={M.search}
        aria-label={M.search}
        className="import-search"
      />

      <ImportInboxTable
        items={shown}
        isInLists={isInLists}
        listOf={listOf}
        onClassify={onClassify}
        onEnrich={onEnrich}
        onDiscard={onDiscard}
        onCopyName={copyName}
      />
      <div ref={sentinelRef} className="import-sentinel" aria-hidden="true" />

      {toast ? (
        <div className="inbox-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Memoizada: `App` reconstruye el mapa de secciones en cada render, así que sin esto la pantalla se volvía a
 * renderizar por cualquier cambio de la aplicación. Sus manejadores son estables (`useCallback` en `App`), que
 * es lo que hace que el `memo` sirva de algo y no solo añada una comparación.
 */
export const InboxScreen = memo(InboxScreenBase);
