import { memo } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENTS, LEGAL_ROUTES, type LegalDocId } from '../../core/constants/legal';

interface LegalScreenProps {
  docId: LegalDocId;
}

/**
 * L4 — Pantalla de los documentos legales. El texto vive en `core/constants/legal.ts`; aquí solo se pinta,
 * reutilizando las tarjetas de Ajustes para que herede tema, tipografía y responsive sin CSS nuevo.
 */
export const LegalScreen = memo(function LegalScreen({ docId }: LegalScreenProps) {
  const document = LEGAL_DOCUMENTS[docId];

  return (
    <section className="legal-hub" aria-label={document.title}>
      <div className="legal-card">
        <h2>{document.title}</h2>
        <p className="settings-card-note">Última actualización: {document.updated}</p>
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
          Contacto: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
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
