import { useEffect, useRef, useState } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { YEAR_SUMMARY_ICONS, YEAR_SUMMARY_UI } from '../../core/constants/yearSummaryLabels';
import { OWN_PROFILE_ALIAS, SOCIAL_ROUTES, YEAR_SUMMARY_NAV_STATE } from '../../viewmodel/social/socialRoutes';
import { usePageVisible } from '../hooks/usePageVisible';
import { Icon } from './Icon';
import '../../styles/yearSummaryNotice.scss';

/**
 * EL AVISO DEL RESUMEN DEL AÑO · la cápsula del carril, la misma que la del logro y la del administrador (ver
 * `AnnouncementToast`): un solo lenguaje de aviso abajo a la izquierda, que cada tema ya cuadra en su skin.
 *
 * Lo propio: el disco lleva la estrella del resumen y el cuerpo es un botón que abre TU ficha con el resumen ya
 * desplegado. Vive diez segundos, en pausa mientras se lee (ratón, foco o pestaña de fondo), y se anuncia solo en
 * su región viva, que nace vacía y recibe el texto un instante después (ver la nota de `AnnouncementToast`).
 */
const LIFE_MS = 10000;
const ANNOUNCE_DELAY_MS = 120;

interface YearSummaryToastProps {
  year: number;
  /** Lo llama al montarse: es lo que da el aviso por dicho. */
  onShown?: () => void;
  /** Se cerró: por pulsarlo o porque se agotó su vida. */
  onDone?: () => void;
}

export function YearSummaryToast({ year, onShown, onDone }: YearSummaryToastProps) {
  const navigate = useNavigate();
  const [paused, setPaused] = useState(false);
  const [announced, setAnnounced] = useState('');
  const visible = usePageVisible();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => {
    shownRef.current?.();
  }, [year]);

  useEffect(() => {
    if (paused || !visible) return;
    const reloj = window.setTimeout(() => doneRef.current?.(), LIFE_MS);
    return () => window.clearTimeout(reloj);
  }, [paused, visible, year]);

  const title = YEAR_SUMMARY_UI.notice.title(year);
  useEffect(() => {
    const reloj = window.setTimeout(() => setAnnounced(YEAR_SUMMARY_UI.notice.announce(year)), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(reloj);
  }, [year]);

  const open = () => {
    doneRef.current?.();
    void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId: OWN_PROFILE_ALIAS }), { state: YEAR_SUMMARY_NAV_STATE });
  };

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{announced}</div>
      <div className="ach-toast is-year-summary">
        <span className="ach-toast-sheen" aria-hidden="true" />
        <button
          type="button"
          className="ach-toast-body"
          aria-label={YEAR_SUMMARY_UI.notice.aria(year)}
          onClick={open}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="ach-toast-disc" aria-hidden="true">
            <Icon name={YEAR_SUMMARY_ICONS.cover} />
          </span>
          <span className="ach-toast-text">
            <span className="ach-toast-kicker">{YEAR_SUMMARY_UI.notice.kicker}</span>
            <span className="ach-toast-name">{title}</span>
            <span className="ach-toast-desc">{YEAR_SUMMARY_UI.notice.text}</span>
          </span>
        </button>
      </div>
    </>
  );
}
