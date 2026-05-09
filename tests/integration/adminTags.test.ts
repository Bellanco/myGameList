import { test, expect } from '@playwright/test';

test.describe('Admin Tags Flow', () => {
  test('Merge tags on second save', async ({ page }) => {
    // Navigate to the admin tags page
    await page.goto('http://localhost:8000/admin/tags');

    // Add a new tag
    await page.click('text=Add Tag');
    await page.fill('input[name="tagName"]', 'Tag A');
    await page.click('text=Save');
    await expect(page.locator('text=Tag A')).toBeVisible();

    // Add another tag
    await page.click('text=Add Tag');
    await page.fill('input[name="tagName"]', 'Tag B');
    await page.click('text=Save');
    await expect(page.locator('text=Tag B')).toBeVisible();

    // Merge tags on second save
    await page.click('text=Tag A');
    await page.click('text=Merge');
    await page.click('text=Tag B');
    await page.click('text=Save');

    // Verify merged tag
    await expect(page.locator('text=Tag A, Tag B')).toBeVisible();
  });
});