import { memo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, LEGAL_ROUTES, type LegalDocId } from '../../core/constants/legal';
import { Icon } from './Icon';

interface LegalScreenProps {
  docId: LegalDocId;
}

const L = UI_MESSAGES.settings.legal;

/**
 * L4 — Pantalla de los documentos legales. El texto vive en `core/constants/legal.ts`; aquí solo se pinta,
 * reutilizando las tarjetas de Ajustes para que herede tema, tipografía y responsive sin CSS nuevo.
 */
export const LegalScreen = memo(function LegalScreen({ docId }: LegalScreenProps) {
  const document = LEGAL_DOCUMENTS[docId];
  const navigate = useNavigate();
  const { key } = useLocation();

  // Se llega aquí desde Cuenta, desde el aviso de cookies y desde la puerta del hub social, así que "volver" es la
  // pantalla ANTERIOR, no un destino fijo. `key === 'default'` significa que esta es la primera entrada del
  // historial (enlace directo o recarga): ahí un `-1` sacaría de la app, así que se cae a Cuenta.
  const goBack = useCallback(() => {
    if (key === 'default') {
      navigate('/cuenta');
      return;
    }
    navigate(-1);
  }, [key, navigate]);

  return (
    <section className="legal-hub" aria-label={document.title}>
      <div className="legal-actions">
        <button type="button" className="btn btn-secondary" onClick={goBack}>
          <Icon name={COMMON_ICONS.arrowBack} />
          <span>{L.back}</span>
        </button>
      </div>

      <div className="legal-card">
        <h2>{document.title}</h2>
        <p className="settings-card-note">{L.updated(document.updated)}</p>
        <p>{document.intro}</p>
      </div>

      {document.sections.map((section) => (
        <div className="legal-card" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.bullets ? (
            <ul className="legal-list">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ))}

      <div className="legal-card">
        <p className="settings-card-note">
          {L.contact}: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        </p>
        <div className="settings-legal-links">
          {(Object.keys(LEGAL_DOCUMENTS) as LegalDocId[])
            .filter((id) => id !== docId)
            .map((id) => (
              <Link key={id} to={LEGAL_ROUTES[id]}>
                {LEGAL_DOCUMENTS[id].title}
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
});
