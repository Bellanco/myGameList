// DÓNDE SE ENSEÑA EL ENLACE DE PLAYNITE.
//
// Playnite solo existe para Windows, así que la invitación a descargarla no se le ofrece a quien no puede
// instalarla. Lo que se comprueba aquí es la detección, que tiene dos caminos: el dato moderno
// (`userAgentData`) y el `userAgent` de toda la vida como respaldo.
//
// NO ES UNA PUERTA: con esto no se bloquea nada, solo se decide qué texto se pinta. Si la detección falla, lo
// peor que pasa es que alguien vea —o no vea— una frase de más.
import { afterEach, describe, expect, it } from 'vitest';
import { isWindows } from '../../src/core/utils/platform';

const original = { ua: navigator.userAgent, data: (navigator as { userAgentData?: unknown }).userAgentData };

function fingir(ua: string, data?: { platform: string }) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'userAgentData', { value: data, configurable: true });
}

afterEach(() => fingir(original.ua, original.data as { platform: string } | undefined));

describe('detección de Windows', () => {
  it('manda `userAgentData` cuando el navegador lo trae', () => {
    fingir('Mozilla/5.0 (Macintosh)', { platform: 'Windows' });
    expect(isWindows()).toBe(true);
    fingir('Mozilla/5.0 (Windows NT 10.0)', { platform: 'macOS' });
    expect(isWindows()).toBe(false);
  });

  it('sin él, se mira el `userAgent`', () => {
    fingir('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(isWindows()).toBe(true);
  });

  it('un móvil o un Mac no lo son', () => {
    fingir('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isWindows()).toBe(false);
    fingir('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    expect(isWindows()).toBe(false);
    fingir('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(isWindows()).toBe(false);
  });
});
