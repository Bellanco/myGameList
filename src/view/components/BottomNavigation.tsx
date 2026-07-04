import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { IconName } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

export type AppSection = 'lists' | 'social' | 'settings';

interface BottomNavigationProps {
  currentSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}

const NAV_ITEMS: Array<{ key: AppSection; label: string; icon: IconName }> = [
  { key: 'lists', label: UI_MESSAGES.nav.lists, icon: 'bottom-lists' },
  { key: 'social', label: UI_MESSAGES.nav.social, icon: 'bottom-hub' },
  { key: 'settings', label: UI_MESSAGES.nav.settings, icon: 'bottom-settings' },
];

/**
 * Navegacion inferior principal al estilo BottomNavigationView.
 */
export const BottomNavigation = memo(function BottomNavigation({ currentSection, onSectionChange }: BottomNavigationProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Pastilla deslizante: mide el botón de la sección activa y coloca `.bottom-nav-ind` tras él.
  useLayoutEffect(() => {
    const container = innerRef.current;
    const active = container?.querySelector<HTMLElement>('.bottom-nav-btn.active');
    if (!container || !active) return;
    const update = () => setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [currentSection]);

  return (
    <nav className="bottom-nav" aria-label={UI_MESSAGES.nav.ariaLabel}>
      <div className="bottom-nav-inner" ref={innerRef}>
        {indicator ? (
          <span
            className="bottom-nav-ind"
            aria-hidden="true"
            style={{ transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }}
          />
        ) : null}
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav-btn ${currentSection === item.key ? 'active' : ''}`.trim()}
            aria-current={currentSection === item.key ? 'page' : undefined}
            onClick={() => onSectionChange(item.key)}
          >
            <Icon name={item.icon} className="bottom-nav-icon" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
});
