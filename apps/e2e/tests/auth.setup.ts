import { test as setup } from '@playwright/test';
import { KENAMS, BOTS, signIn, onAppShell } from './_helpers';
import { expect } from '@playwright/test';

/**
 * Sign in once per account and stash the session. Every other spec reuses it,
 * so the suite doesn't hammer Neon Auth's rate limit with 18 fresh sign-ins.
 */
setup('authenticate Kenams', async ({ page }) => {
  await signIn(page, KENAMS);
  expect(await onAppShell(page)).toBe(true);
  await page.context().storageState({ path: '.auth/kenams.json' });
});

setup('authenticate bot Léa', async ({ page }) => {
  await signIn(page, BOTS.lea);
  expect(await onAppShell(page)).toBe(true);
  await page.context().storageState({ path: '.auth/lea.json' });
});
