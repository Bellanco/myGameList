import type { IconName } from './icons';
import type { TabId } from '../../model/types/game';

export const TAB_ORDER: TabId[] = ['c', 'v', 'e', 'p'];

export const TAB_TITLES: Record<TabId, string> = {
  c: 'Lista del completista',
  v: 'Lista de la vergüenza',
  e: 'En curso',
  p: 'Lista de próximos',
};

export const TAB_TOOLTIPS: Record<TabId, string> = {
  c: 'Completados',
  v: 'Abandonados',
  e: 'En curso',
  p: 'Próximos',
};

export const TAB_ROUTE: Record<TabId, string> = {
  c: '/completados',
  v: '/visitados',
  e: '/en-curso',
  p: '/proximos',
};

export const ROUTE_TAB: Record<string, TabId> = {
  '/completados': 'c',
  '/visitados': 'v',
  '/en-curso': 'e',
  '/proximos': 'p',
};

export const TAB_ACTIONS: Record<TabId, Array<{ target: TabId; label: string; btnCls: string; icon: IconName }>> = {
  c: [],
  v: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' },
  ],
  e: [
    { target: 'c', label: 'Pasar a completados', btnCls: 'btn-complete', icon: 'trophy' },
    { target: 'v', label: 'Pasar a abandonados', btnCls: 'btn-abandoned', icon: 'abandoned' },
  ],
  p: [{ target: 'e', label: 'Pasar a en curso', btnCls: 'btn-playing', icon: 'play' }],
};

export const FILTER_BOOL: Record<TabId, { field: 'replayable' | 'retry'; label: string } | null> = {
  c: { field: 'replayable', label: 'Rejugar' },
  v: { field: 'retry', label: '¿Dar otra oportunidad?' },
  e: null,
  p: null,
};

export const SYNC_BADGE_TEXT = {
  idle: 'No Sincronizado',
  ok: 'Sincronizado',
  syncing: 'Sincronizando…',
  error: 'Error Sync',
} as const;

export const DIALOG_MESSAGES = {
  deleteTagTitle: (tag: string) => `¿Eliminar etiqueta "${tag}"?`,
} as const;

export const VALIDATION_MESSAGES = {
  yearInvalid: 'El año debe tener exactamente 4 dígitos. Pulsa Guardar de nuevo para ignorarlo.',
  fieldsInvalid: 'Revisa los campos marcados antes de guardar.',
  tagExists: 'Ya existe. Pulsa Guardar otra vez para fusionar.',
  tagMerged: 'Fusionado correctamente',
  tagUpdated: 'Actualizado correctamente',
} as const;

export const UI_MESSAGES = {
  admin: {
    noTags: 'No hay etiquetas',
    editPlaceholder: 'Escribe el nuevo valor',
    editCancelBtn: 'Cancelar',
    editSaveBtn: 'Guardar',
  },
  form: {
    yearsHint: 'Pulsa Enter para añadir',
  },
} as const;
