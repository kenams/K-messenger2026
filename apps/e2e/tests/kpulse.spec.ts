import { test, expect } from '@playwright/test';
import { KENAMS, BOTS, signIn, openTab } from './_helpers';

/**
 * Two real browser sessions: a bot fires a K-Pulse at Kenams, and Kenams's
 * screen must show the full-screen burst with the sender's name — from any tab.
 */
test('an incoming K-Pulse takes over the recipient screen', async ({ browser }) => {
  const kenamsCtx = await browser.newContext();
  const botCtx = await browser.newContext();

  try {
    const kenams = await kenamsCtx.newPage();
    await signIn(kenams, KENAMS);
    await openTab(kenams, 'Moments'); // prove it fires globally, not just on Contacts

    const bot = await botCtx.newPage();
    await signIn(bot, BOTS.lea);
    await openTab(bot, 'Contacts');
    await bot.getByTestId('contact-search').fill('kenams');
    await bot.getByRole('button', { name: /Envoyer un K-Pulse/ }).first().click();
    await expect(bot.getByText(/K-Pulse envoyé/)).toBeVisible();

    await expect(kenams.getByTestId('kpulse-burst')).toBeVisible({ timeout: 15_000 });
    await expect(kenams.getByText('K-Pulse')).toBeVisible();
    await expect(kenams.getByText(new RegExp(`de ${BOTS.lea.name}`))).toBeVisible();
  } finally {
    await kenamsCtx.close();
    await botCtx.close();
  }
});
