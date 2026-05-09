import { memo } from 'react';
import { Icon } from './Icon';

/**
 * Pantalla temporal del Hub social.
 */
export const SocialHub = memo(function SocialHub() {
  return (
    <section className="social-hub" aria-label="Hub social">
      <div className="social-hub-card">
        <div className="social-hub-title-wrap">
          <Icon name="bottom-hub" className="social-hub-icon" />
          <h2>Hub social</h2>
        </div>
        <p>
          Esta seccion estara enfocada en compartir listas, comparar progreso y descubrir recomendaciones.
          Por ahora queda en modo preparacion.
        </p>
        <div className="social-hub-tags" aria-label="Caracteristicas en preparacion">
          <span className="social-chip">Perfiles</span>
          <span className="social-chip">Actividad</span>
          <span className="social-chip">Descubrimiento</span>
        </div>
      </div>
    </section>
  );
});
