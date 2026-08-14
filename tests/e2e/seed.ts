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

/**
 * Biblioteca AMPLIA para las pantallas que necesitan volumen: el panel de estadísticas no dibuja casi nada con
 * tres juegos —la evolución del gusto pide una ventana de varios años, la constancia varias semanas— y auditar
 * una pantalla vacía no audita nada.
 *
 * Se genera con una cuenta fija (sin azar) para que el recorrido sea reproducible.
 */
export interface JuegoAmplio {
  id: number;
  name: string;
  grade: number;
  score: number;
  genres: string[];
  years: number[];
  semanasAtras: number;
}

const GENEROS = ['Acción', 'RPG', 'Plataformas', 'Aventura', 'Estrategia en tiempo real', 'Metroidvania', 'Puzzles'];

export const JUEGOS_AMPLIOS: JuegoAmplio[] = Array.from({ length: 36 }, (_unused, index) => {
  const anio = 2019 + (index % 8);
  return {
    id: 100 + index,
    name: `Juego de prueba ${index + 1}`,
    grade: 40 + ((index * 7) % 60),
    score: 1 + (index % 5),
    genres: [GENEROS[index % GENEROS.length]],
    // Dos años en uno de cada seis: hace falta para que la rejugabilidad tenga algo que contar.
    years: index % 6 === 0 ? [anio, anio + 1] : [anio],
    // Repartidos por semanas distintas del último año, para que la constancia tenga serie que dibujar.
    semanasAtras: index % 40,
  };
});

interface SeedOptions {
  /** Tema con el que arranca la app. Lo lee el script de arranque ANTES del primer render. */
  theme?: 'dark' | 'light';
  /** Paleta de color activa (ver `core/constants/palettes`). */
  palette?: string;
  /**
   * Siembra la biblioteca amplia en vez de las tres fichas. Para el panel de estadísticas, que con tres juegos
   * enseña estados vacíos en casi todos sus bloques.
   */
  amplia?: boolean;
}

/** Siembra la biblioteca ANTES de que cargue la app (la clave la fija `core/constants/storageKeys`). */
export async function sembrarBiblioteca(page: Page, options: SeedOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ juegos, amplios, amplia, theme, palette }) => {
      const now = Date.now();
      const SEMANA = 7 * 24 * 60 * 60 * 1000;
      const c = amplia
        ? amplios.map((j, index) => {
            const entrada = now - j.semanasAtras * SEMANA;
            return {
              id: j.id, name: j.name, grade: j.grade, score: j.score, _ts: entrada,
              listedAt: entrada, genres: j.genres, platforms: ['PC'], steamDeck: false,
              years: j.years, strengths: ['Ritmo'], weaknesses: [], reasons: [],
              replayable: index % 3 === 0, retry: false, hours: 10 + index,
              review: 'Reseña de prueba.', reviewedAt: entrada,
              // Sellos de las tres listas: es lo que hace que la constancia y el reparto tengan serie.
              enteredAt: { p: entrada - 20 * SEMANA, e: entrada - 4 * SEMANA, c: entrada },
              gradedAt: entrada,
            };
          })
        : juegos.map((j) => ({
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
    { juegos: JUEGOS, amplios: JUEGOS_AMPLIOS, amplia: Boolean(options.amplia), theme: options.theme, palette: options.palette },
  );
}
