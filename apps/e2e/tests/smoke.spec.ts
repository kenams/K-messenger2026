import { test, expect } from '@playwright/test';
import { openTab, onAppShell, trackConsoleErrors, type TabName } from './_helpers';

const TABS: TabName[] = ['Contacts', 'Chats', 'K-Feed', 'K-Map', 'Moments', 'Moi'];

test('every tab renders with no uncaught console errors', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto('/');
  await expect.poll(() => onAppShell(page), { timeout: 20_000 }).toBe(true);

  for (const tab of TABS) {
    await openTab(page, tab);
    await page.waitForTimeout(600);
  }

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});
