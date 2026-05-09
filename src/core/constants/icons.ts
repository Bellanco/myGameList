import type { TabId } from '../../model/types/game';

export type IconName =
  | 'plus'
  | 'download'
  | 'upload'
  | 'save'
  | 'gear'
  | 'edit'
  | 'trash'
  | 'close'
  | 'filter-close'
  | 'arrow-right'
  | 'cloud-sync'
  | 'refresh'
  | 'filter'
  | 'filter-active'
  | 'steamdeck'
  | 'repeat'
  | 'undo'
  | 'device'
  | 'eye'
  | 'eye-off'
  | 'star'
  | 'lock'
  | 'trophy'
  | 'play'
  | 'abandoned'
  | 'checkered-flag'
  | 'bottom-lists'
  | 'bottom-settings'
  | 'bottom-hub'
  | 'logout';

export const TAB_ICONS: Record<TabId, IconName> = {
  c: 'trophy',
  v: 'abandoned',
  e: 'play',
  p: 'checkered-flag',
};

export const COMMON_ICONS = {
  close: 'close',
  logout: 'logout',
  edit: 'edit',
  save: 'save',
  trash: 'trash',
  download: 'download',
  upload: 'upload',
  gear: 'gear',
  eye: 'eye',
  eyeOff: 'eye-off',
  steamDeck: 'steamdeck',
  filter: 'filter',
  filterActive: 'filter-active',
  refresh: 'refresh',
  star: 'star',
  lock: 'lock',
  repeat: 'repeat',
  undo: 'undo',
} as const;
