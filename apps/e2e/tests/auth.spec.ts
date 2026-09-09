import { test, expect } from '@playwright/test';
import { KENAMS, signIn, signOut, onAppShell, openTab } from './_helpers';

test.describe('Auth loop', () => {
  test('sign in, session persists across reload, sign out, sign back in', async ({ page }) => {
    await signIn(page, KENAMS);
    expect(await onAppShell(page)).toBe(true);

    // Reload — the persisted session must survive.
    await page.reload();
    await expect
      .poll(() => onAppShell(page), { timeout: 30_000, message: 'session lost on reload' })
      .toBe(true);

    // Sign out — must land on the login screen, never hang on a spinner.
    await signOut(page);
    await expect(page.getByPlaceholder('E-mail')).toBeVisible();

    // Sign back in.
    await signIn(page, KENAMS);
    expect(await onAppShell(page)).toBe(true);
  });

  test('every main tab renders', async ({ page }) => {
    await signIn(page, KENAMS);
    for (const tab of ['Chats', 'K-Feed', 'K-Map', 'Moments', 'Moi', 'Contacts'] as const) {
      await openTab(page, tab);
      // give RN-web a beat to swap the screen
      await page.waitForTimeout(400);
      expect(await onAppShell(page)).toBe(true);
    }
  });
});
