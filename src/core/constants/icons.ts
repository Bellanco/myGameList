import type { TabId } from '../../model/types/game';

export type IconName =
  | 'plus'
  | 'check'
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
  | 'star-olive-branches'
  | 'lock'
  | 'trophy'
  | 'play'
  | 'abandoned'
  | 'skull'
  | 'rocket'
  | 'checkered-flag'
  | 'bottom-lists'
  | 'bottom-settings'
  | 'bottom-hub'
  | 'bottom-account'
  | 'logout'
  | 'keyboard-arrow-up'
  | 'sync-copy'
  | 'google-recover'
  | 'dice-d20'
  | 'uncharted'
  | 'chevron-down'
  | 'chevron-up'
  | 'signature'
  | 'grav'
  | 'bell';

export const TAB_ICONS: Record<TabId, IconName> = {
  c: 'trophy',
  v: 'skull',
  e: 'play',
  p: 'rocket',
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
  starOliveBranches: 'star-olive-branches',
  lock: 'lock',
  repeat: 'repeat',
  undo: 'undo',
  arrowBack: 'arrow-back',
  keyboardArrowUp: 'keyboard-arrow-up',
  syncCopy: 'sync-copy',
  googleRecover: 'google-recover',
} as const;
