// El estado que comparten las pantallas del panel: el censo y sus acciones (`useAdminViewModel`), lo que llega de
// otras fuentes (`useAdminPanelData`) y los dos canales para hablar con quien mira — el aviso con «Deshacer» y la
// confirmación de lo que destruye algo. Lo monta `AdminHub` una vez, por encima de sus sub-rutas.
import { createContext, useContext } from 'react';
import type { useAdminViewModel } from '../../../viewmodel/useAdminViewModel';
import type { AdminPanelData } from '../../../viewmodel/useAdminPanelData';
import type { AdminInsights } from '../../../viewmodel/useAdminInsights';
import type { AdminHealthState } from '../../../viewmodel/useAdminHealth';
import type { AdminLogState } from '../../../viewmodel/useAdminLog';

export interface AdminToast {
  text: string;
  kind: 'ok' | 'warn' | 'err';
  /** Si existe, el aviso lleva un botón «Deshacer» que la ejecuta. Solo para lo reversible. */
  undo?: () => void | Promise<void>;
}

export interface AdminConfirmRequest {
  title: string;
  body?: string;
  run: () => void | Promise<void>;
  /** Para lo que se borra para siempre: hay que escribir este texto (el nombre) antes de poder confirmar. */
  typeToConfirm?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
}

export interface AdminPanelContextValue {
  vm: ReturnType<typeof useAdminViewModel>;
  data: AdminPanelData;
  /** Las cifras de la comunidad, la foto diaria y los pendientes. */
  insights: AdminInsights;
  /** El consumo del día frente a los techos del plan gratuito. */
  health: AdminHealthState;
  /** El registro de acciones. */
  log: AdminLogState;
  notify: (toast: AdminToast) => void;
  confirm: (request: AdminConfirmRequest) => void;
  copyUid: (uid: string) => Promise<void>;
  /**
   * Ejecuta una acción de moderación de enlaces, avisa y recarga los enlaces. Con `target`, la apunta en el registro
   * a nombre de esa persona.
   */
  runShareAction: (action: () => Promise<string>, target?: { uid: string; name: string }) => Promise<void>;
  /** Abre el buscador del panel. */
  openSearch: () => void;
}

export const AdminPanelContext = createContext<AdminPanelContextValue | null>(null);

export function useAdminPanel(): AdminPanelContextValue {
  const value = useContext(AdminPanelContext);
  if (!value) {
    throw new Error('useAdminPanel fuera de AdminHub');
  }
  return value;
}
