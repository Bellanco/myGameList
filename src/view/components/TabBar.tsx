import { TAB_TITLES, TAB_TOOLTIPS } from '../../core/constants/labels';
import { TAB_ICONS } from '../../core/constants/icons';
import type { TabId } from '../../model/types/game';

interface TabBarProps {
  currentTab: TabId;
  tabCounts: Record<TabId, number>;
  onTabChange: (tab: TabId) => void;
}

const TAB_ORDER: TabId[] = ['c', 'v', 'e', 'p'];

export function TabBar({ currentTab, tabCounts, onTabChange }: TabBarProps) {
  return (
    <div className="tabs">
      {TAB_ORDER.map((tab) => (
        <button
          key={tab}
          className={`tab-btn ${currentTab === tab ? 'active' : ''}`}
          type="button"
          data-tooltip={TAB_TOOLTIPS[tab]}
          onClick={() => onTabChange(tab)}
        >
          <span className="tab-text-full">{TAB_TITLES[tab]}</span>
          <svg className="tab-icon" aria-hidden="true">
            <use href={`#icon-${TAB_ICONS[tab]}`} />
          </svg>
          <span className="count-badge">{tabCounts[tab]}</span>
        </button>
      ))}
    </div>
  );
}
