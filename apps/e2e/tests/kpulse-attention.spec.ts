import { test, expect, type WebSocketRoute } from '@playwright/test';
import { openApp, openTab } from './_helpers';

test('returning to the app restores the browser title after a K-Pulse', async ({ page }, testInfo) => {
  let recipient: WebSocketRoute | undefined;
  await page.routeWebSocket(/\/socket\.io\//, (socket) => {
    recipient = socket;
    socket.connectToServer();
  });
  await openApp(page);
  await openTab(page, 'Contacts');
  await expect(page.getByRole('button', { name: /Envoyer un K-Pulse/ }).first()).toBeVisible();
  const originalTitle = await page.title();

  // Model the visibility transition explicitly: headless Chromium does not
  // reliably hide a page when another page is brought to the front.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(recipient).toBeDefined();
  // Inject only into this browser's incoming stream. No pulse is sent to a
  // production user, and the existing two-session spec covers real delivery.
  recipient!.send('42["kpulse:receive",{}]');
  await expect(page.getByText('⚡ K-Pulse reçu !', { exact: true })).toBeVisible();
  await expect.poll(() => page.title()).toContain('K-Pulse reçu');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page).toHaveTitle(originalTitle, { timeout: 2500 });
  await page.screenshot({ path: testInfo.outputPath('kpulse-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('⚡ K-Pulse reçu !', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('kpulse-mobile.png') });
  // Removing the notice's screen must also remove its title timer/listener.
  await openTab(page, 'Moi');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1500);
  await expect(page).toHaveTitle(originalTitle);
});
