import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';
import { edicionPublicada, sirveFirestore } from './premiosFirestore';
import { TOUR_UI } from '../../src/core/constants/onboardingLabels';

/**
 * LA INVITACIÓN AL RESTO DE LA APLICACIÓN, EN EL HISTÓRICO, sobre el build.
 *
 * Los unitarios cubren cuándo toca y los de componente cómo se pinta; lo que solo se ve aquí es el CABLEADO: los
 * premios deciden, `App` recoge la invitación y la guía —otro chunk perezoso— la pinta encima de los resultados.
 * Si se rompe cualquiera de los tres eslabones, la burbuja simplemente no sale y nada falla.
 *
 * Sin sesión no hay social, así que quien entra aquí es justo el público de la invitación. Lo de terminar de votar
 * no se puede recorrer sin sesión de Google; comparte con esto todo menos la pantalla.
 */
const P = TOUR_UI.premios;

async function abrirHistorico(page: Page): Promise<void> {
  await sirveFirestore(page, edicionPublicada());
  // Por `/premios`, que sin edición en marcha manda al histórico (como en el a11y).
  await page.goto('/premios');
  await expect(page.locator('.premios-results__podium')).toBeVisible();
}

test.describe('premios · la invitación en el histórico', () => {
  test('sin juegos, invita a empezar la lista y «Enséñame» arranca la guía allí', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mis-listas-analytics-consent', 'denied'));
    await abrirHistorico(page);

    const burbuja = page.getByRole('dialog', { name: P.list.title });
    await expect(burbuja).toBeVisible();
    await expect(burbuja).toContainText(P.kicker);
    await burbuja.getByRole('button', { name: P.yes }).click();

    await expect(page).toHaveURL(/\/completados$/);
    await expect(page.getByRole('dialog', { name: P.list.title })).toHaveCount(0);
    const guia = await page.evaluate(() => JSON.parse(localStorage.getItem('mis-listas-onboarding') || 'null'));
    expect(guia).toMatchObject({ status: 'active', mission: 'first-game' });
  });

  test('con la lista hecha invita a lo social, y «Ahora no» vale para toda la edición', async ({ page }) => {
    await sembrarBiblioteca(page);
    await abrirHistorico(page);

    const burbuja = page.getByRole('dialog', { name: P.social.title });
    await expect(burbuja).toBeVisible();
    await burbuja.getByRole('button', { name: P.no }).click();
    await expect(burbuja).toHaveCount(0);
    // Lo apuntado es la edición, y es lo que manda: comprobar solo que la burbuja NO sale tras recargar pasaría
    // igual si tardara en salir.
    expect(await page.evaluate(() => localStorage.getItem('mis-listas-premios-invitacion'))).toBe('2025');

    // Volver otro día a la misma edición: ya está contestada.
    await page.reload();
    await expect(page.locator('.premios-results__podium')).toBeVisible();
    await expect(page.locator('.premios-results__step')).toHaveCount(3);
    await expect(page.getByRole('dialog', { name: P.social.title })).toHaveCount(0);
  });
});
