import { test, expect } from '@playwright/test';
import { KENAMS, BOTS, signIn, openTab } from './_helpers';

test.describe('Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, KENAMS);
    await openTab(page, 'Contacts');
  });

  test('searching an existing friend does NOT offer "Ajouter" again', async ({ page }) => {
    await page.getByTestId('contact-search').fill('karim');
    await expect(page.getByText(BOTS.karim.name).first()).toBeVisible();

    // The friend shows under AMIS, not as an addable directory hit.
    await expect(page.getByRole('button', { name: 'Ajouter' })).toHaveCount(0);
  });

  test('the results filter down to the searched name', async ({ page }) => {
    await page.getByTestId('contact-search').fill('chloé');
    await expect(page.getByText(BOTS.chloe.name).first()).toBeVisible();
    await expect(page.getByText(BOTS.karim.name)).toHaveCount(0);
  });

  test('sending a K-Pulse from the list gives feedback', async ({ page }) => {
    // ⚡ button on the first contact row
    await page.getByRole('button', { name: /Envoyer un K-Pulse/ }).first().click();
    await expect(page.getByText(/K-Pulse envoyé|K-Pulse refusé ou limité/)).toBeVisible();
  });
});
