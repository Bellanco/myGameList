import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * La guía de primeros pasos sobre el BUILD: que sale a quien llega sin nada, que convive con el aviso de
 * analítica, que sigue a la acción de verdad (también tras recargar, como a la vuelta de GitHub) y, sobre todo,
 * que a quien ya usaba la aplicación no le cambia nada: ni se pinta ni se descarga su chunk.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('guía de primeros pasos', () => {
  test('primera visita: bienvenida junto al aviso de analítica, y la misión se cumple haciéndola', async ({ page }) => {
    await page.goto('/completados');

    const welcome = page.getByRole('dialog', { name: '¡Pulsa Start!' });
    await expect(welcome).toBeVisible();
    // El aviso de analítica queda POR ENCIMA de la guía y se puede decidir con ella delante.
    const consent = page.locator('.consent-banner');
    await expect(consent).toBeVisible();
    const { violations: welcomeViolations } = await new AxeBuilder({ page }).include('.ob-card').withTags(WCAG).analyze();
    expect(welcomeViolations.map((violation) => violation.id)).toEqual([]);
    await page.getByRole('button', { name: 'Rechazar' }).click();
    await expect(consent).toBeHidden();

    await welcome.getByRole('button', { name: 'Empezar' }).click();
    const lists = page.getByRole('dialog', { name: 'Cuatro listas, una biblioteca' });
    await expect(lists).toBeVisible();
    await expect(page.locator('.ob-ring')).toBeVisible();
    await lists.getByRole('button', { name: 'Siguiente' }).click();

    const add = page.getByRole('dialog', { name: 'Añade tu primer juego' });
    await expect(add).toBeVisible();
    const { violations: bubbleViolations } = await new AxeBuilder({ page }).include('.ob-bubble').withTags(WCAG).analyze();
    expect(bubbleViolations.map((violation) => violation.id)).toEqual([]);

    // El velo no bloquea: el «+» se pulsa a través de él. Con el formulario abierto la guía se aparta.
    await page.locator('.fab').click();
    await expect(page.locator('dialog.modal-dialog[open]')).toBeVisible();
    await expect(add).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(add).toBeVisible();

    // El juego llega y la página se recarga (es lo que pasa a la vuelta de autorizar en GitHub): se celebra igual.
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem('mis-listas-v12-unified', JSON.stringify({
        c: [{ id: 1, name: 'Hollow Knight', grade: 96, score: 5, _ts: now, listedAt: now, steamDeck: false, replayable: false, retry: false, reasons: [], enteredAt: { c: now } }],
        v: [], p: [], e: [], deleted: [], updatedAt: now, schemaVersion: 1,
      }));
    });
    await page.reload();
    await expect(page.getByRole('dialog', { name: '¡Empieza la partida!' })).toBeVisible();
  });

  test('quien ya tenía listas no ve la guía ni descarga su chunk', async ({ page }) => {
    const pedidos: string[] = [];
    page.on('request', (request) => pedidos.push(request.url()));
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.locator('.main-row, .grid-row').first()).toBeVisible();
    // Más que el idle en el que se decide.
    await page.waitForTimeout(1500);
    await expect(page.locator('.ob-root')).toHaveCount(0);
    expect(pedidos.filter((url) => url.includes('OnboardingTour'))).toEqual([]);
  });

  test('«Ahora no» la pliega en el botón de la izquierda, que sobrevive a recargar', async ({ page }) => {
    await page.goto('/completados');
    await page.getByRole('button', { name: 'Rechazar' }).click();
    await page.getByRole('dialog', { name: '¡Pulsa Start!' }).getByRole('button', { name: 'Ahora no' }).click();

    const pill = page.locator('.ach-toast-stack .ob-pill');
    await expect(pill).toBeVisible();
    await page.reload();
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByRole('dialog', { name: 'Tus misiones' })).toBeVisible();
  });
});
