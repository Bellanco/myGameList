import { useEffect, useState } from 'react';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import type { HiddenOverrides } from '../../core/achievements/visibility';

/**
 * QUÉ ESCALERAS ESTÁN OCULTAS, según el panel de administración.
 *
 * Empieza en `{}` —«lo que diga el catálogo»— y se pone al día cuando llega la lectura. Ese orden importa: la
 * pantalla se pinta al instante con la ocultación del código y no espera a la red; si el documento revela algún
 * logro, aparece un momento después. Al revés (esperar para pintar) se vería un parpadeo en la pantalla de
 * logros de todo el mundo por una configuración que casi nunca cambia.
 *
 * EL REPOSITORIO ENTRA POR `import()` DINÁMICO. Lo usan el panel de estadísticas y el hub social, y arrastrar
 * Firestore a esos chunks por un mapa de booleanos sería pagar el SDK por una lectura: el módulo llega cuando
 * hace falta y el arranque no se enfrenta a él.
 *
 * No lanza nunca: sin sesión, sin red o con las reglas denegando, se queda en `{}`.
 */
export function useHiddenAchievements(): HiddenOverrides {
  const [overrides, setOverrides] = useState<HiddenOverrides>({});

  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS) return;
    let cancelled = false;
    void import('../../model/repository/achievementsConfigRepository')
      .then((module) => module.loadHiddenOverrides())
      .then((value) => {
        if (!cancelled) setOverrides(value);
      })
      .catch(() => {
        // El catálogo manda.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return overrides;
}
