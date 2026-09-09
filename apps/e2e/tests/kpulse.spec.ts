import { test, expect } from '@playwright/test';
import { BOTS, openApp, openTab } from './_helpers';

/**
 * Two real sessions (both pre-authenticated): bot Léa fires a K-Pulse at
 * Kenams, and Kenams's screen shows the full-screen burst with her name —
 * while sitting on a tab other than Contacts.
 */
test('an incoming K-Pulse takes over the recipient screen', async ({ browser }) => {
  const kenamsCtx = await browser.newContext({ storageState: '.auth/kenams.json' });
  const botCtx = await browser.newContext({ storageState: '.auth/lea.json' });

  try {
    const kenams = await kenamsCtx.newPage();
    await openApp(kenams);
    await openTab(kenams, 'Moments');

    const bot = await botCtx.newPage();
    await openApp(bot);
    await openTab(bot, 'Contacts');
    await bot.getByTestId('contact-search').fill('kenams');
    await bot.getByRole('button', { name: /Envoyer un K-Pulse/ }).first().click();
    await expect(bot.getByText(/K-Pulse envoyé|K-Pulse refusé ou limité/)).toBeVisible();

    await expect(kenams.getByTestId('kpulse-burst')).toBeVisible({ timeout: 15_000 });
    await expect(kenams.getByText('K-Pulse')).toBeVisible();
    await expect(kenams.getByText(new RegExp(`de ${BOTS.lea.name}`))).toBeVisible();
  } finally {
    await kenamsCtx.close();
    await botCtx.close();
  }
});
