// Entrada de la maqueta: los estilos de la app y el componente real, sin nada alrededor. Ver `demo-admin.html`.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.scss';
import '../../src/styles/admin.scss';
import { AdminAchievements } from '../../src/view/components/AdminAchievements';
import { IconSprite } from '../../src/view/components/IconSprite';
import type { HiddenOverrides } from '../../src/core/achievements/visibility';
import type { ExtraSteps } from '../../src/core/achievements/types';
// Espejos de mentira: en producción esta pantalla los saca del censo, y sin ellos dice que no hay muestra. Con
// unos cuantos se puede ver la columna de «alcanzado» —y sus señales— tal como se verá cuando haya espejos de
// verdad. Se fabrican aquí y no en `src/`: es una maqueta, y la app no debe llevar generadores de mentiras.
import { packAchievements } from '../../src/core/achievements/pack';
import { LADDERS } from '../../src/core/achievements/catalog';

// `?sin-muestra` en la URL enseña el otro caso: la pantalla sin espejos que medir.
const conMuestra = !new URLSearchParams(window.location.search).has('sin-muestra');

/**
 * VEINTICINCO ESPEJOS DE MENTIRA, cada uno con una parte de las escaleras: al primero se le conceden todos los
 * escalones bajos y al último casi ninguno, así que la columna de alcance sale con su curva —y con sus señales de
 * caída y de tramo sin nadie— en vez de con el mismo porcentaje en todas las filas.
 */
function espejosDeMuestra(): string[] {
  return Array.from({ length: 25 }, (_unused, persona) => {
    const conseguidos = LADDERS.flatMap((ladder) => ladder.steps
      // Cuanto más adelante va la persona, más escalones tiene: el primero llega al 60 % de cada escalera.
      .filter((_step, index) => index < Math.round((1 - persona / 25) * ladder.steps.length * 0.6))
      .map((step) => ({
        id: `${ladder.key}-${step}`,
        level: 1,
        value: 0,
        next: null,
        unlockedAt: Date.now() - persona * 86_400_000,
      })));
    return packAchievements(conseguidos);
  });
}

/**
 * El interruptor de ocultación, EN MEMORIA: aquí no se escribe en Firestore (haría falta la sesión de
 * administrador y las reglas), así que el cambio se ve en la pantalla y se olvida al recargar. Lo que se puede
 * revisar con esto es la forma y los mensajes; que se guarde de verdad lo cubren los tests y las reglas.
 */
function Demo() {
  const [hidden, setHidden] = useState<HiddenOverrides>({});
  // Los escalones añadidos, también EN MEMORIA: en la app esto escribe en `appConfig` y reconstruye el catálogo
  // (§6.4bis). Aquí solo sirve para ver la ficha con algo dentro y la fila puesta en su sitio.
  const [extra, setExtra] = useState<ExtraSteps>({});
  return (
    <AdminAchievements
      onBack={() => window.alert('Volvería al censo de usuarios.')}
      mirrors={conMuestra ? espejosDeMuestra() : []}
      hiddenOverrides={hidden}
      onToggleHidden={async (key, value) => {
        setHidden((prev) => ({ ...prev, [key]: value }));
      }}
      extraSteps={extra}
      onSetExtraSteps={async (key, steps) => {
        setExtra((prev) => {
          const next = { ...prev };
          if (steps.length > 0) next[key] = [...steps].sort((a, b) => a - b);
          else delete next[key];
          return next;
        });
      }}
    />
  );
}

// El sprite GENERAL lo monta `App.tsx` en la app de verdad; aquí hay que ponerlo a mano o el botón de volver sale
// sin su flecha. El de las medallas ya lo monta la propia pantalla.
// DENTRO DE `.main.main-admin`, que es donde vive en la app: esa clase es la que pone el margen lateral, así que
// sin ella la maqueta miente en móvil —la cabecera de familia y la barra tocaban el borde de la pantalla—.
createRoot(document.body).render(
  <>
    <IconSprite />
    <main className="main main-admin">
      <Demo />
    </main>
  </>,
);
