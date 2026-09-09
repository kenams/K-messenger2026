import { test, expect } from '@playwright/test';
import { KENAMS, signIn, openTab } from './_helpers';

test.describe('Profile & settings persist', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, KENAMS);
    await openTab(page, 'Moi');
  });

  test('editing the status saves and survives a reload', async ({ page }) => {
    const status = `E2E ${Date.now() % 100000}`;
    await page.getByTestId('me-Profil').click();

    const field = page.getByPlaceholder('Quoi de neuf ?');
    await field.fill(status);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // back on the buddy list, header shows the new status
    await expect(page.getByText(status).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(status).first()).toBeVisible({ timeout: 20_000 });
  });

  test('a privacy toggle saves', async ({ page }) => {
    await page.getByTestId('me-Vie privée').click();
    await expect(page.getByText('QUI VOIT QUE JE SUIS EN LIGNE ?')).toBeVisible();

    await page.getByRole('tab', { name: 'Tout le monde' }).first().click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Confidentialité enregistrée.')).toBeVisible();

    // put it back
    await page.getByRole('tab', { name: 'Mes contacts' }).first().click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Confidentialité enregistrée.')).toBeVisible();
  });

  test('account export runs', async ({ page }) => {
    await page.getByTestId('me-Données').click();
    await page.getByRole('button', { name: 'Créer mon export' }).click();
    await expect(page.getByText(/Export complet généré/)).toBeVisible();
  });
});
