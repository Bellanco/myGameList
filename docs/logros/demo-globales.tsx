// Entrada de la maqueta: los estilos de la app y los componentes reales, con el MISMO marco que les pone el hub
// (`.main.main-social`, que es quien fija el margen lateral fluido). Ver `demo-globales.html`.
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.scss';
import '../../src/styles/social.scss';
import { ProfileAchievementsScreen, ProfileGlobalAchievements } from '../../src/view/components/socialhub/ProfileAchievements';
import { IconSprite } from '../../src/view/components/IconSprite';
import { packAchievements } from '../../src/core/achievements/pack';
import { LADDERS } from '../../src/core/achievements/catalog';

// `?lista` enseña el listado de una amistad (solo lo conseguido) en vez del catálogo global.
const global = !new URLSearchParams(window.location.search).has('lista');

/** Los escalones bajos de cada escalera: una vitrina verosímil, ni vacía ni completa. */
function espejoDe(parte: number): string {
  return packAchievements(LADDERS.flatMap((ladder) => ladder.steps
    .filter((_step, index) => index < Math.round(ladder.steps.length * parte))
    .map((step) => ({
      id: `${ladder.key}-${step}`,
      level: 1,
      value: 0,
      next: null,
      unlockedAt: Date.parse('2026-04-30T12:00:00.000Z'),
    }))));
}

/** Veinticinco espejos con recorridos distintos: es lo que da una curva de rareza en vez de un porcentaje plano. */
const muestra = Array.from({ length: 25 }, (_unused, persona) => espejoDe(0.6 - persona * 0.02));

createRoot(document.body).render(
  <>
    <IconSprite />
    <main className="main main-social">
      {global ? (
        <ProfileGlobalAchievements
          mirror={espejoDe(0.45)}
          directoryMirrors={muestra}
          owner="Fulano"
          self={false}
          onBack={() => window.alert('Volvería a la ficha.')}
          onToggleGlobals={() => window.alert('Volvería a sus logros.')}
          globalsBackLabel="Sus logros"
        />
      ) : (
        <ProfileAchievementsScreen
          mirror={espejoDe(0.45)}
          directoryMirrors={muestra}
          owner="Fulano"
          onBack={() => window.alert('Volvería a la ficha.')}
          onToggleGlobals={() => window.alert('Abriría los globales.')}
        />
      )}
    </main>
  </>,
);
