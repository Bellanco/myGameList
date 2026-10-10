import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_NOTICE_UI } from '../../core/constants/legalNoticeLabels';
import { usePageVisible } from '../hooks/usePageVisible';
import { Icon } from './Icon';
import '../../styles/legalNotice.scss';

/**
 * EL AVISO DE CONDICIONES NUEVAS · la cápsula del carril, la misma que la del logro, la del administrador y la del
 * resumen del año (ver `YearSummaryToast`): un solo lenguaje de aviso abajo a la izquierda, que cada tema ya cuadra en
 * su skin (docs/plan-feed-sin-vacio.md, Fase 6).
 *
 * Lo propio: el disco lleva la firma, y el cuerpo es un botón que abre el hub, que es donde está la pantalla de
 * aceptación. Vive diez segundos, en pausa mientras se lee (ratón, foco o pestaña de fondo), y se anuncia solo en su
 * región viva, que nace vacía y recibe el texto un instante después (ver la nota de `AnnouncementToast`).
 */
const LIFE_MS = 10000;
const ANNOUNCE_DELAY_MS = 120;

interface LegalConsentToastProps {
  /** Lo llama al montarse: es lo que da el aviso por dicho. */
  onShown?: () => void;
  /** Se cerró: por pulsarlo o porque se agotó su vida. */
  onDone?: () => void;
}

export function LegalConsentToast({ onShown, onDone }: LegalConsentToastProps) {
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
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const reloj = window.setTimeout(() => doneRef.current?.(), LIFE_MS);
    return () => window.clearTimeout(reloj);
  }, [paused, visible]);

  useEffect(() => {
    const reloj = window.setTimeout(() => setAnnounced(LEGAL_NOTICE_UI.announce), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(reloj);
  }, []);

  const open = () => {
    doneRef.current?.();
    void navigate('/social');
  };

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{announced}</div>
      <div className="ach-toast is-legal">
        <span className="ach-toast-sheen" aria-hidden="true" />
        <button
          type="button"
          className="ach-toast-body"
          aria-label={LEGAL_NOTICE_UI.aria}
          onClick={open}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <span className="ach-toast-disc" aria-hidden="true">
            <Icon name="signature" />
          </span>
          <span className="ach-toast-text">
            <span className="ach-toast-kicker">{LEGAL_NOTICE_UI.kicker}</span>
            <span className="ach-toast-name">{LEGAL_NOTICE_UI.title}</span>
            <span className="ach-toast-desc">{LEGAL_NOTICE_UI.text}</span>
          </span>
        </button>
      </div>
    </>
  );
}
