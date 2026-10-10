import { useEffect, useRef } from 'react';
import { generatePath, useNavigate } from 'react-router-dom';
import { YEAR_SUMMARY_ICONS, YEAR_SUMMARY_UI } from '../../core/constants/yearSummaryLabels';
import { OWN_PROFILE_ALIAS, SOCIAL_ROUTES, YEAR_SUMMARY_NAV_STATE } from '../../viewmodel/social/socialRoutes';
import { LaneCapsuleButton } from './LaneCapsuleButton';

/** Vida de la cápsula. En pausa mientras se lee. */
const LIFE_MS = 10000;

/**
 * EL AVISO DEL RESUMEN DEL AÑO · la cápsula pulsable del carril (`LaneCapsuleButton`), la misma familia que la del
 * logro y la del administrador: un solo lenguaje de aviso abajo a la izquierda, que cada tema ya cuadra en su skin.
 *
 * Lo propio: el disco lleva la estrella del resumen y el botón abre TU ficha con el resumen ya desplegado.
 */
export function YearSummaryToast({ year, onShown, onDone }: {
  year: number;
  /** Lo llama al montarse: es lo que da el aviso por dicho. */
  onShown?: () => void;
  /** Se cerró: por pulsarlo o porque se agotó su vida. */
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => {
    shownRef.current?.();
  }, [year]);

  return (
    <LaneCapsuleButton
      className="is-year-summary"
      icon={YEAR_SUMMARY_ICONS.cover}
      kicker={YEAR_SUMMARY_UI.notice.kicker}
      title={YEAR_SUMMARY_UI.notice.title(year)}
      text={YEAR_SUMMARY_UI.notice.text}
      ariaLabel={YEAR_SUMMARY_UI.notice.aria(year)}
      announcement={YEAR_SUMMARY_UI.notice.announce(year)}
      lifeMs={LIFE_MS}
      resetKey={year}
      onOpen={() => {
        void navigate(generatePath(SOCIAL_ROUTES.profileDetail, { profileId: OWN_PROFILE_ALIAS }), { state: YEAR_SUMMARY_NAV_STATE });
      }}
      onDone={onDone}
    />
  );
}
