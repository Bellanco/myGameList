// EL BUSCADOR GENERAL, al estilo de Spotlight (docs/plan-notificaciones-y-buscador.md, B2).
//
// Se abre con ⌘K / Ctrl+K o `/` desde cualquier pantalla, y con la lupa flotante de arriba a la derecha, junto al botón
// del tema (decisión del usuario, 13-10-2026: encima del dado quedaba forzada y solo existía en los listados).
// Encuentra tus juegos (sin distinguir acentos), las reseñas del espacio social (las de tus amistades y las tuyas), tus
// amistades por nombre y las pantallas de la app. Todo es local (`viewmodel/search/searchSources`).
//
// NO VIAJA EN EL ARRANQUE: `App` lo monta por `lazy()` cuando el navegador queda ocioso, junto al resto del sprite. Al
// arranque le quedaban 0,5 kB (189,5 de 190, medido el 13-10-2026), y así el botón, los atajos, los iconos y el panel
// no le cuestan nada. La contrapartida es que el atajo no responde en el primer instante de la carga.
//
// ACCESIBILIDAD: `<dialog>` modal (foco atrapado, Esc y vuelta del foco con `useNativeDialog`) y el patrón combobox +
// listbox: el foco se queda en la caja y las flechas mueven la opción activa (`aria-activedescendant`).
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import '../../../styles/search.scss';
import { SEARCH_UI, isMacPlatform } from '../../../core/constants/searchLabels';
import { runSearch, type SearchGroupKind, type SearchSource } from '../../../core/search/globalSearch';
import type { TabData, TabId } from '../../../model/types/game';
import { ENABLE_ACHIEVEMENTS } from '../../../core/achievements/flags';
import { useNativeDialog } from '../../modals/useNativeDialog';
import {
  gameSearchSources,
  loadSocialSearchSources,
  ownReviewSearchSources,
  pageSearchSources,
} from '../../../viewmodel/search/searchSources';

/**
 * La lupa del botón flotante: «sistrix», de la colección de marcas de Font Awesome Free 7 (elección del usuario,
 * 13-10-2026; ver la nota del plan). LICENCIA: Font Awesome Free, CC BY 4.0, © Fonticons, Inc. (acreditado en los
 * créditos, `legalContent.ts`). En línea y no en el sprite: el botón llega con este módulo y así no depende de que el
 * resto del sprite haya llegado antes.
 */
function SistrixIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 448 512" aria-hidden="true" focusable="false">
      <path d="M448 449L301.2 300.2c20-27.9 31.9-62.2 31.9-99.2 0-93.1-74.7-168.9-166.5-168.9-91.9-.1-166.6 75.7-166.6 168.8S74.7 369.8 166.5 369.8c39.8 0 76.3-14.2 105-37.9L417.5 480 448 449zM166.5 330.8c-70.6 0-128.1-58.3-128.1-129.9S95.9 71 166.5 71 294.6 129.3 294.6 200.9 237.2 330.8 166.5 330.8z" />
    </svg>
  );
}

/** La lupa GENÉRICA («magnifying-glass», Font Awesome Free 7 solid, CC BY 4.0), dentro del panel, junto a la caja. */
function MagnifyingGlassIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
    </svg>
  );
}

/** ¿Está el foco en algo donde `/` se escribe? Ahí la barra es un carácter, no el atajo. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** ¿Hay ya un diálogo modal abierto (un formulario, una confirmación)? Encima de él el atajo no abre nada. */
function otherModalOpen(): boolean {
  return Boolean(document.querySelector('dialog[open]:not(.search-dialog), [aria-modal="true"]'));
}

/** Debe coincidir con `SEARCH_LAUNCHER_SLOT_ID` de `FloatingControls` (ver la nota de `GlobalSearch`). */
export const SEARCH_LAUNCHER_SLOT_ID = 'search-launcher-slot';

export interface GlobalSearchProps {
  games: TabData;
  /** Las listas visibles: sin Deseados activada, ni sus juegos ni su pantalla. */
  visibleTabs: readonly TabId[];
}

export function GlobalSearch({ games, visibleTabs }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  /**
   * El hueco de los controles flotantes (`FloatingControls`): la lupa va ahí, junto al botón del tema. El id va ESCRITO
   * en los dos sitios y no importado de allí: importar algo de un módulo del arranque desde este trozo perezoso hacía
   * que el empaquetador los separase, y el arranque pasaba de su tope (190,8 de 190 kB, medido el 13-10-2026).
   * `GlobalSearch.test.tsx` comprueba que coinciden.
   */
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(SEARCH_LAUNCHER_SLOT_ID)), []);
  const mac = useMemo(isMacPlatform, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
        if (!open && otherModalOpen()) return;
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (!mod && event.key === '/' && !open && !isTypingTarget(event.target) && !otherModalOpen()) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {slot ? createPortal(
        // `btn-icon` y no `theme-toggle-btn`: los temas visten igual las dos (Arcade, Witcher), y la del tema la usan las
        // pruebas para encontrar SU botón.
        <button
          className="btn-icon search-launcher"
          type="button"
          aria-label={SEARCH_UI.launcher(mac)}
          title={SEARCH_UI.launcher(mac)}
          aria-keyshortcuts={mac ? 'Meta+K /' : 'Control+K /'}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <SistrixIcon />
        </button>,
        slot,
      ) : null}
      <SearchDialog open={open} onClose={close} games={games} visibleTabs={visibleTabs} />
    </>
  );
}

