import { useEffect, useState } from 'react';
import { ENABLE_ACHIEVEMENTS } from '../../core/achievements/flags';
import { NO_ACHIEVEMENTS_CONFIG, type AchievementsConfig } from '../../core/achievements/visibility';

/**
 * LO QUE EL PANEL DE ADMINISTRACIÓN DECIDE PARA TODO EL MUNDO: qué escaleras están ocultas y hasta qué escalón
 * ha abierto cada una la comunidad.
 *
 * Empieza vacío —«lo que diga el catálogo», y cada quien abriendo con su propio progreso— y se pone al día
 * cuando llega la lectura. Ese orden importa: la
 * pantalla se pinta al instante con la ocultación del código y no espera a la red; si el documento revela algún
 * logro, aparece un momento después. Al revés (esperar para pintar) se vería un parpadeo en la pantalla de
 * logros de todo el mundo por una configuración que casi nunca cambia.
 *
 * EL REPOSITORIO ENTRA POR `import()` DINÁMICO. Lo usan el panel de estadísticas y el hub social, y arrastrar
 * Firestore a esos chunks por un mapa de booleanos sería pagar el SDK por una lectura: el módulo llega cuando
 * hace falta y el arranque no se enfrenta a él.
 *
 * No lanza nunca: sin sesión, sin red o con las reglas denegando, se queda vacío, que es el comportamiento
 * anterior a que la apertura fuera comunitaria.
 */
export function useAchievementsConfig(): AchievementsConfig {
  const [config, setConfig] = useState<AchievementsConfig>(NO_ACHIEVEMENTS_CONFIG);

  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS) return;
    let cancelled = false;
    void import('../../model/repository/achievementsConfigRepository')
      .then((module) => module.loadAchievementsConfig())
      .then((value) => {
        if (!cancelled) setConfig(value);
      })
      .catch(() => {
        // El catálogo manda.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
