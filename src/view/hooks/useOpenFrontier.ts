import { useEffect } from 'react';
import { ENABLE_ACHIEVEMENTS, ENABLE_ACHIEVEMENTS_PUBLISH } from '../../core/achievements/flags';
import { frontierKey, mergeFrontiers, ownFrontier } from '../../core/achievements/frontier';
import type { OpenFrontier } from '../../core/achievements/visibility';
import type { AchievementState } from '../../core/achievements/types';

/**
 * Fronteras que este aparato ya ha intentado publicar en esta sesión. Módulo y no `ref`: la pantalla de logros se
 * monta y se desmonta cada vez que se entra, y un `ref` volvería a escribir lo mismo en cada visita.
 */
const attempted = new Set<string>();

/**
 * PUBLICA TU AVANCE DE LA FRONTERA COMUNITARIA. Ver `core/achievements/frontier.ts` para el porqué.
 *
 * SOLO SI ADELANTA ALGO: se compara la unión de lo publicado con lo tuyo contra lo publicado, y si son iguales no
 * hay escritura. Casi siempre son iguales —tu progreso ya está abierto— así que abrir la pantalla de logros no
 * cuesta una escritura por sesión.
 *
 * DETRÁS DE `ENABLE_ACHIEVEMENTS_PUBLISH`, como el espejo: es lo mismo que gobierna esa constante —algo que sale
 * del aparato y llega a otras personas— aunque aquí viaje sin identidad (un mapa `escalera → escalón`, sin quién
 * ni cuándo). Con el interruptor apagado la frontera solo la adelanta el panel de administración, y entonces el
 * denominador vuelve a depender de lo que cada cual tenga hecho.
 *
 * NO DEVUELVE NADA a propósito: la cifra de tu pantalla no espera a esta escritura porque `openThrough` ya cuenta
 * con tu propio progreso. Lo que esta escritura arregla es lo que ven LOS DEMÁS.
 */
export function useOpenFrontier(byId: ReadonlyMap<string, AchievementState>, published: OpenFrontier): void {
  useEffect(() => {
    if (!ENABLE_ACHIEVEMENTS || !ENABLE_ACHIEVEMENTS_PUBLISH) return;
    if (byId.size === 0) return;

    const next = mergeFrontiers(published, ownFrontier(byId));
    const key = frontierKey(next);
    if (key === frontierKey(published) || attempted.has(key)) return;
    attempted.add(key);

    void import('../../model/repository/achievementsConfigRepository')
      .then((module) => module.advanceOpenFrontier(next))
      .catch(() => {
        // Ni el módulo llegó: se reintenta en la próxima apertura (la marca se queda, y no importa — lo que
        // no se publicó hoy lo publicará la sesión siguiente con su propia comparación).
      });
  }, [byId, published]);
}
