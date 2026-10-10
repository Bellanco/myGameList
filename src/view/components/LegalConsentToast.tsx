import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEGAL_NOTICE_UI } from '../../core/constants/legalNoticeLabels';
import { LaneCapsuleButton } from './LaneCapsuleButton';

/** Vida de la cápsula. En pausa mientras se lee. */
const LIFE_MS = 10000;

/**
 * EL AVISO DE CONDICIONES NUEVAS (docs/plan-feed-sin-vacio.md, Fase 6): la cápsula pulsable del carril con la firma en
 * el disco. Lleva al hub, que es donde está la pantalla de aceptación.
 */
export function LegalConsentToast({ onShown, onDone }: {
  /** Lo llama al montarse: es lo que da el aviso por dicho. */
  onShown?: () => void;
  /** Se cerró: por pulsarla o porque se agotó su vida. */
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const shownRef = useRef(onShown);
  shownRef.current = onShown;

  useEffect(() => {
    shownRef.current?.();
  }, []);

  return (
    <LaneCapsuleButton
      className="is-legal"
      icon="signature"
      kicker={LEGAL_NOTICE_UI.kicker}
      title={LEGAL_NOTICE_UI.title}
      text={LEGAL_NOTICE_UI.text}
      ariaLabel={LEGAL_NOTICE_UI.aria}
      announcement={LEGAL_NOTICE_UI.announce}
      lifeMs={LIFE_MS}
      onOpen={() => { void navigate('/social'); }}
      onDone={onDone}
    />
  );
}
