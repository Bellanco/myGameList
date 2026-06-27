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
  | 'arrow-back'
  | 'angle-right'
  | 'cloud-sync'
  | 'refresh'
  | 'filter'
  | 'filter-active'
  | 'steamdeck'
  | 'repeat'
  | 'undo'
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
  | 'logout'
  | 'keyboard-arrow-up'
  | 'sync-copy'
  | 'google-recover'
  | 'dice-d20'
  | 'uncharted'
  | 'chevron-down'
  | 'chevron-up';

export const TAB_ICONS: Record<TabId, IconName> = {
  c: 'trophy',
  v: 'abandoned',
  e: 'play',
  p: 'checkered-flag',
};

export const COMMON_ICONS = {
  plus: 'plus',
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
  arrowBack: 'arrow-back',
  keyboardArrowUp: 'keyboard-arrow-up',
  syncCopy: 'sync-copy',
  googleRecover: 'google-recover',
} as const;
