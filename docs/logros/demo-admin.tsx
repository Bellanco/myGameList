// Entrada de la maqueta: los estilos de la app y el componente real, sin nada alrededor. Ver `demo-admin.html`.
import { createRoot } from 'react-dom/client';
import '../../src/styles/index.scss';
import '../../src/styles/admin.scss';
import { AdminAchievements } from '../../src/view/components/AdminAchievements';
import { IconSprite } from '../../src/view/components/IconSprite';

// El sprite GENERAL lo monta `App.tsx` en la app de verdad; aquí hay que ponerlo a mano o el botón de volver sale
// sin su flecha. El de las medallas ya lo monta la propia pantalla.
createRoot(document.body).render(
  <>
    <IconSprite />
    <AdminAchievements onBack={() => window.alert('Volvería al censo de usuarios.')} />
  </>,
);
