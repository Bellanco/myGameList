import { expect, test } from '@playwright/test';
import { JUEGOS, sembrarAmistades, sembrarBiblioteca } from './seed';

// TUS AMISTADES EN LA FICHA DE UN JUEGO (F3 del plan de la ficha), sobre el build: salen de la copia del directorio
// social que guarda el hub, sin sesión, sin red y sin cargar Firebase. Lo que se comprueba aquí es lo que jsdom no ve:
// que el chunk del panel lleva consigo los estilos del renglón de persona, que «Lo quieren» entra si cabe y que tocar
// una amistad lleva a su perfil.

const JUEGO = JUEGOS[0].name;

test.describe('la ficha de un juego · tus amistades', () => {
  test.beforeEach(async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    await sembrarAmistades(page, JUEGO);
    await page.locator('button[aria-haspopup="dialog"]', { hasText: JUEGO }).first().click();
  });

  test('salen tus amistades, con reseña primero y en renglón; quien no es amistad, no', async ({ page }) => {
    const ficha = page.getByRole('dialog', { name: `Ficha de ${JUEGO}` });
    const filas = ficha.locator('.gs-sec-amistades article');
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toHaveAttribute('aria-label', 'Ver el perfil de Marta');
    await expect(filas.nth(0)).toContainText('«Un mapa que se descubre a mano.»');
    await expect(filas.nth(1)).toContainText('En curso');
    await expect(ficha.getByText('No es amistad')).toHaveCount(0);
    // El renglón es una fila y no la tarjeta en columna del hub: la hoja de persona ha llegado con el panel.
    await expect(filas.nth(0)).toHaveCSS('flex-direction', 'row');
    await expect(ficha.getByText('Media de tus amistades')).toBeVisible();
    await expect(ficha.getByText('Lo tienen')).toBeVisible();
  });

  test('con sitio, quien lo quiere sale aparte', async ({ page }) => {
    const ficha = page.getByRole('dialog', { name: `Ficha de ${JUEGO}` });
    await expect(ficha.getByText('Lo quieren')).toBeVisible();
    await expect(ficha.locator('.gs-wanter')).toHaveText('Sara');
  });

  test('tocar una amistad lleva a su perfil y la ficha se cierra', async ({ page }) => {
    await page.getByRole('article', { name: 'Ver el perfil de Marta' }).click();
    await expect(page).toHaveURL(/\/social\/profiles\/p-marta$/);
    await expect(page.locator('dialog.gs-dialog[open]')).toHaveCount(0);
  });
});

// EL ÍNDICE DE SUS BIBLIOTECAS (F4): llega en su propio chunk, fuera del precache, y dentro del plazo del rango no
// pregunta a GitHub. Lucía lo tiene en su biblioteca sin haberlo reseñado ni movido: solo el índice la trae.
test.describe('la ficha de un juego · el índice de las bibliotecas de tus amistades', () => {
  test('quien lo tiene sin reseñarlo ni moverlo también sale, sin una sola petición a GitHub', async ({ page }) => {
    const aGitHub: string[] = [];
    page.on('request', (peticion) => {
      if (peticion.url().includes('api.github.com')) aGitHub.push(peticion.url());
    });
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    await sembrarAmistades(page, JUEGO, { indice: true });
    await page.locator('button[aria-haspopup="dialog"]', { hasText: JUEGO }).first().click();
    const ficha = page.getByRole('dialog', { name: `Ficha de ${JUEGO}` });
    await expect(ficha.getByRole('article', { name: 'Ver el perfil de Lucía' })).toBeVisible();
    await expect(ficha.locator('.gs-sec-amistades article')).toHaveCount(3);
    expect(aGitHub).toEqual([]);
  });
});
