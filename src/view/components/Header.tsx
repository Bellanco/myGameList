import { memo } from 'react';

interface HeaderProps {
  sectionLabel: string;
}

export const Header = memo(function Header({ sectionLabel }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="app-title">Mis Listas</div>
        <div className="header-subtitle">{sectionLabel}</div>
      </div>
    </header>
  );
});
