import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
  test('CRUD operations on game lists', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:8000');

    // Add a new game
    await page.click('text=Add Game');
    await page.fill('input[name="gameName"]', 'Test Game');
    await page.click('text=Save');
    await expect(page.locator('text=Test Game')).toBeVisible();

    // Edit the game
    await page.click('text=Test Game');
    await page.fill('input[name="gameName"]', 'Updated Test Game');
    await page.click('text=Save');
    await expect(page.locator('text=Updated Test Game')).toBeVisible();

    // Migrate the game to another list
    await page.dragAndDrop('text=Updated Test Game', 'text=Completed List');
    await expect(page.locator('text=Updated Test Game')).toBeVisible({ timeout: 5000 });

    // Delete the game with confirmation
    await page.click('text=Updated Test Game');
    await page.click('text=Delete');
    await page.click('text=Confirm');
    await expect(page.locator('text=Updated Test Game')).not.toBeVisible();
  });
});