import { test, expect } from '@playwright/test';
import { BOTS, openApp, openTab } from './_helpers';

/**
 * The whole point of a messenger: two real sessions actually exchange a
 * message. Kenams opens the conversation with bot Léa and sends a line; Léa,
 * sitting in her Contacts tab, opens the thread and sees it. Then she replies
 * and Kenams sees that. Plaintext-over-TLS transport (no native E2EE yet).
 */
test('two people can send and receive messages', async ({ browser }) => {
  const kenamsCtx = await browser.newContext({ storageState: '.auth/kenams.json' });
  const leaCtx = await browser.newContext({ storageState: '.auth/lea.json' });

  try {
    const stamp = Date.now() % 100000;
    const fromKenams = `E2E ping ${stamp}`;
    const fromLea = `E2E pong ${stamp}`;

    const kenams = await kenamsCtx.newPage();
    await openApp(kenams);
    await openTab(kenams, 'Contacts');
    await kenams.getByText(BOTS.lea.name).first().click();
    await expect(kenams.getByText(/Connexion sécurisée \(TLS\)/)).toBeVisible();

    await kenams.getByPlaceholder('Écrire un message…').fill(fromKenams);
    await kenams.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(kenams.getByText(fromKenams)).toBeVisible({ timeout: 15_000 });

    const lea = await leaCtx.newPage();
    await openApp(lea);
    await openTab(lea, 'Contacts');
    await lea.getByText('Kenams').first().click();
    await expect(lea.getByText(fromKenams)).toBeVisible({ timeout: 20_000 });

    await lea.getByPlaceholder('Écrire un message…').fill(fromLea);
    await lea.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(kenams.getByText(fromLea)).toBeVisible({ timeout: 20_000 });
  } finally {
    await kenamsCtx.close();
    await leaCtx.close();
  }
});
