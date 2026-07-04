import { memo, useLayoutEffect, useRef, useState } from 'react';
import { TAB_ORDER, TAB_TITLES, TAB_TOOLTIPS } from '../../core/constants/labels';
import { TAB_ICONS } from '../../core/constants/icons';
import type { TabId } from '../../model/types/game';

interface TabBarProps {
  currentTab: TabId;
  tabCounts: Record<TabId, number>;
  onTabChange: (tab: TabId) => void;
}

export const TabBar = memo(function TabBar({ currentTab, tabCounts, onTabChange }: TabBarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Subrayado deslizante: mide la pestaña activa y coloca `.tab-underline` bajo ella (se anima vía CSS).
  useLayoutEffect(() => {
    const container = tabsRef.current;
    const active = container?.querySelector<HTMLElement>('.tab-btn.active');
    if (!container || !active) return;
    const update = () => setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [currentTab, tabCounts]);

  return (
    <div className="tabs" ref={tabsRef}>
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
      {indicator ? (
        <span
          className="tab-underline"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
        />
      ) : null}
    </div>
  );
});
