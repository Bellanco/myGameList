import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA DIRECCIÓN DE UNA RESEÑA COPIADA DE LA BARRA (12-10-2026). La forma buena de compartir es el enlace público
 * (`/r/…`); quien pega en un chat la dirección de la pantalla manda algo que en otro navegador no enseña esa reseña.
 * Abierta así, en frío, lleva a la página principal en vez de dejar al otro en sus propias reseñas, en la pasarela
 * del social o en «ya no está disponible». El dueño, en cambio, sigue viendo la suya.
 */
test.describe('dirección de una reseña copiada de la barra', () => {
  test('en otro navegador sin datos, la del panel lleva a la página principal', async ({ page }) => {
    await page.goto('/stats/resenas/7');
    await expect(page).toHaveURL(/\/completados$/);
  });

  test('con biblioteca pero sin ese juego, también', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/stats/resenas/999');
    await expect(page).toHaveURL(/\/completados$/);
  });

  test('por la dirección vieja del panel (/perfil), también', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/perfil/resenas/999');
    await expect(page).toHaveURL(/\/completados$/);
  });

  test('el dueño sigue viendo la suya al abrirla en frío', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/stats/resenas/3');
    await expect(page.locator('.hub-feed-card-detail')).toContainText('Hades');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/stats\/resenas\/3$/);
  });

  test('una del social, sin lo social, lleva a la página principal y no a la pasarela', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/social/user/abc123/game/7/review');
    await expect(page).toHaveURL(/\/completados$/);
    await page.goto('/social/profiles/pepe/game/7/review');
    await expect(page).toHaveURL(/\/completados$/);
  });

  test('quien tiene espacio social y solo perdió la sesión se queda: al volver a entrar puede verla', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.addInitScript(() => {
      localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ gistId: 'a1b2c3d4e5f6', etag: null, lastRemoteUpdatedAt: 0 }));
    });
    await page.goto('/social/profiles/pepe/game/7/review');
    await expect(page.locator('.hub-gateway-stage').first()).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/social\/profiles\/pepe\/game\/7\/review$/);
  });
});
