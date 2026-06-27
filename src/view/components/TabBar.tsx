import { memo } from 'react';
import { TAB_ORDER, TAB_TITLES, TAB_TOOLTIPS } from '../../core/constants/labels';
import { TAB_ICONS } from '../../core/constants/icons';
import type { TabId } from '../../model/types/game';

interface TabBarProps {
  currentTab: TabId;
  tabCounts: Record<TabId, number>;
  onTabChange: (tab: TabId) => void;
}

export const TabBar = memo(function TabBar({ currentTab, tabCounts, onTabChange }: TabBarProps) {
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
          <svg className="tab-icon" aria-hidden="true">
            <use href={`#icon-${TAB_ICONS[tab]}`} />
          </svg>
          <span className="tab-text-full">{TAB_TITLES[tab]}</span>
          <span className="count-badge">{tabCounts[tab]}</span>
        </button>
      ))}
    </div>
  );
});
