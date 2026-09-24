import { memo } from 'react';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';
import { SharedReviewsCard } from '../SharedReviewsCard';
import { ThemePicker } from '../appearance/ThemePicker';
import { AppearanceToggles } from '../appearance/AppearanceToggles';
import { ScoreScaleCard } from './ScoreScaleCard';
import type { TabData } from '../../../model/types/game';
// La hoja de las pantallas de Ajustes viaja en los chunks perezosos que la usan y no en el bundle base (mismo
// patrón que `stats.scss` y `social.scss`). Se importa desde CADA pantalla que la necesita: si se importara solo
// desde una, entrar por otra ruta la dejaría sin estilo.
import '../../../styles/settings.scss';

interface PersonalizationSettingsProps {
  scoreScaleUid: string | null; // uid de Google (para gatear/guardar la escala); null → candado
  /** ¿Tiene espacio social? De ahí salen el nick y el rango, así que sin él no hay enlaces que gestionar. */
  hasSocialProfile: boolean;
  /** Tus listas: de ahí sale el texto de ahora cuando se renueva un enlace. */
  games: TabData;
}

/**
 * «Personalización» — el primero de los cuatro grupos de Ajustes: cómo se ve la aplicación, cómo se puntúa y
 * qué has publicado.
 *
 * TRES BLOQUES A LO ANCHO, en el orden en que se tocan: el TEMA arriba —es lo que cambia la pantalla entera y
 * lo único que pide sitio de verdad—, debajo las preferencias sueltas (cómo se puntúa y los cinco
 * interruptores) y al final lo que has publicado. Nada de dos columnas de tarjetas: partir la pantalla dejaba
 * la apariencia en una columna estrecha —donde vuelve a apilarse— con medio escritorio vacío al lado. Lo que
 * reparte aquí es el CONTENIDO de cada bloque, que se estira a lo ancho hasta llenarlo.
 *
 * Esta pantalla ENSAMBLA y no pinta: cada pieza sabe lo suyo y trae su propio estado —el tema, los cinco
 * interruptores, la escala, los enlaces publicados—, así que aquí no hay ni un `useState`. A esta pantalla solo
 * se llega con espacio social (la puerta la ponen el menú y `App`).
 */
export const PersonalizationSettings = memo(function PersonalizationSettings({ scoreScaleUid, hasSocialProfile, games }: PersonalizationSettingsProps) {
  return (
    <section className="settings-hub settings-personalization" aria-label={SETTINGS_UI.groups.design.title}>
      <div className="settings-card settings-card-themes">
        <h2>{SETTINGS_UI.groups.themes}</h2>
        <div className="settings-appearance">
          <ThemePicker />
        </div>
      </div>

      <div className="settings-card settings-card-score">
        <h2>{SETTINGS_UI.groups.preferences}</h2>
        <ScoreScaleCard scoreScaleUid={scoreScaleUid} />
        {/* Los cinco interruptores comparten tarjeta con la escala: son la misma clase de decisión —una
            preferencia de dos respuestas— y juntos llenan a lo ancho lo que por separado eran dos tarjetas a
            medias. */}
        <div className="settings-appearance">
          <AppearanceToggles />
        </div>
      </div>

      {/* Los enlaces públicos van aquí y no en «Integración»: no son una preferencia ni un canal de datos, son
          contenido tuyo publicado en internet, y se gestionan al lado de lo que decides mostrar. */}
      <SharedReviewsCard enabled={hasSocialProfile} games={games} />
    </section>
  );
});
