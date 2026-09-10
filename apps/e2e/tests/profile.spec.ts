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

  test('picking an identity accent colour saves and survives a reload', async ({ page }) => {
    await page.getByTestId('me-Profil').click();
    await expect(page.getByText("COULEUR D'IDENTITÉ")).toBeVisible();

    await page.getByRole('button', { name: 'Couleur #7A5BFF' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    // saving returns to the main shell
    await expect(page.getByTestId('tab-Contacts')).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await openTab(page, 'Moi');
    await page.getByTestId('me-Profil').click();
    await expect(page.getByRole('button', { name: 'Couleur #7A5BFF' })).toContainText('✓', { timeout: 20_000 });

    // restore the default azure so the suite is idempotent
    await page.getByRole('button', { name: 'Couleur #1C6FD6' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('tab-Contacts')).toBeVisible({ timeout: 20_000 });
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
