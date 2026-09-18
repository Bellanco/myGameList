import type { TabId } from '../../model/types/game';

export type IconName =
  | 'plus'
  | 'arrows-to-eye'
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
  | 'chess-knight'
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
  | 'bottom-stats'
  | 'logout'
  | 'sync-copy'
  | 'google-recover'
  | 'dice-d20'
  | 'chevron-down'
  | 'chevron-up'
  | 'signature'
  | 'grav'
  | 'bell'
  /** Silueta de persona a TRAZO: el avatar de quien no muestra foto. Ver `HubAvatar`. */
  | 'person'
  /** Nodos conectados: compartir una reseña con enlace público. */
  | 'share-nodes'
  /** Dos hojas superpuestas: copiar al portapapeles. */
  | 'content-copy'
  | 'view-list'
  | 'view-grid';

export const TAB_ICONS: Record<TabId, IconName> = {
  c: 'trophy',
  v: 'skull',
  e: 'play',
  p: 'rocket',
};

export const COMMON_ICONS = {
  plus: 'plus',
  arrowsToEye: 'arrows-to-eye',
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
  syncCopy: 'sync-copy',
  googleRecover: 'google-recover',
  share: 'share-nodes',
  copy: 'content-copy',
  viewList: 'view-list',
  viewGrid: 'view-grid',
} as const;
