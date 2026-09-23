import { test, expect } from '@playwright/test';
import { BOTS, openApp, openTab } from './_helpers';

/**
 * Records a real voice note (Chromium fake mic device, configured in
 * playwright.config.ts) and sends it in a direct chat; the recipient plays
 * it back. Confirms the hold-to-record → upload → bubble → playback path
 * actually works end to end, not just that the UI renders.
 */
test('records and plays a voice note in a direct chat', async ({ browser }) => {
  const kenamsCtx = await browser.newContext({ storageState: '.auth/kenams.json' });
  const leaCtx = await browser.newContext({ storageState: '.auth/lea.json' });

  try {
    const kenams = await kenamsCtx.newPage();
    await openApp(kenams);
    await openTab(kenams, 'Contacts');
    await kenams.getByText(BOTS.lea.name).first().click();
    await expect(kenams.getByText(/Connexion sécurisée \(TLS\)|Chiffré de bout en bout/)).toBeVisible();

    const mic = kenams.getByLabel('Maintenir pour enregistrer un message vocal');
    await mic.hover();
    await kenams.mouse.down();
    await expect(kenams.getByLabel('Annuler l’enregistrement vocal')).toBeVisible({ timeout: 10_000 });
    await kenams.waitForTimeout(1500);
    await kenams.mouse.up();

    const playButton = kenams.getByLabel('Écouter le message vocal').last();
    await expect(playButton).toBeVisible({ timeout: 20_000 });

    const lea = await leaCtx.newPage();
    await openApp(lea);
    await lea.waitForTimeout(2500);
    await openTab(lea, 'Contacts');
    await lea.getByText('Kenams').first().click();

    const receivedPlay = lea.getByLabel('Écouter le message vocal').last();
    await expect(receivedPlay).toBeVisible({ timeout: 20_000 });
    await receivedPlay.click();
    await expect(lea.getByLabel('Mettre le message vocal en pause').last()).toBeVisible({ timeout: 10_000 });
  } finally {
    await kenamsCtx.close();
    await leaCtx.close();
  }
});