function SearchDialog({ open, onClose, games, visibleTabs }: {
  open: boolean;
  onClose: () => void;
  games: TabData;
  visibleTabs: readonly TabId[];
}) {
  const dialogRef = useNativeDialog(open, onClose);
  return (
    <dialog
      ref={dialogRef}
      className="alert-dialog search-dialog"
      aria-label={SEARCH_UI.dialogLabel}
      // Clic en el fondo (fuera de la caja) → cerrar; el destino es el propio `<dialog>`. Como en `FormModal`.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? <SearchPanel onClose={onClose} games={games} visibleTabs={visibleTabs} /> : null}
    </dialog>
  );
}

type Option = { id: string; path?: string; more?: SearchGroupKind };

function SearchPanel({ onClose, games, visibleTabs }: {
  onClose: () => void;
  games: TabData;
  visibleTabs: readonly TabId[];
}) {
  const navigate = useNavigate();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<SearchGroupKind>>(new Set());
  const [active, setActive] = useState(0);
  const [social, setSocial] = useState<{ reviews: SearchSource[]; friends: SearchSource[]; hasSocial: boolean }>({
    reviews: [],
    friends: [],
    hasSocial: false,
  });

  // Lo social se lee al abrir, cada vez: es la copia de IndexedDB, que el hub renueva en cada visita.
  useEffect(() => {
    let alive = true;
    void loadSocialSearchSources().then((loaded) => {
      if (alive) setSocial(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const sources = useMemo(() => ({
    games: gameSearchSources(games, visibleTabs),
    reviews: [...ownReviewSearchSources(games), ...social.reviews],
    friends: social.friends,
    pages: pageSearchSources({ visibleTabs, hasSocial: social.hasSocial, achievements: ENABLE_ACHIEVEMENTS }),
  }), [games, visibleTabs, social]);

  const groups = useMemo(() => runSearch(sources, query, expanded), [sources, query, expanded]);

  // Las opciones en el orden en que se recorren con las flechas: los resultados y, al final de cada grupo recortado,
  // su «Ver más», que también es una opción para que se pueda alcanzar sin ratón.
  const options = useMemo<Option[]>(() => groups.flatMap((group) => [
    ...group.results.map((result) => ({ id: `${baseId}-${result.id}`, path: result.path })),
    ...(group.total > group.results.length ? [{ id: `${baseId}-more-${group.kind}`, more: group.kind }] : []),
  ]), [groups, baseId]);
  const activeIndex = options.length ? Math.min(active, options.length - 1) : -1;
  const activeId = activeIndex >= 0 ? options[activeIndex].id : undefined;
  const resultCount = groups.reduce((sum, group) => sum + group.total, 0);

  useEffect(() => {
    // Que la activa se vea al bajar con las flechas. Con `?.()`: jsdom no lo tiene.
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const choose = useCallback((option: Option | undefined) => {
    if (!option) return;
    if (option.more) {
      const kind = option.more;
      setExpanded((current) => new Set([...current, kind]));
      return;
    }
    if (option.path) {
      onClose();
      void navigate(option.path);
    }
  }, [navigate, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  };

  const trimmed = query.trim();
  const S = SEARCH_UI;

  return (
    <div className="search-panel">
      <div className="search-panel-field">
        <MagnifyingGlassIcon />
        <label className="sr-only" htmlFor={`${baseId}-input`}>{S.inputLabel}</label>
        <input
          id={`${baseId}-input`}
          className="search-panel-input"
          type="search"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- es la razón de abrirlo: escribir ya.
          autoFocus
          placeholder={S.placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setExpanded(new Set());
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {/* Sin nada escrito, el panel es solo la caja: ni instrucciones ni hueco vacío (decisión del usuario). */}
      <div className="search-panel-results" hidden={!trimmed}>
        {trimmed && groups.length === 0 ? <p className="search-panel-hint">{S.empty(trimmed)}</p> : null}
        <div role="listbox" id={listId} aria-label={S.dialogLabel} className="search-panel-list">
          {groups.map((group) => {
            const headId = `${baseId}-head-${group.kind}`;
            const remaining = group.total - group.results.length;
            return (
              <div role="group" aria-labelledby={headId} key={group.kind} className="search-group">
                <div id={headId} className="search-group-title" role="presentation">{S.groups[group.kind]}</div>
                {group.results.map((result) => {
                  const optionId = `${baseId}-${result.id}`;
                  const isActive = optionId === activeId;
                  return (
                    // Botón con papel de opción (como en `TagInput`), fuera del orden del tabulador: el foco se queda en la
                    // caja y las flechas mueven la activa.
                    <button
                      type="button"
                      tabIndex={-1}
                      key={result.id}
                      id={optionId}
                      role="option"
                      aria-selected={isActive}
                      className="search-option"
                      // El foco se queda en la caja: el clic no se lo lleva.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => setActive(options.findIndex((option) => option.id === optionId))}
                      onClick={() => choose({ id: optionId, path: result.path })}
                    >
                      <span className="search-option-title">{result.title}</span>
                      <span className="search-option-detail">{result.detail}</span>
                    </button>
                  );
                })}
                {remaining > 0 ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    id={`${baseId}-more-${group.kind}`}
                    role="option"
                    aria-selected={activeId === `${baseId}-more-${group.kind}`}
                    className="search-option search-option-more"
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActive(options.findIndex((option) => option.more === group.kind))}
                    onClick={() => choose({ id: `${baseId}-more-${group.kind}`, more: group.kind })}
                  >
                    {S.showMore(remaining)}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{trimmed ? S.resultsStatus(resultCount) : ''}</p>
    </div>
  );
}
