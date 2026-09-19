import { test, expect, type Page } from '@playwright/test';
import { sembrarBiblioteca, type JuegoAmplio } from '../tests/e2e/seed';

/**
 * LAS CAPTURAS QUE ENSEÑA EL DIÁLOGO DE INSTALACIÓN. Se regeneran con `npm run screenshots`.
 *
 * Chrome en Android enseña `screenshots` del manifest en su diálogo de instalación; sin ellas sale la versión
 * mínima, que es un icono y un nombre. Las medidas de aquí y las de `public/manifest.json` son un PAR: si una
 * captura cambia de tamaño y el manifest no, el navegador descarta la imagen sin decir nada.
 *
 * Se siembra una biblioteca de muestra —nunca la de nadie— porque estas imágenes son públicas: van en el
 * manifest, que sirve cualquiera que abra la app.
 */

const SALIDA = 'public/screenshots';

/**
 * LA BIBLIOTECA DEL ESCAPARATE. Tiene la forma de `JUEGOS_AMPLIOS` y el mismo volumen, pero con títulos que
 * existen: estas imágenes son lo primero que ve alguien que todavía no ha instalado nada, y treinta y seis
 * «Juego de prueba» se leen como una demo a medio hacer, no como una biblioteca.
 *
 * Las notas y los años están repartidos a mano para que las gráficas del panel tengan algo que contar (varios
 * años, varios géneros, notas por toda la escala) sin que ninguna quede plana.
 */
const ESCAPARATE: readonly JuegoAmplio[] = [
  ['Hollow Knight', 96, ['Metroidvania'], 2019],
  ['Hades', 94, ['Acción'], 2020],
  ['Celeste', 92, ['Plataformas'], 2019],
  ['Disco Elysium', 95, ['RPG'], 2020],
  ['Outer Wilds', 97, ['Aventura'], 2020],
  ['Return of the Obra Dinn', 90, ['Puzzles'], 2021],
  ['Dark Souls III', 88, ['Acción'], 2018],
  ['Slay the Spire', 86, ['Estrategia'], 2021],
  ['Into the Breach', 84, ['Estrategia'], 2021],
  ['Stardew Valley', 82, ['Aventura'], 2022],
  ['The Witcher 3', 93, ['RPG'], 2018],
  ['Elden Ring', 91, ['Acción'], 2022],
  ['Portal 2', 98, ['Puzzles'], 2017],
  ['Subnautica', 80, ['Aventura'], 2022],
  ['Dead Cells', 78, ['Metroidvania'], 2022],
  ['Ori and the Will of the Wisps', 87, ['Plataformas'], 2023],
  ['Divinity: Original Sin II', 89, ['RPG'], 2023],
  ['Inside', 85, ['Plataformas'], 2023],
  ['Baba Is You', 83, ['Puzzles'], 2023],
  ['Nier: Automata', 90, ['Acción'], 2024],
  ['Factorio', 76, ['Estrategia'], 2024],
  ['Rimworld', 74, ['Estrategia'], 2024],
  ['Blasphemous', 72, ['Metroidvania'], 2025],
  ['Pentiment', 88, ['Aventura'], 2025],
  ['Tunic', 84, ['Aventura'], 2025],
  ['Cult of the Lamb', 70, ['Acción'], 2025],
  ['Hi-Fi Rush', 86, ['Acción'], 2026],
  ['Chained Echoes', 81, ['RPG'], 2026],
].map(([name, grade, genres, anio], index) => ({
  id: 500 + index,
  name: name as string,
  grade: grade as number,
  score: Math.max(1, Math.round((grade as number) / 20)),
  genres: genres as string[],
  years: [anio as number],
  // Repartidos por semanas distintas del último año, para que la constancia tenga serie que dibujar.
  semanasAtras: index % 40,
}));

/** Todo quieto antes de disparar: sin efectos de tema, sin animación y con la tipografía ya cargada. */
async function asentar(page: Page): Promise<void> {
  // La tipografía manda en el aspecto de una app que es 100 % tipográfica, y la primera pintura cae con la
  // letra de reserva del sistema: disparar antes de que llegue la suya retrata otra app.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/**
 * Los efectos animados de los temas (barridos, parpadeo CRT, deriva de texturas) salen congelados a medio
 * fotograma en una captura: se apagan con su propia preferencia, la misma que usa quien los desactiva.
 */
async function sinEfectos(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('mis-listas-effects', 'off'));
}

test.use({ deviceScaleFactor: 1, reducedMotion: 'reduce' });

test.describe('capturas del manifest', () => {
  // EN OSCURO, que es el modo por defecto de la app y su identidad (ver DESIGN.md). Sin fijarlo, la captura
  // sale del `prefers-color-scheme` del navegador sin cabeza —claro—, que es el modo que la app trata como el
  // secundario.
  const siembra = { amplia: true, biblioteca: ESCAPARATE, theme: 'dark' } as const;

  test('móvil — listado y estadísticas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await sinEfectos(page);
    await sembrarBiblioteca(page, siembra);

    await page.goto('/completados');
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await asentar(page);
    await page.screenshot({ path: `${SALIDA}/listado-movil.png` });

    await page.goto('/stats');
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await asentar(page);
    await page.screenshot({ path: `${SALIDA}/stats-movil.png` });
  });

  test('escritorio — listado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await sinEfectos(page);
    await sembrarBiblioteca(page, siembra);

    await page.goto('/completados');
    await expect(page.locator('.bottom-nav')).toBeVisible();
    await asentar(page);
    await page.screenshot({ path: `${SALIDA}/listado-escritorio.png` });
  });
});
