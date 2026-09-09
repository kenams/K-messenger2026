import { test, expect } from '@playwright/test';
import { KENAMS, signIn, openTab } from './_helpers';

test.describe('Moments', () => {
  test('post a text Moment and delete it', async ({ page }) => {
    await signIn(page, KENAMS);
    await openTab(page, 'Moments');

    const text = `E2E moment ${Date.now() % 100000}`;
    await page.getByPlaceholder("Qu'est-ce qui se passe dans ta vie ?").fill(text);
    await page.getByText('Publier le texte pour 24 h').click();

    const card = page.locator('div', { hasText: text }).last();
    await expect(page.getByText(text)).toBeVisible();

    // delete the one we just posted
    await card.getByText('Supprimer').first().click().catch(async () => {
      await page.getByText('Supprimer').first().click();
    });
    await expect(page.getByText('Moment supprimé.')).toBeVisible();
  });
});

test.describe('K-Map', () => {
  test('share a one-time location then revoke it', async ({ page }) => {
    await signIn(page, KENAMS);
    await openTab(page, 'K-Map');

    // pick the first recipient chip, keep approximate precision
    await page.getByText('Chloé Dubois').first().click();
    await page.getByText('Partager ma position · 30 min').click();

    await expect(page.getByText('Position ponctuelle')).toBeVisible({ timeout: 20_000 });

    await page.getByText('Révoquer').first().click();
    await expect(page.getByText('Aucun partage actif')).toBeVisible();
  });
});
