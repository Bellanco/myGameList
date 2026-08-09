import type { Page } from '@playwright/test';

/**
 * Siembra compartida por los recorridos end-to-end.
 *
 * Vive aparte porque la usan el smoke y la auditoría de accesibilidad, y porque la clave de almacenamiento y la
 * forma del estado son un contrato con `core/constants/storageKeys` y `model/repository/localRepository`: si
 * cambian, tiene que romperse en UN sitio y no en cada fichero de pruebas por su cuenta.
 */

export const JUEGOS = [
  { id: 1, name: 'Hollow Knight', grade: 96, score: 5 },
  { id: 2, name: 'Celeste', grade: 88, score: 4 },
  { id: 3, name: 'Hades', grade: 92, score: 5 },
];

interface SeedOptions {
  /** Tema con el que arranca la app. Lo lee el script de arranque ANTES del primer render. */
  theme?: 'dark' | 'light';
  /** Paleta de color activa (ver `core/constants/palettes`). */
  palette?: string;
}

/** Siembra la biblioteca ANTES de que cargue la app (la clave la fija `core/constants/storageKeys`). */
export async function sembrarBiblioteca(page: Page, options: SeedOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ juegos, theme, palette }) => {
      const now = Date.now();
      const c = juegos.map((j) => ({
        ...j, _ts: now, listedAt: now, genres: ['Acción'], platforms: ['PC'], steamDeck: false,
        years: [2024], strengths: ['Ritmo'], weaknesses: [], reasons: [], replayable: true, retry: false,
        hours: 20, review: 'Reseña de prueba.',
      }));
      localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
        c, v: [], e: [], p: [], deleted: [], updatedAt: now, schemaVersion: 1,
      }));
      // Decidido el consentimiento para que el banner no tape la interfaz durante el test.
      localStorage.setItem('mis-listas-analytics-consent', 'denied');
      if (theme) localStorage.setItem('mis-listas-theme', theme);
      if (palette) localStorage.setItem('mis-listas-palette', palette);
    },
    { juegos: JUEGOS, theme: options.theme, palette: options.palette },
  );
}
