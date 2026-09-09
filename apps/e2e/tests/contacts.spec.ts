import { test, expect } from '@playwright/test';
import { BOTS, openApp, openTab } from './_helpers';

test.describe('Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openTab(page, 'Contacts');
  });

  test('searching an existing friend does NOT offer "Ajouter" again', async ({ page }) => {
    await page.getByTestId('contact-search').fill('karim');
    await expect(page.getByText(BOTS.karim.name).first()).toBeVisible();
    await expect(page.getByText('Ajouter', { exact: true })).toHaveCount(0);
  });

  test('the results filter down to the searched name', async ({ page }) => {
    await page.getByTestId('contact-search').fill('chloe');
    await expect(page.getByText(BOTS.chloe.name).first()).toBeVisible();
    await expect(page.getByText(BOTS.karim.name)).toHaveCount(0);
  });

  test('sending a K-Pulse from the list gives feedback', async ({ page }) => {
    await page.getByRole('button', { name: /Envoyer un K-Pulse/ }).first().click();
    await expect(page.getByText(/K-Pulse envoyé|K-Pulse refusé ou limité/)).toBeVisible();
  });
});
