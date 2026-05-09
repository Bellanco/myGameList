import type { IconName } from '../../core/constants/icons';

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className = 'ui-icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#icon-${name}`} />
    </svg>
  );
}
