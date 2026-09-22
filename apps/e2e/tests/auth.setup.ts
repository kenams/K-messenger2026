import { test as setup } from '@playwright/test';
import { KENAMS, BOTS, signIn, onAppShell, openTab } from './_helpers';
import { expect } from '@playwright/test';

/**
 * Sign in once per account and stash the session. Every other spec reuses it,
 * so the suite doesn't hammer Neon Auth's rate limit with 18 fresh sign-ins.
 *
 * Also open the Kenams<->Léa direct chat once here, for BOTH accounts, before
 * snapshotting storageState. The E2EE identity keypair (e2ee.ts) lives in
 * localStorage, generated lazily the first time a direct conversation opens —
 * storageState captures localStorage too, so without this step every spec
 * run started from a fresh keypair for each bot, overwriting the other
 * side's cached public key mid-test and permanently breaking decryption for
 * that run's messages (Kenams would encrypt against Léa's now-stale key).
 * Doing the key exchange here once, for both sides, keeps it stable across
 * the whole suite run.
 */
setup('authenticate Kenams', async ({ page }) => {
  await signIn(page, KENAMS);
  expect(await onAppShell(page)).toBe(true);
  await openTab(page, 'Contacts');
  await page.getByText(BOTS.lea.name).first().click();
  await expect(page.getByText(/Connexion sécurisée \(TLS\)|Chiffré de bout en bout/)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.context().storageState({ path: '.auth/kenams.json' });
});

setup('authenticate bot Léa', async ({ page }) => {
  await signIn(page, BOTS.lea);
  expect(await onAppShell(page)).toBe(true);
  await openTab(page, 'Contacts');
  await page.getByText(KENAMS.name).first().click();
  await expect(page.getByText(/Connexion sécurisée \(TLS\)|Chiffré de bout en bout/)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.context().storageState({ path: '.auth/lea.json' });
});
