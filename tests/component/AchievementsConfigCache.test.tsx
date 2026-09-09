import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useAchievementsConfig } from '../../src/view/hooks/useAchievementsConfig';
import { cachedAchievementsConfig, rememberAchievementsConfig } from '../../src/core/achievements/configCache';
import { NO_ACHIEVEMENTS_CONFIG, type AchievementsConfig } from '../../src/core/achievements/visibility';

// El repositorio de verdad arrastra Firestore: aquí solo interesa de dónde sale el PRIMER valor del hook.
vi.mock('../../src/model/repository/achievementsConfigRepository', () => ({
  loadAchievementsConfig: vi.fn(async () => cachedAchievementsConfig() || NO_ACHIEVEMENTS_CONFIG),
}));

/**
 * LA CACHÉ DE LA CONFIGURACIÓN VIVE EN UN MÓDULO SIN DEPENDENCIAS, y esto es lo que se gana con ello: el hook
 * puede mirarla al arrancar sin traerse Firestore al chunk de la pantalla.
 *
 * Sin eso, cada pantalla que monta el hook pintaba un fotograma con la configuración vacía. Y vacía no es
 * inofensiva: sin apertura comunitaria, el denominador de la cabecera de logros es solo el que abre tu propio
 * progreso, así que al pasar del listado a los globales la cifra daba un salto y volvía a su sitio.
 */
describe('la configuración de logros al montar una pantalla', () => {
  const sonda = () => {
    const vistos: AchievementsConfig[] = [];
    function Sonda() {
      vistos.push(useAchievementsConfig());
      return null;
    }
    render(<Sonda />);
    return vistos;
  };

  it('el primer render ya trae lo leído en esta sesión', () => {
    rememberAchievementsConfig({ hidden: { speedrun: true }, open: { completados: 'completados-50' }, extraSteps: {} });
    const vistos = sonda();
    expect(vistos[0].open).toEqual({ completados: 'completados-50' });
    expect(vistos[0].hidden).toEqual({ speedrun: true });
  });

  it('y no repinta al llegar la lectura: es el mismo objeto', () => {
    const guardada = rememberAchievementsConfig({ hidden: {}, open: { horas: 'horas-40' }, extraSteps: {} });
    const vistos = sonda();
    // Una sola pasada por el cuerpo del componente, y con el valor bueno desde el principio.
    expect(vistos).toHaveLength(1);
    expect(vistos[0]).toBe(guardada);
  });
});
