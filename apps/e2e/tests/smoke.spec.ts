import { test, expect } from '@playwright/test';
import { KENAMS, signIn, openTab, trackConsoleErrors, type TabName } from './_helpers';

const TABS: TabName[] = ['Contacts', 'Chats', 'K-Feed', 'K-Map', 'Moments', 'Moi'];

test('every tab renders with no uncaught console errors', async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await signIn(page, KENAMS);

  for (const tab of TABS) {
    await openTab(page, tab);
    await page.waitForTimeout(600);
  }

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});
