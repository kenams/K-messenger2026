import { expect, type Page } from '@playwright/test';

/** Web-test population created by scripts/web-test-populate-runner.mjs (prod). */
export const KENAMS = { email: 'kenams42+kssenger@gmail.com', password: 'Kss--f4BAds_-26', name: 'Kenams' };
export const BOTS = {
  lea: { email: 'kenams42+kss-lea@gmail.com', password: 'KssBot2026!', name: 'Léa Martin' },
  karim: { email: 'kenams42+kss-karim@gmail.com', password: 'KssBot2026!', name: 'Karim Benali' },
  chloe: { email: 'kenams42+kss-chloe@gmail.com', password: 'KssBot2026!', name: 'Chloé Dubois' },
};

const TABS = ['Contacts', 'Chats', 'K-Feed', 'K-Map', 'Moments', 'Moi'] as const;
export type TabName = (typeof TABS)[number];

/** Sign in and wait until the buddy list (or any main tab) is on screen. */
export async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto('/');
  // Already signed in from a persisted session?
  if (await onAppShell(page)) return;

  await page.getByPlaceholder('E-mail').fill(who.email);
  await page.getByPlaceholder(/Mot de passe/).fill(who.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // The web adapter reloads after a successful sign-in; wait for the shell.
  await expect
    .poll(async () => onAppShell(page), { timeout: 30_000, message: 'app shell never appeared after sign-in' })
    .toBe(true);
}

export async function onAppShell(page: Page): Promise<boolean> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 });
    return (await page.getByTestId('tab-Contacts').count()) > 0;
  } catch {
    return false;
  }
}

export async function signOut(page: Page): Promise<void> {
  await openTab(page, 'Moi');
  await page.getByRole('button', { name: /Se déconnecter/ }).click();
  await expect(page.getByPlaceholder('E-mail')).toBeVisible({ timeout: 30_000 });
}

export async function openTab(page: Page, tab: TabName): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
}

/** Fails the test if the page logged an uncaught error / console error. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  const ignore = [
    /useNativeDriver/i,
    /expo-notifications.*not.*supported on web/i,
    /message channel closed/i, // browser-extension noise
    /Download the React DevTools/i,
  ];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (ignore.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => {
    if (ignore.some((re) => re.test(err.message))) return;
    errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}
