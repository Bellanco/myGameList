import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ADMIN_MENU, ADMIN_PATHS, adminUserPath } from '../../../core/admin/adminRoutes';
import { userLabel } from '../../../core/admin/userFilters';
import { ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import { PROFILE_TIER_LABELS } from '../../../core/constants/tiers';
import { useNativeDialog } from '../../modals/useNativeDialog';
import { HubAvatar } from '../socialhub/HubAvatar';
import { useAdminPanel } from './AdminPanelContext';

const S = ADMIN_SHELL_UI.search;
const N = ADMIN_SHELL_UI.nav;
/** Personas que se enseñan sin escribir nada (las más recientes) y como máximo al buscar. */
const IDLE_PEOPLE = 3;
const MAX_PEOPLE = 8;

interface Item {
  key: string;
  group: string;
  label: ReactNode;
  extra?: string;
  run: () => void;
}

/**
 * EL BUSCADOR DEL PANEL (⌘K / Ctrl+K dentro de `/admin`): personas, pantallas y acciones en una lista. Es el atajo
 * para la pregunta más frecuente —«abre la ficha de fulano»— sin pasar por la tabla.
 *
 * Dentro del panel se queda el atajo, y no el buscador general de la app: el general busca juegos y reseñas de
 * tu biblioteca, que aquí no pintan nada (ver `AdminHub`, que lo intercepta en la fase de captura).
 */
export const AdminSearch = memo(function AdminSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vm } = useAdminPanel();
  const navigate = useNavigate();
  const dialogRef = useNativeDialog(open, onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const needle = query.trim().toLowerCase();
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const people = (vm.census?.users || [])
      .filter((user) => {
        if (!needle) return true;
        return [user.displayName, user.knownAs, ...user.friendKnownNames, user.uid, user.profileId].some((value) =>
          value.toLowerCase().includes(needle),
        );
      })
      .slice(0, needle ? MAX_PEOPLE : IDLE_PEOPLE)
      .map<Item>((user) => ({
        key: `u-${user.id}`,
        group: S.groups.people,
        label: (
          <>
            <span className={`adm-ava-ring tier-${user.tier}`}><HubAvatar photoURL={user.photoURL} /></span>
            {userLabel(user) || user.uid}
          </>
        ),
        extra: PROFILE_TIER_LABELS[user.tier],
        run: go(adminUserPath(user.id)),
      }));
    const screens = ADMIN_MENU.filter(({ screen }) => !needle || N.screens[screen].toLowerCase().includes(needle)).map<Item>(
      ({ screen }) => ({ key: `s-${screen}`, group: S.groups.screens, label: N.screens[screen], extra: ADMIN_PATHS[screen], run: go(ADMIN_PATHS[screen]) }),
    );
    const actions: Item[] = [
      { key: 'a-severe', group: S.groups.actions, label: S.actions.severe, run: go(`${ADMIN_PATHS.users}?senal=graves`) },
      { key: 'a-new', group: S.groups.actions, label: S.actions.newcomers, run: go(`${ADMIN_PATHS.users}?solo=nuevos`) },
      {
        key: 'a-refresh',
        group: S.groups.actions,
        label: S.actions.refresh,
        run: () => {
          onClose();
          void vm.refresh();
        },
      },
    ].filter((item) => !needle || String(item.label).toLowerCase().includes(needle));
    return [...people, ...screens, ...actions];
  }, [query, vm, navigate, onClose]);

  const choose = (index: number) => items[index]?.run();
  let lastGroup = '';

  return (
    <dialog ref={dialogRef} className="adm-palette" aria-label={S.aria}>
      {open ? (
        <div className="adm-palette-body">
          <input
            ref={inputRef}
            className="adm-palette-input"
            value={query}
            placeholder={S.placeholder}
            aria-label={S.aria}
            aria-controls="adm-palette-list"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(items.length - 1, index + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(active);
              }
            }}
          />
          {/* Botones de verdad, no un `listbox`: con el ratón se pulsan, con el tabulador se recorren, y con las flechas
              desde la caja se marca el que se abrirá con Intro (es lo que dice el resaltado). */}
          <ul id="adm-palette-list" className="adm-palette-list">
            {items.length === 0 ? <li className="adm-palette-group">{S.empty}</li> : null}
            {items.map((item, index) => {
              const heading = item.group !== lastGroup ? (lastGroup = item.group) : '';
              return (
                <li key={item.key}>
                  {heading ? <div className="adm-palette-group" aria-hidden="true">{heading}</div> : null}
                  <button
                    type="button"
                    className={`adm-palette-item${index === active ? ' is-active' : ''}`}
                    aria-current={index === active ? 'true' : undefined}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onClick={() => choose(index)}
                  >
                    {item.label}
                    {item.extra ? <em>{item.extra}</em> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
});
