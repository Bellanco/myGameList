import { memo } from 'react';
import { Link } from 'react-router-dom';
import { SETTINGS_ROUTES, type SettingsGroup } from '../../../core/constants/routes';
import { SETTINGS_UI } from '../../../core/constants/settingsLabels';

const G = SETTINGS_UI.groups;

/**
 * La portada de `/ajustes`: los mismos cuatro grupos del menú, pero como pantalla.
 *
 * NO SOBRA por tener el menú. `/ajustes` es una dirección que la gente guarda, que existía antes de esto y a la
 * que se llega también sin abrir ningún desplegable —con el teclado, o desde el enlace de un aviso—. Un camino
 * declarado que no pinte nada es un rebote a los listados, y eso es lo que había que evitar.
 *
 * `personalization` aparece solo con espacio social, la misma regla que en el menú: lo que hay dentro es de
 * quien lo tiene. Enseñarlo aquí y no allí sería prometer una puerta que después se cierra.
 */
export const SettingsIndex = memo(function SettingsIndex({ hasSocialProfile }: { hasSocialProfile: boolean }) {
  const grupos: ReadonlyArray<{ key: SettingsGroup; title: string; hint: string }> = [
    ...(hasSocialProfile ? [{ key: 'personalization' as const, title: G.personalization.title, hint: G.personalization.hint }] : []),
    { key: 'integration', title: G.integration.title, hint: G.integration.hint },
    { key: 'filters', title: G.filters.title, hint: G.filters.hint },
    { key: 'legal', title: G.legal.title, hint: G.legal.hint },
  ];

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.title}>
      {grupos.map(({ key, title, hint }) => (
        <Link key={key} to={SETTINGS_ROUTES[key]} className="settings-card settings-index-card">
          <h2>{title}</h2>
          <p className="settings-card-sub">{hint}</p>
        </Link>
      ))}
    </section>
  );
});
