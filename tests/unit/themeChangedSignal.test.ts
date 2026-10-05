// «Ajustes de vídeo» (`paso-tema`): el sello que recuerda que se estrenó un tema.
//
// Antes el logro miraba solo el tema activo en el instante de evaluar, así que quien probaba uno y volvía al de casa
// sin pasar por la pantalla de logros no lo conseguía nunca. Lo escribe quien aplica la paleta al documento.
import { beforeEach, describe, expect, it } from 'vitest';
import { markThemeChanged, themeChangedAt } from '../../src/core/achievements/deviceSignals';
import { THEME_CHANGED_KEY } from '../../src/core/constants/storageKeys';
import { palettePreference } from '../../src/view/hooks/preferences';
import { DEFAULT_PALETTE, PALETTES } from '../../src/core/constants/palettes';

describe('sello del tema estrenado', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin estrenar ninguno, no hay sello', () => {
    expect(themeChangedAt()).toBe(0);
  });

  it('se escribe una sola vez: el sello es el de la primera vez', () => {
    markThemeChanged(1000);
    markThemeChanged(2000);
    expect(themeChangedAt()).toBe(1000);
  });

  it('aplicar un tema que no es el de casa lo apunta, y volver al de casa no lo borra', () => {
    const otro = PALETTES.find((palette) => palette.id !== DEFAULT_PALETTE)!.id;
    palettePreference.set(DEFAULT_PALETTE);
    expect(localStorage.getItem(THEME_CHANGED_KEY)).toBeNull();

    palettePreference.set(otro);
    expect(themeChangedAt()).toBeGreaterThan(0);

    palettePreference.set(DEFAULT_PALETTE);
    expect(themeChangedAt()).toBeGreaterThan(0);
  });
});
