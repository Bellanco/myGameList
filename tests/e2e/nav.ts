import { expect, type Page } from '@playwright/test';

/**
 * Llegar a una pantalla de Ajustes son DOS toques: la pestaña despliega el menú de sus cuatro grupos y cada
 * grupo tiene su pantalla. Vive aquí y no en cada fichero porque lo necesitan varios recorridos que no van de
 * la navegación —los de logros importan una biblioteca, por ejemplo— y así el día que el menú cambie de forma
 * se toca un sitio y no cinco.
 */
export async function irAAjustes(page: Page, grupo = 'Integración'): Promise<void> {
  await page.getByRole('button', { name: /^Ajustes/ }).first().click();
  const menu = page.locator('.settings-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: grupo }).click();
  await expect(menu).toBeHidden();
}
