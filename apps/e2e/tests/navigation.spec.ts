import { test, expect } from '@playwright/test';
import { openApp, openTab, onAppShell } from './_helpers';

test.describe('Navigation — no dead ends', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  for (const label of ['Profil', 'Données', 'Groupes', 'Vie privée']) {
    test(`"${label}" opens and the back button returns to Moi`, async ({ page }) => {
      await openTab(page, 'Moi');
      await page.getByTestId(`me-${label}`).click();
      await expect(page.getByTestId('screen-back')).toBeVisible();
      await page.getByTestId('screen-back').click();
      await expect(page.getByRole('button', { name: /Se déconnecter/ })).toBeVisible();
    });
  }

  test('the browser Back button closes a secondary screen instead of leaving the app', async ({ page }) => {
    await openTab(page, 'Moi');
    await page.getByTestId('me-Groupes').click();
    await expect(page.getByTestId('screen-back')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('button', { name: /Se déconnecter/ })).toBeVisible();
    expect(await onAppShell(page)).toBe(true);
  });

  test('opening a conversation shows a back control', async ({ page }) => {
    await openTab(page, 'Contacts');
    await page.getByText('Chloé Dubois').first().click();
    await expect(page.getByText(/Connexion sécurisée \(TLS\)/)).toBeVisible();
    await page.getByText('‹', { exact: true }).first().click();
    await expect(page.getByTestId('contact-search')).toBeVisible();
  });
});
