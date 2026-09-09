import { test, expect } from '@playwright/test';
import { openApp, openTab } from './_helpers';

test.describe('Profile & settings persist', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openTab(page, 'Moi');
  });

  test('editing the status saves and survives a reload', async ({ page }) => {
    const status = `E2E ${Date.now() % 100000}`;
    await page.getByTestId('me-Profil').click();

    await page.getByPlaceholder('Quoi de neuf ?').fill(status);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(status).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(status).first()).toBeVisible({ timeout: 20_000 });
  });

  test('a privacy toggle saves', async ({ page }) => {
    await page.getByTestId('me-Vie privée').click();
    await expect(page.getByText('QUI VOIT QUE JE SUIS EN LIGNE ?')).toBeVisible();

    await page.getByText('Tout le monde', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Confidentialité enregistrée.')).toBeVisible();

    await page.getByText('Mes contacts', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Confidentialité enregistrée.')).toBeVisible();
  });

  test('account export runs', async ({ page }) => {
    await page.getByTestId('me-Données').click();
    await page.getByRole('button', { name: 'Créer mon export' }).click();
    await expect(page.getByText(/Export complet généré/)).toBeVisible();
  });
});
