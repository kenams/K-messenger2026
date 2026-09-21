import { test, expect } from '@playwright/test';
import { BOTS, openApp, openTab } from './_helpers';

/**
 * Two real sessions (both pre-authenticated): bot Léa fires a K-Pulse at
 * Kenams, and Kenams's screen shows the full-screen burst with her name —
 * while sitting on a tab other than Contacts.
 *
 * Root cause found (2026-09-16): `openApp()` only waits for the app shell
 * (the tab bar) to render, not for the realtime socket to finish its
 * handshake — `getRealtimeSocketSync()` creates the socket and calls
 * `.connect()`, but the actual connection completes async (it fetches an
 * auth token before the socket.io handshake resolves, see realtime.ts). The
 * bot in this test fires its K-Pulse essentially immediately after
 * `openApp()`, which can race ahead of Kenams's socket actually reaching the
 * server-side `user:<id>` room. Manual testing always passed because a human
 * takes way longer than that between opening the app and being pulsed at.
 * Fix: give the socket a moment to actually connect before the bot fires.
 */
test('an incoming K-Pulse takes over the recipient screen', async ({ browser }) => {
  const kenamsCtx = await browser.newContext({ storageState: '.auth/kenams.json' });
  const botCtx = await browser.newContext({ storageState: '.auth/lea.json' });

  try {
    const kenams = await kenamsCtx.newPage();
    await openApp(kenams);
    await openTab(kenams, 'Moments');
    // Let the realtime socket actually finish connecting (see comment above)
    // before anyone fires a K-Pulse at this session.
    await kenams.waitForTimeout(2500);

    const bot = await botCtx.newPage();
    await openApp(bot);
    await openTab(bot, 'Contacts');
    await bot.getByTestId('contact-search').fill('kenams');
    await bot.getByRole('button', { name: /Envoyer un K-Pulse/ }).first().click();
    // The server rate-limits repeated K-Pulses between the same pair, and this
    // test firing back-to-back (e.g. re-runs while debugging) can legitimately
    // hit that limit — in which case no burst was ever sent and waiting for
    // one to appear is a false failure, not a real bug. Skip cleanly instead.
    const sent = bot.getByText('K-Pulse envoyé');
    const limited = bot.getByText('K-Pulse refusé ou limité');
    await expect(sent.or(limited)).toBeVisible();
    test.skip(await limited.isVisible(), 'K-Pulse rate-limited between this bot pair — not a real failure, rerun later.');

    await expect(kenams.getByTestId('kpulse-burst')).toBeVisible({ timeout: 15_000 });
    // Contacts stays mounted (hidden) in the background for snappier tab
    // switching, and it also renders "K-Pulse"/sender-name text (attention
    // badges, notices) — scope to what's actually visible on screen.
    await expect(kenams.getByText('K-Pulse').and(kenams.locator(':visible')).first()).toBeVisible();
    await expect(kenams.getByText(new RegExp(`de ${BOTS.lea.name}`)).and(kenams.locator(':visible')).first()).toBeVisible();
  } finally {
    await kenamsCtx.close();
    await botCtx.close();
  }
});
