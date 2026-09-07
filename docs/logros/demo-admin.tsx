// Entrada de la maqueta: los estilos de la app y el componente real, sin nada alrededor. Ver `demo-admin.html`.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.scss';
import '../../src/styles/admin.scss';
import { AdminAchievements } from '../../src/view/components/AdminAchievements';
import { IconSprite } from '../../src/view/components/IconSprite';
import type { HiddenOverrides } from '../../src/core/achievements/visibility';
// Espejos de mentira, los mismos que rellenan el hub social en desarrollo: en producción esta pantalla los saca
// del censo, y mientras la publicación esté apagada llegan vacíos y la pantalla dice que no hay muestra. Con la
// siembra se puede ver la columna de «alcanzado» —y sus señales— tal como se verá cuando haya espejos de verdad.
import { seededMirrors } from '../../src/dev/achievementsSeed';

// `?sin-muestra` en la URL enseña el otro caso: la pantalla sin espejos que medir.
const conMuestra = !new URLSearchParams(window.location.search).has('sin-muestra');

/**
 * El interruptor de ocultación, EN MEMORIA: aquí no se escribe en Firestore (haría falta la sesión de
 * administrador y las reglas), así que el cambio se ve en la pantalla y se olvida al recargar. Lo que se puede
 * revisar con esto es la forma y los mensajes; que se guarde de verdad lo cubren los tests y las reglas.
 */
function Demo() {
  const [hidden, setHidden] = useState<HiddenOverrides>({});
  return (
    <AdminAchievements
      onBack={() => window.alert('Volvería al censo de usuarios.')}
      mirrors={conMuestra ? seededMirrors() : []}
      hiddenOverrides={hidden}
      onToggleHidden={async (key, value) => {
        setHidden((prev) => ({ ...prev, [key]: value }));
      }}
    />
  );
}

// El sprite GENERAL lo monta `App.tsx` en la app de verdad; aquí hay que ponerlo a mano o el botón de volver sale
// sin su flecha. El de las medallas ya lo monta la propia pantalla.
createRoot(document.body).render(
  <>
    <IconSprite />
    <Demo />
  </>,
);
